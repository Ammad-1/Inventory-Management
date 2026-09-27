import { Router, Request, Response } from 'express';
import { db } from '../db';
import crypto from 'node:crypto';

export const inventoryRouter = Router();

// GET all items
inventoryRouter.get('/', (req: Request, res: Response) => {
  try {
    const stmt = db.prepare(`
      SELECT 
        id, sku, name, category, unit,
        current_stock as currentStock,
        reserved_stock as reservedStock,
        min_safety_stock as minSafetyStock,
        reorder_point as reorderPoint,
        lead_time_days as leadTimeDays,
        fob_cost_usd as fobCostUSD,
        cost_per_unit as costPerUnit,
        landed_cost_per_unit as landedCostPerUnit,
        cbm_per_unit as cbmPerUnit,
        weight_kg_per_unit as weightKgPerUnit,
        location,
        supplier_name as supplierName,
        barcode,
        daily_burn_rate as dailyBurnRate,
        last_restocked_at as lastRestockedAt,
        updated_at as updatedAt
      FROM inventory_items
      ORDER BY category ASC, name ASC
    `);
    const items = stmt.all();
    res.json(items);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET stock movements audit ledger
inventoryRouter.get('/movements', (req: Request, res: Response) => {
  try {
    const stmt = db.prepare(`
      SELECT 
        id,
        item_id as itemId,
        sku,
        item_name as itemName,
        movement_type as movementType,
        quantity_delta as quantityDelta,
        resulting_stock as resultingStock,
        unit_cost as unitCost,
        reference_id as referenceId,
        defect_reason as defectReason,
        operator_name as operatorName,
        notes,
        created_at as createdAt
      FROM stock_movements
      ORDER BY created_at DESC
      LIMIT 100
    `);
    const movements = stmt.all();
    res.json(movements);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET month-end stock valuation history, derived from the movement ledger.
// Each point is the sum over items of (stock after the last movement at or before
// that month end) x (the unit cost recorded on that movement).
inventoryRouter.get('/valuation-history', (req: Request, res: Response) => {
  try {
    const months = Math.min(24, Math.max(2, Number(req.query.months) || 6));

    const valuationAt = db.prepare(`
      SELECT COALESCE(SUM(resulting_stock * unit_cost), 0) AS valuation
      FROM (
        SELECT resulting_stock, unit_cost,
               ROW_NUMBER() OVER (
                 PARTITION BY item_id ORDER BY created_at DESC, rowid DESC
               ) AS rn
        FROM stock_movements
        WHERE created_at <= ?
      )
      WHERE rn = 1
    `);

    const now = new Date();
    const points: { label: string; date: string; valuation: number }[] = [];

    for (let i = months - 1; i >= 0; i--) {
      // End of the month that is `i` months back; the newest point is "now"
      const boundary = i === 0
        ? now
        : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 0, 23, 59, 59));

      const row = valuationAt.get(boundary.toISOString()) as { valuation: number };

      points.push({
        label: boundary.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' }),
        date: boundary.toISOString().slice(0, 10),
        valuation: Number((row?.valuation || 0).toFixed(2))
      });
    }

    const movementCount = (db.prepare('SELECT COUNT(*) AS c FROM stock_movements').get() as { c: number }).c;

    // Month-over-month change. Null when the prior month has no baseline to
    // compare against, so the UI can omit the badge rather than invent a number.
    const previous = points[points.length - 2]?.valuation || 0;
    const latest = points[points.length - 1]?.valuation || 0;
    const changePercent = previous > 0
      ? Number((((latest - previous) / previous) * 100).toFixed(1))
      : null;

    res.json({
      points,
      movementCount,
      // Two or more distinct non-zero points are needed before a trend line means anything
      hasHistory: points.filter(p => p.valuation > 0).length >= 2,
      changePercent
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST create item
inventoryRouter.post('/', (req: Request, res: Response) => {
  try {
    const {
      sku, name, category, unit = 'pcs', currentStock = 0,
      minSafetyStock = 0, reorderPoint = 0, leadTimeDays = 30,
      fobCostUSD = 0, costPerUnit = 0, landedCostPerUnit = 0,
      cbmPerUnit = 0, weightKgPerUnit = 0, location = 'Warehouse',
      supplierName = 'Supplier'
    } = req.body;

    if (!sku || !String(sku).trim()) return res.status(400).json({ error: 'SKU is required' });
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Product name is required' });
    if (!['blank', 'packaging', 'consumable'].includes(category)) {
      return res.status(400).json({ error: 'Category must be blank, packaging or consumable' });
    }

    const clash = db.prepare('SELECT id, name FROM inventory_items WHERE sku = ?').get(String(sku).trim()) as any;
    if (clash) {
      return res.status(409).json({
        error: `SKU ${String(sku).trim()} already exists — it belongs to "${clash.name}". Edit that item, or use a different SKU.`
      });
    }

    const id = `item-${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO inventory_items (
        id, sku, name, category, unit, current_stock, reserved_stock,
        min_safety_stock, reorder_point, lead_time_days, fob_cost_usd,
        cost_per_unit, landed_cost_per_unit, cbm_per_unit, weight_kg_per_unit,
        location, supplier_name, daily_burn_rate, last_restocked_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `);

    stmt.run(
      id, sku, name, category, unit, currentStock,
      minSafetyStock, reorderPoint, leadTimeDays, fobCostUSD,
      costPerUnit, landedCostPerUnit, cbmPerUnit, weightKgPerUnit,
      location, supplierName, now, now
    );

    // If starting with stock, log movement
    if (currentStock > 0) {
      const movStmt = db.prepare(`
        INSERT INTO stock_movements (
          id, item_id, sku, item_name, movement_type, quantity_delta,
          resulting_stock, unit_cost, reference_id, operator_name, notes, created_at
        ) VALUES (?, ?, ?, ?, 'stocktake', ?, ?, ?, 'INIT', 'Admin', 'Initial stock setup', ?)
      `);
      movStmt.run(`mov-${crypto.randomUUID().slice(0, 8)}`, id, sku, name, currentStock, currentStock, landedCostPerUnit || costPerUnit, now);
    }

    res.status(201).json({ id, message: 'Item created' });
  } catch (err: any) {
    const msg = /UNIQUE constraint failed: inventory_items\.sku/.test(err.message)
      ? 'That SKU already exists.'
      : /CHECK constraint failed/.test(err.message)
      ? 'One of the values is not allowed for its field.'
      : err.message;
    res.status(400).json({ error: msg });
  }
});

// PUT update item
inventoryRouter.put('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      sku, name, category, unit, minSafetyStock, reorderPoint,
      leadTimeDays, fobCostUSD, costPerUnit, landedCostPerUnit,
      cbmPerUnit, weightKgPerUnit, location, supplierName
    } = req.body;

    const now = new Date().toISOString();
    const stmt = db.prepare(`
      UPDATE inventory_items SET
        sku = COALESCE(?, sku),
        name = COALESCE(?, name),
        category = COALESCE(?, category),
        unit = COALESCE(?, unit),
        min_safety_stock = COALESCE(?, min_safety_stock),
        reorder_point = COALESCE(?, reorder_point),
        lead_time_days = COALESCE(?, lead_time_days),
        fob_cost_usd = COALESCE(?, fob_cost_usd),
        cost_per_unit = COALESCE(?, cost_per_unit),
        landed_cost_per_unit = COALESCE(?, landed_cost_per_unit),
        cbm_per_unit = COALESCE(?, cbm_per_unit),
        weight_kg_per_unit = COALESCE(?, weight_kg_per_unit),
        location = COALESCE(?, location),
        supplier_name = COALESCE(?, supplier_name),
        updated_at = ?
      WHERE id = ?
    `);

    // node:sqlite rejects `undefined`, and a partial update leaves absent keys
    // undefined - COALESCE needs an explicit null for "leave this column alone".
    const n = (v: any): any => (v === undefined ? null : v);

    const existing = db.prepare('SELECT id FROM inventory_items WHERE id = ?').get(id);
    if (!existing) return res.status(404).json({ error: 'Item not found' });

    if (category !== undefined && !['blank', 'packaging', 'consumable'].includes(category)) {
      return res.status(400).json({ error: 'category must be blank, packaging or consumable' });
    }

    stmt.run(
      n(sku), n(name), n(category), n(unit), n(minSafetyStock), n(reorderPoint),
      n(leadTimeDays), n(fobCostUSD), n(costPerUnit), n(landedCostPerUnit),
      n(cbmPerUnit), n(weightKgPerUnit), n(location), n(supplierName),
      now, id
    );

    res.json({ message: 'Item updated' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE an item. Refused while it still holds stock or has ledger history,
// because removing it would orphan movements and silently lose valuation.
inventoryRouter.delete('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const item = db.prepare('SELECT id, sku, current_stock FROM inventory_items WHERE id = ?').get(id) as any;
    if (!item) return res.status(404).json({ error: 'Item not found' });

    if (item.current_stock > 0) {
      return res.status(400).json({
        error: `${item.sku} still has ${item.current_stock} in stock. Adjust it to zero before deleting.`
      });
    }

    const movements = (db.prepare('SELECT COUNT(*) as c FROM stock_movements WHERE item_id = ?').get(id) as any).c;
    if (movements > 0) {
      return res.status(400).json({
        error: `${item.sku} has ${movements} ledger movement${movements === 1 ? '' : 's'} and cannot be deleted without breaking the audit trail.`
      });
    }

    const recipes = (db.prepare(
      'SELECT COUNT(*) as c FROM recipes WHERE blank_item_id = ? OR packaging_item_id = ?'
    ).get(id, id) as any).c;
    if (recipes > 0) {
      return res.status(400).json({ error: `${item.sku} is used by ${recipes} recipe${recipes === 1 ? '' : 's'}.` });
    }

    db.prepare('DELETE FROM inventory_items WHERE id = ?').run(id);
    res.json({ success: true, message: `${item.sku} deleted` });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST quick stock adjustment
inventoryRouter.post('/:id/adjust', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { qtyDelta, reason = 'Manual count adjustment', operatorName = 'Warehouse Staff' } = req.body;

    const getItem = db.prepare('SELECT id, sku, name, current_stock, landed_cost_per_unit, cost_per_unit FROM inventory_items WHERE id = ?');
    const item = getItem.get(id) as any;

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const newStock = Math.max(0, item.current_stock + Number(qtyDelta));
    const now = new Date().toISOString();

    db.prepare('UPDATE inventory_items SET current_stock = ?, updated_at = ? WHERE id = ?')
      .run(newStock, now, id);

    db.prepare(`
      INSERT INTO stock_movements (
        id, item_id, sku, item_name, movement_type, quantity_delta,
        resulting_stock, unit_cost, reference_id, operator_name, notes, created_at
      ) VALUES (?, ?, ?, ?, 'manual_adjust', ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `mov-${crypto.randomUUID().slice(0, 8)}`,
      item.id,
      item.sku,
      item.name,
      Number(qtyDelta),
      newStock,
      item.landed_cost_per_unit || item.cost_per_unit,
      'ADJUST',
      operatorName,
      reason,
      now
    );

    res.json({ newStock, message: 'Stock adjusted' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST factory floor scrap / defect logging
inventoryRouter.post('/scrap', (req: Request, res: Response) => {
  try {
    const { itemId, quantity, defectReason, jobReference, operatorName = 'Machine Operator', notes } = req.body;

    if (!itemId || !quantity || quantity <= 0) {
      return res.status(400).json({ error: 'Valid item and quantity required' });
    }

    const getItem = db.prepare('SELECT id, sku, name, current_stock, landed_cost_per_unit, cost_per_unit FROM inventory_items WHERE id = ?');
    const item = getItem.get(itemId) as any;

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const scrapQty = Number(quantity);
    const newStock = Math.max(0, item.current_stock - scrapQty);
    const now = new Date().toISOString();

    db.prepare('UPDATE inventory_items SET current_stock = ?, updated_at = ? WHERE id = ?')
      .run(newStock, now, item.id);

    const movId = `mov-${crypto.randomUUID().slice(0, 8)}`;
    const refId = jobReference ? `JOB-${jobReference}` : `SCRAP-${now.slice(0, 10)}`;

    db.prepare(`
      INSERT INTO stock_movements (
        id, item_id, sku, item_name, movement_type, quantity_delta,
        resulting_stock, unit_cost, reference_id, defect_reason, operator_name, notes, created_at
      ) VALUES (?, ?, ?, ?, 'scrap_defect', ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      movId,
      item.id,
      item.sku,
      item.name,
      -scrapQty,
      newStock,
      item.landed_cost_per_unit || item.cost_per_unit,
      refId,
      defectReason || 'general_damage',
      operatorName,
      notes || `Logged scrap defect: ${defectReason}`,
      now
    );

    res.json({
      success: true,
      scrappedQuantity: scrapQty,
      newStock,
      defectReason,
      message: `Successfully logged ${scrapQty} scrapped units of ${item.sku}`
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
