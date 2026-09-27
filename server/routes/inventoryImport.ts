import { Router, Request, Response } from 'express';
import express from 'express';
import { db } from '../db';
import crypto from 'node:crypto';
import readXlsxFile from 'read-excel-file/node';

export const inventoryImportRouter = Router();

/* -------------------------------------------------------------------------
 * Column handling
 * ---------------------------------------------------------------------- */

/** Canonical field -> the header spellings we accept for it. */
const FIELD_ALIASES: Record<string, string[]> = {
  sku: ['sku', 'skucode', 'code', 'itemcode', 'productcode'],
  name: ['name', 'productname', 'description', 'itemname', 'product'],
  category: ['category', 'type', 'itemtype'],
  unit: ['unit', 'uom', 'unitofmeasure'],
  currentStock: ['currentstock', 'stock', 'qty', 'quantity', 'onhand', 'stockonhand', 'count'],
  minSafetyStock: ['minsafetystock', 'safetystock', 'minstock', 'minimum'],
  reorderPoint: ['reorderpoint', 'reorderlevel', 'reorder', 'reorderalert'],
  leadTimeDays: ['leadtimedays', 'leadtime', 'leaddays'],
  fobCostUSD: ['fobcostusd', 'fobcost', 'fob', 'fobprice'],
  costPerUnit: ['costperunit', 'cost', 'unitcost'],
  landedCostPerUnit: ['landedcostperunit', 'landedcost', 'landed'],
  cbmPerUnit: ['cbmperunit', 'cbm', 'volume'],
  weightKgPerUnit: ['weightkgperunit', 'weightkg', 'weight'],
  location: ['location', 'warehouselocation', 'bin', 'aisle'],
  supplierName: ['suppliername', 'supplier', 'vendor'],
  barcode: ['barcode', 'ean', 'upc', 'gtin']
};

const NUMERIC_FIELDS = new Set([
  'currentStock', 'minSafetyStock', 'reorderPoint', 'leadTimeDays',
  'fobCostUSD', 'costPerUnit', 'landedCostPerUnit', 'cbmPerUnit', 'weightKgPerUnit'
]);

const INTEGER_FIELDS = new Set(['currentStock', 'minSafetyStock', 'reorderPoint', 'leadTimeDays']);

const VALID_CATEGORIES = ['blank', 'packaging', 'consumable'];

const normaliseHeader = (h: string) => String(h ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Map each spreadsheet column index to a canonical field name, if recognised. */
function mapHeaders(headers: string[]) {
  const mapping: Record<number, string> = {};
  const unknown: string[] = [];

  headers.forEach((raw, i) => {
    const key = normaliseHeader(raw);
    if (!key) return;
    const field = Object.keys(FIELD_ALIASES).find(f => FIELD_ALIASES[f].includes(key));
    if (field) mapping[i] = field;
    else unknown.push(String(raw));
  });

  return { mapping, unknown };
}

/* -------------------------------------------------------------------------
 * File parsing
 * ---------------------------------------------------------------------- */

/** Minimal RFC-4180 CSV reader: quoted fields, escaped quotes, CRLF. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let inQuotes = false;

  // Strip a UTF-8 BOM, which Excel writes and which corrupts the first header
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { value += '"'; i++; }
        else inQuotes = false;
      } else value += ch;
      continue;
    }
    if (ch === '"') { inQuotes = true; continue; }
    if (ch === ',') { row.push(value); value = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { row.push(value); rows.push(row); row = []; value = ''; continue; }
    value += ch;
  }
  if (value.length > 0 || row.length > 0) { row.push(value); rows.push(row); }

  return rows.filter(r => r.some(c => String(c).trim() !== ''));
}

interface ParsedUpload {
  grid: string[][];
  sheetNames: string[];
  sheetUsed: string | null;
}

async function parseUpload(buffer: Buffer, filename: string, sheet?: string): Promise<ParsedUpload> {
  if (!/\.xlsx?$/i.test(filename)) {
    return { grid: parseCsv(buffer.toString('utf8')), sheetNames: [], sheetUsed: null };
  }

  // read-excel-file returns either rows, or [{ sheet, data }] per worksheet
  const raw = (await readXlsxFile(buffer)) as any;
  const isSheetList = Array.isArray(raw) && raw.length > 0 && raw[0] && !Array.isArray(raw[0]) && 'data' in raw[0];

  let rows: unknown[][];
  let sheetNames: string[] = [];
  let sheetUsed: string | null = null;

  if (isSheetList) {
    sheetNames = raw.map((s: any) => String(s.sheet));
    const chosen = (sheet && raw.find((s: any) => String(s.sheet) === sheet)) || raw[0];
    sheetUsed = String(chosen.sheet);
    rows = chosen.data || [];
  } else {
    rows = raw as unknown[][];
  }

  const grid = rows.map(r =>
    (Array.isArray(r) ? r : []).map(cell => (cell === null || cell === undefined ? '' : String(cell)))
  );
  return { grid, sheetNames, sheetUsed };
}

/* -------------------------------------------------------------------------
 * Row validation
 * ---------------------------------------------------------------------- */

interface ParsedRow {
  rowNumber: number;
  values: Record<string, any>;
  errors: string[];
  warnings: string[];
  action: 'create' | 'update' | 'skip';
  existingId?: string;
}

function buildRows(grid: string[][], mode: 'catalogue' | 'stocktake') {
  if (grid.length === 0) return { rows: [] as ParsedRow[], mapping: {}, unknown: [], headers: [] as string[] };

  const headers = grid[0].map(h => String(h ?? '').trim());
  const { mapping, unknown } = mapHeaders(headers);
  const mapped = Object.values(mapping);

  const rows: ParsedRow[] = [];
  const seenSkus = new Set<string>();

  for (let r = 1; r < grid.length; r++) {
    const raw = grid[r];
    const values: Record<string, any> = {};
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const [idxStr, field] of Object.entries(mapping)) {
      const cell = String(raw[Number(idxStr)] ?? '').trim();
      if (cell === '') continue;

      if (NUMERIC_FIELDS.has(field)) {
        // Tolerate figures pasted from Excel: "1,250", "£0.58", "0.58 "
        const cleaned = cell.replace(/[£$,\s]/g, '');
        const num = Number(cleaned);
        if (!Number.isFinite(num)) {
          errors.push(`${field}: "${cell}" is not a number`);
          continue;
        }
        if (num < 0) { errors.push(`${field}: cannot be negative`); continue; }
        if (INTEGER_FIELDS.has(field) && !Number.isInteger(num)) {
          warnings.push(`${field}: ${num} rounded to ${Math.round(num)}`);
          values[field] = Math.round(num);
          continue;
        }
        values[field] = num;
      } else if (field === 'category') {
        const c = cell.toLowerCase();
        if (!VALID_CATEGORIES.includes(c)) {
          errors.push(`category: "${cell}" must be one of ${VALID_CATEGORIES.join(', ')}`);
          continue;
        }
        values[field] = c;
      } else {
        values[field] = cell;
      }
    }

    const sku = String(values.sku ?? '').trim();
    if (!sku) errors.push('sku: required');
    else if (seenSkus.has(sku.toLowerCase())) errors.push(`sku: "${sku}" appears more than once in this file`);
    else seenSkus.add(sku.toLowerCase());

    const existing = sku
      ? (db.prepare('SELECT id, current_stock FROM inventory_items WHERE sku = ?').get(sku) as any)
      : undefined;

    let action: ParsedRow['action'] = existing ? 'update' : 'create';

    if (mode === 'stocktake') {
      if (!existing) {
        errors.push(`sku: "${sku}" is not in the catalogue — import it as a catalogue file first`);
        action = 'skip';
      }
      if (values.currentStock === undefined) errors.push('currentStock: required for a stocktake');
    } else {
      // Creating a brand new item needs enough to be a valid record
      if (!existing) {
        if (!values.name) errors.push('name: required for a new SKU');
        if (!values.category) errors.push('category: required for a new SKU');
      }
      if (values.currentStock !== undefined) {
        warnings.push('currentStock ignored in catalogue mode — use a stocktake import to change stock');
        delete values.currentStock;
      }
    }

    if (errors.length) action = 'skip';

    rows.push({ rowNumber: r + 1, values, errors, warnings, action, existingId: existing?.id });
  }

  return { rows, mapping, unknown, headers, mapped };
}

/* -------------------------------------------------------------------------
 * Routes
 * ---------------------------------------------------------------------- */

const rawUpload = express.raw({ type: '*/*', limit: '12mb' });

/** Parse and validate an upload without writing anything. */
inventoryImportRouter.post('/import/preview', rawUpload, async (req: Request, res: Response) => {
  try {
    const filename = String(req.query.filename || 'upload.csv');
    const mode = (String(req.query.mode || 'catalogue') as 'catalogue' | 'stocktake');
    if (!['catalogue', 'stocktake'].includes(mode)) {
      return res.status(400).json({ error: 'mode must be catalogue or stocktake' });
    }
    const buffer = req.body as Buffer;
    if (!buffer || buffer.length === 0) return res.status(400).json({ error: 'No file received' });

    const { grid, sheetNames, sheetUsed } = await parseUpload(buffer, filename, req.query.sheet as string | undefined);
    if (grid.length === 0) return res.status(400).json({ error: 'The file has no rows' });
    if (grid.length === 1) return res.status(400).json({ error: 'The file has headers but no data rows' });

    const { rows, unknown, headers, mapped } = buildRows(grid, mode);

    if (!mapped?.includes('sku')) {
      return res.status(400).json({
        error: 'No SKU column found. The file needs a column named SKU (or Code / Item Code).',
        headersSeen: headers
      });
    }

    res.json({
      mode,
      filename,
      sheetNames,
      sheetUsed,
      headers,
      recognisedFields: mapped,
      ignoredColumns: unknown,
      totalRows: rows.length,
      toCreate: rows.filter(r => r.action === 'create').length,
      toUpdate: rows.filter(r => r.action === 'update').length,
      toSkip: rows.filter(r => r.action === 'skip').length,
      withWarnings: rows.filter(r => r.warnings.length > 0).length,
      rows
    });
  } catch (err: any) {
    res.status(400).json({ error: `Could not read the file: ${err.message}` });
  }
});

/** Apply a previewed import. Rows with errors are never written. */
inventoryImportRouter.post('/import/commit', express.json({ limit: '12mb' }), (req: Request, res: Response) => {
  try {
    const { mode, rows, operatorName = 'Import' } = req.body as {
      mode: 'catalogue' | 'stocktake';
      rows: ParsedRow[];
      operatorName?: string;
    };

    if (!['catalogue', 'stocktake'].includes(mode)) {
      return res.status(400).json({ error: 'mode must be catalogue or stocktake' });
    }
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'No rows to import' });
    }

    const usable = rows.filter(r => r.action !== 'skip' && (!r.errors || r.errors.length === 0));
    if (usable.length === 0) {
      return res.status(400).json({ error: 'Every row has an error — nothing to import' });
    }

    const now = new Date().toISOString();
    let created = 0;
    let updated = 0;
    let stockAdjusted = 0;

    db.exec('BEGIN');
    try {
      for (const row of usable) {
        const v = row.values || {};
        const sku = String(v.sku).trim();
        const existing = db.prepare('SELECT * FROM inventory_items WHERE sku = ?').get(sku) as any;

        if (mode === 'stocktake') {
          if (!existing) continue;
          const counted = Number(v.currentStock);
          const delta = counted - existing.current_stock;
          if (delta === 0) continue;

          db.prepare('UPDATE inventory_items SET current_stock = ?, updated_at = ? WHERE id = ?')
            .run(counted, now, existing.id);

          // A stocktake is a ledger event, not a silent overwrite
          db.prepare(`
            INSERT INTO stock_movements (
              id, item_id, sku, item_name, movement_type, quantity_delta,
              resulting_stock, unit_cost, reference_id, operator_name, notes, created_at
            ) VALUES (?, ?, ?, ?, 'stocktake', ?, ?, ?, 'IMPORT', ?, ?, ?)
          `).run(
            `mov-${crypto.randomUUID().slice(0, 8)}`,
            existing.id, existing.sku, existing.name,
            delta, counted,
            existing.landed_cost_per_unit || existing.cost_per_unit || 0,
            operatorName,
            `Stocktake import: counted ${counted}, was ${existing.current_stock}`,
            now
          );
          stockAdjusted++;
          updated++;
          continue;
        }

        // Catalogue mode
        if (existing) {
          db.prepare(`
            UPDATE inventory_items SET
              name = COALESCE(?, name), category = COALESCE(?, category),
              unit = COALESCE(?, unit), min_safety_stock = COALESCE(?, min_safety_stock),
              reorder_point = COALESCE(?, reorder_point), lead_time_days = COALESCE(?, lead_time_days),
              fob_cost_usd = COALESCE(?, fob_cost_usd), cost_per_unit = COALESCE(?, cost_per_unit),
              landed_cost_per_unit = COALESCE(?, landed_cost_per_unit),
              cbm_per_unit = COALESCE(?, cbm_per_unit), weight_kg_per_unit = COALESCE(?, weight_kg_per_unit),
              location = COALESCE(?, location), supplier_name = COALESCE(?, supplier_name),
              barcode = COALESCE(?, barcode), updated_at = ?
            WHERE id = ?
          `).run(
            v.name ?? null, v.category ?? null, v.unit ?? null,
            v.minSafetyStock ?? null, v.reorderPoint ?? null, v.leadTimeDays ?? null,
            v.fobCostUSD ?? null, v.costPerUnit ?? null, v.landedCostPerUnit ?? null,
            v.cbmPerUnit ?? null, v.weightKgPerUnit ?? null,
            v.location ?? null, v.supplierName ?? null, v.barcode ?? null,
            now, existing.id
          );
          updated++;
        } else {
          db.prepare(`
            INSERT INTO inventory_items (
              id, sku, name, category, unit, current_stock, reserved_stock,
              min_safety_stock, reorder_point, lead_time_days, fob_cost_usd,
              cost_per_unit, landed_cost_per_unit, cbm_per_unit, weight_kg_per_unit,
              location, supplier_name, barcode, daily_burn_rate, last_restocked_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, null, ?)
          `).run(
            `item-${crypto.randomUUID().slice(0, 8)}`,
            sku, v.name, v.category, v.unit ?? 'pcs',
            v.minSafetyStock ?? 0, v.reorderPoint ?? 0, v.leadTimeDays ?? 30,
            v.fobCostUSD ?? 0, v.costPerUnit ?? 0, v.landedCostPerUnit ?? 0,
            v.cbmPerUnit ?? 0, v.weightKgPerUnit ?? 0,
            v.location ?? 'Warehouse', v.supplierName ?? 'Supplier', v.barcode ?? null,
            now
          );
          created++;
        }
      }
      db.exec('COMMIT');
    } catch (txErr) {
      db.exec('ROLLBACK');
      throw txErr;
    }

    res.json({
      success: true,
      created,
      updated,
      stockAdjusted,
      skipped: rows.length - usable.length,
      message:
        mode === 'stocktake'
          ? `Stocktake applied: ${stockAdjusted} SKU${stockAdjusted === 1 ? '' : 's'} adjusted, each written to the ledger.`
          : `Catalogue import: ${created} created, ${updated} updated.`
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** A template file so people know exactly which columns are read. */
inventoryImportRouter.get('/import/template', (req: Request, res: Response) => {
  const mode = String(req.query.mode || 'catalogue');
  const headers =
    mode === 'stocktake'
      ? ['SKU', 'Current Stock']
      : [
          'SKU', 'Name', 'Category', 'Unit', 'Min Safety Stock', 'Reorder Point',
          'Lead Time Days', 'FOB Cost USD', 'Cost Per Unit', 'Landed Cost Per Unit',
          'CBM Per Unit', 'Weight Kg Per Unit', 'Location', 'Supplier Name', 'Barcode'
        ];
  const example =
    mode === 'stocktake'
      ? ['BLANK-MUG-11-WHT', '4800']
      : [
          'BLANK-MUG-11-WHT', '11oz Ceramic Mug - Gloss White', 'blank', 'pcs', '3000', '5000',
          '45', '0.44', '0.35', '0.58', '0.0016', '0.35', 'Warehouse Bay 1', 'Zibo Ceramics', '506019283001'
        ];

  const csv = `${headers.join(',')}\n${example.join(',')}\n`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="printberry-${mode}-template.csv"`);
  res.send(csv);
});
