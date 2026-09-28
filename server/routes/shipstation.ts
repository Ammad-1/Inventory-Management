import { Router, Request, Response } from 'express';
import { db } from '../db';
import crypto from 'node:crypto';

/**
 * ShipStation integration.
 *
 * ShipStation already aggregates every sales channel the business sells on
 * (Shopify, Amazon, eBay, TikTok and more) and normalises a SKU onto each
 * order line. That makes it a single source for order intake, and avoids
 * building — and maintaining — a separate integration per marketplace.
 *
 * WHY V1, GIVEN V1 IS DEPRECATED
 *
 * ShipStation's docs state the V1 API "is deprecated and will be removed in
 * the future". We use it anyway because V2 has no replacement for what we
 * need: its own docs say the Sales Order "is not currently represented in
 * full in the API". V2 is the Shipping API — rates, labels, batches,
 * manifests.
 *
 * The nearest V2 equivalent is GET /v2/shipments, which does carry items with
 * SKUs and a sales_order_id. But a shipment is not an order: one shipment can
 * combine items from several sales orders, and its statuses (pending,
 * processing, label_purchased) do not map onto the "Awaiting Shipment" queue
 * the warehouse actually works from.
 *
 * So: V1 until V2 exposes Sales Orders. Every call goes through ssFetch()
 * below, so switching is that one function plus the response mapping, not a
 * rewrite. Worth re-checking the V2 docs periodically.
 */
export const shipstationRouter = Router();

// V1 host. V2 lives at https://api.shipstation.com/v2 and authenticates with
// an `API-Key` header rather than Basic auth.
const API = 'https://ssapi.shipstation.com';

/** Statuses at which stock may be deducted. */
const DEDUCTABLE_STATUSES = ['awaiting_shipment', 'shipped'] as const;
type DeductStatus = (typeof DEDUCTABLE_STATUSES)[number];

const getSettings = () =>
  db.prepare('SELECT * FROM shipstation_settings WHERE id = ?').get('primary') as any;

/** Basic auth per ShipStation V1: base64("key:secret"). */
function authHeader(): string {
  const s = getSettings();
  if (!s?.api_key || !s?.api_secret) throw new Error('ShipStation API key and secret are required');
  return 'Basic ' + Buffer.from(`${s.api_key}:${s.api_secret}`).toString('base64');
}

/**
 * Call ShipStation, respecting its 40 requests/minute limit.
 * On a 429 we wait for the window ShipStation reports rather than guessing.
 */
async function ssFetch(path: string, attempt = 0): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' }
  });

  if (res.status === 401) throw new Error('ShipStation rejected the API key and secret.');
  if (res.status === 429) {
    const wait = Number(res.headers.get('X-Rate-Limit-Reset')) || 60;
    if (attempt >= 2) throw new Error(`ShipStation rate limit reached. Try again in ${wait}s.`);
    await new Promise(r => setTimeout(r, Math.min(wait, 60) * 1000));
    return ssFetch(path, attempt + 1);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ShipStation returned ${res.status}: ${text.slice(0, 200)}`);
  }

  const remaining = Number(res.headers.get('X-Rate-Limit-Remaining'));
  // Ease off before hitting the wall on a multi-page sync
  if (Number.isFinite(remaining) && remaining <= 2) {
    await new Promise(r => setTimeout(r, 2000));
  }
  return res.json();
}

/** Resolve what stock a sold SKU consumes: explicit map, then exact SKU. */
function resolveStockForSku(sku: string | null | undefined) {
  if (!sku) return { blankItemId: null, packagingItemId: null, unitsPerSale: 1, via: 'none' as const };

  const mapped = db.prepare('SELECT * FROM channel_sku_map WHERE sku = ?').get(sku) as any;
  if (mapped) {
    return {
      blankItemId: mapped.blank_item_id || null,
      packagingItemId: mapped.packaging_item_id || null,
      unitsPerSale: mapped.units_per_sale || 1,
      via: 'mapping' as const
    };
  }

  const direct = db.prepare('SELECT id FROM inventory_items WHERE sku = ?').get(sku) as any;
  if (direct) return { blankItemId: direct.id, packagingItemId: null, unitsPerSale: 1, via: 'exact_sku' as const };

  return { blankItemId: null, packagingItemId: null, unitsPerSale: 1, via: 'none' as const };
}

/* ------------------------------------------------------------------ settings */

shipstationRouter.get('/settings', (_req: Request, res: Response) => {
  try {
    const s = getSettings();
    res.json({
      hasApiKey: !!s?.api_key,
      hasApiSecret: !!s?.api_secret,
      connected: !!(s?.api_key && s?.api_secret),
      accountName: s?.account_name || '',
      autoDeduct: !!s?.auto_deduct,
      deductOnStatus: s?.deduct_on_status || 'awaiting_shipment',
      connectedAt: s?.connected_at || null,
      lastSyncedAt: s?.last_synced_at || null,
      stores: db.prepare('SELECT store_id as storeId, store_name as storeName, marketplace, active FROM shipstation_stores ORDER BY store_name ASC').all()
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

shipstationRouter.put('/settings', (req: Request, res: Response) => {
  try {
    const { apiKey, apiSecret, autoDeduct, deductOnStatus } = req.body || {};

    if (deductOnStatus && !DEDUCTABLE_STATUSES.includes(deductOnStatus)) {
      return res.status(400).json({ error: `deductOnStatus must be one of ${DEDUCTABLE_STATUSES.join(', ')}` });
    }

    const now = new Date().toISOString();
    const existing = getSettings();

    if (existing) {
      db.prepare(`
        UPDATE shipstation_settings SET
          api_key = COALESCE(?, api_key),
          api_secret = COALESCE(?, api_secret),
          auto_deduct = COALESCE(?, auto_deduct),
          deduct_on_status = COALESCE(?, deduct_on_status),
          updated_at = ?
        WHERE id = 'primary'
      `).run(
        apiKey ? String(apiKey).trim() : null,
        apiSecret ? String(apiSecret).trim() : null,
        autoDeduct === undefined ? null : (autoDeduct ? 1 : 0),
        deductOnStatus || null,
        now
      );
    } else {
      db.prepare(`
        INSERT INTO shipstation_settings (id, api_key, api_secret, auto_deduct, deduct_on_status, updated_at)
        VALUES ('primary', ?, ?, ?, ?, ?)
      `).run(
        apiKey ? String(apiKey).trim() : null,
        apiSecret ? String(apiSecret).trim() : null,
        autoDeduct ? 1 : 0,
        deductOnStatus || 'awaiting_shipment',
        now
      );
    }

    res.json({ success: true, message: 'ShipStation settings saved' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/** Verify the credentials and mirror the store list. */
shipstationRouter.post('/test', async (_req: Request, res: Response) => {
  try {
    const stores = await ssFetch('/stores?showInactive=false');
    const now = new Date().toISOString();

    const upsert = db.prepare(`
      INSERT INTO shipstation_stores (store_id, store_name, marketplace, active, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(store_id) DO UPDATE SET
        store_name = excluded.store_name, marketplace = excluded.marketplace,
        active = excluded.active, updated_at = excluded.updated_at
    `);
    for (const st of stores || []) {
      upsert.run(st.storeId, st.storeName || 'Store', st.marketplaceName || null, st.active === false ? 0 : 1, now);
    }

    db.prepare("UPDATE shipstation_settings SET connected_at = COALESCE(connected_at, ?), updated_at = ? WHERE id = 'primary'")
      .run(now, now);

    res.json({
      success: true,
      storeCount: (stores || []).length,
      stores: (stores || []).map((s: any) => ({ storeId: s.storeId, storeName: s.storeName, marketplace: s.marketplaceName })),
      message: `Connected. Found ${(stores || []).length} active store${(stores || []).length === 1 ? '' : 's'}.`
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/* --------------------------------------------------------------- sku mapping */

shipstationRouter.get('/sku-map', (_req: Request, res: Response) => {
  try {
    res.json(db.prepare(`
      SELECT m.sku, m.blank_item_id as blankItemId, b.sku as blankSku,
             m.packaging_item_id as packagingItemId, p.sku as packagingSku,
             m.units_per_sale as unitsPerSale
      FROM channel_sku_map m
      LEFT JOIN inventory_items b ON m.blank_item_id = b.id
      LEFT JOIN inventory_items p ON m.packaging_item_id = p.id
      ORDER BY m.sku ASC
    `).all());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

shipstationRouter.put('/sku-map', (req: Request, res: Response) => {
  try {
    const { sku, blankItemId, packagingItemId, unitsPerSale = 1 } = req.body || {};
    if (!sku) return res.status(400).json({ error: 'sku is required' });

    for (const id of [blankItemId, packagingItemId]) {
      if (id && !db.prepare('SELECT 1 FROM inventory_items WHERE id = ?').get(id)) {
        return res.status(400).json({ error: `Unknown inventory item: ${id}` });
      }
    }
    const units = Number(unitsPerSale);
    if (!Number.isInteger(units) || units < 1) {
      return res.status(400).json({ error: 'unitsPerSale must be a whole number of 1 or more' });
    }

    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO channel_sku_map (sku, blank_item_id, packaging_item_id, units_per_sale, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(sku) DO UPDATE SET
        blank_item_id = excluded.blank_item_id,
        packaging_item_id = excluded.packaging_item_id,
        units_per_sale = excluded.units_per_sale,
        updated_at = excluded.updated_at
    `).run(String(sku).trim(), blankItemId || null, packagingItemId || null, units, now, now);

    res.json({ success: true, message: `Mapping saved for ${sku}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** Every SKU seen on stored orders, with whether it resolves to stock. */
shipstationRouter.get('/unmapped-skus', (_req: Request, res: Response) => {
  try {
    const orders = db.prepare('SELECT items_json FROM ecommerce_orders').all() as any[];
    const seen = new Map<string, { sku: string; title: string; count: number; units: number }>();

    for (const o of orders) {
      let items: any[] = [];
      try { items = JSON.parse(o.items_json) || []; } catch { continue; }
      for (const it of items) {
        const sku = it.skuSold || it.sku;
        if (!sku) continue;
        const e = seen.get(sku) || { sku, title: it.productTitle || '', count: 0, units: 0 };
        e.count++;
        e.units += Number(it.quantity) || 0;
        seen.set(sku, e);
      }
    }

    const skus = [...seen.values()]
      .map(e => {
        const r = resolveStockForSku(e.sku);
        return { ...e, resolvedVia: r.via, blankItemId: r.blankItemId, mapped: r.via !== 'none' };
      })
      .sort((a, b) => Number(a.mapped) - Number(b.mapped) || b.units - a.units);

    res.json({ total: skus.length, unmapped: skus.filter(s => !s.mapped).length, skus });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ------------------------------------------------------------------- orders */

function buildOrderRecord(o: any, storeNames: Map<number, string>) {
  const items = (o.items || []).map((li: any) => {
    const resolved = resolveStockForSku(li.sku);
    const blank = resolved.blankItemId
      ? (db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(resolved.blankItemId) as any)
      : null;
    const box = resolved.packagingItemId
      ? (db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(resolved.packagingItemId) as any)
      : null;

    const qty = Number(li.quantity) || 0;
    const unitCost =
      (blank ? blank.landed_cost_per_unit || blank.cost_per_unit || 0 : 0) +
      (box ? box.landed_cost_per_unit || box.cost_per_unit || 0 : 0);
    const landed = unitCost * qty * (resolved.unitsPerSale || 1);
    const revenue = (Number(li.unitPrice) || 0) * qty;

    return {
      productTitle: li.name || 'Item',
      skuSold: li.sku || null,
      quantity: qty,
      unitPrice: Number(li.unitPrice) || 0,
      unitsPerSale: resolved.unitsPerSale || 1,
      warehouseLocation: li.warehouseLocation || null,
      matchedBlankId: resolved.blankItemId,
      matchedBlankSku: blank?.sku || null,
      matchedBoxId: resolved.packagingItemId,
      matchedBoxSku: box?.sku || null,
      resolvedVia: resolved.via,
      estimatedLandedCost: Number(landed.toFixed(2)),
      grossProfit: Number((revenue - landed).toFixed(2))
    };
  });

  const gross = Number(o.orderTotal || 0);
  const tax = Number(o.taxAmount || 0);
  // Revenue excludes tax, consistent with the Xero side
  const netRevenue = gross - tax;
  const totalLanded = items.reduce((sum: number, i: any) => sum + i.estimatedLandedCost, 0);
  const grossProfit = netRevenue - totalLanded;

  return {
    id: `ecom-${crypto.randomUUID().slice(0, 8)}`,
    orderNumber: String(o.orderNumber || o.orderId),
    externalOrderId: String(o.orderId),
    storeName: storeNames.get(o.advancedOptions?.storeId) || 'ShipStation',
    orderStatus: o.orderStatus || 'unknown',
    customerName: o.shipTo?.name || o.billTo?.name || o.customerEmail || 'Customer',
    orderDate: String(o.orderDate || new Date().toISOString()).slice(0, 10),
    totalAmount: gross,
    subTotal: Number(netRevenue.toFixed(2)),
    totalTax: tax,
    shippingAmount: Number(o.shippingAmount || 0),
    currency: 'GBP',
    items,
    totalLanded: Number(totalLanded.toFixed(2)),
    grossProfit: Number(grossProfit.toFixed(2)),
    marginPercent: netRevenue > 0 ? Number(((grossProfit / netRevenue) * 100).toFixed(1)) : 0
  };
}

function upsertOrder(record: ReturnType<typeof buildOrderRecord>) {
  const now = new Date().toISOString();
  const existing = db.prepare('SELECT id, stock_deducted FROM ecommerce_orders WHERE order_number = ?')
    .get(record.orderNumber) as any;

  if (existing) {
    db.prepare(`
      UPDATE ecommerce_orders SET
        store_name = ?, external_order_id = ?, order_status = ?, customer_name = ?,
        total_amount = ?, sub_total = ?, total_tax = ?, shipping_amount = ?,
        items_json = ?, total_landed_cost = ?, gross_profit = ?, margin_percent = ?
      WHERE id = ?
    `).run(
      record.storeName, record.externalOrderId, record.orderStatus, record.customerName,
      record.totalAmount, record.subTotal, record.totalTax, record.shippingAmount,
      JSON.stringify(record.items), record.totalLanded, record.grossProfit, record.marginPercent,
      existing.id
    );
    return { id: existing.id, created: false, alreadyDeducted: existing.stock_deducted === 1 };
  }

  db.prepare(`
    INSERT INTO ecommerce_orders (
      id, order_number, platform, store_name, external_order_id, order_status,
      customer_name, order_date, total_amount, sub_total, total_tax, shipping_amount,
      currency, status, items_json, stock_deducted, deducted_at,
      total_landed_cost, gross_profit, margin_percent, created_at
    ) VALUES (?, ?, 'shipstation', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, null, ?, ?, ?, ?)
  `).run(
    record.id, record.orderNumber, record.storeName, record.externalOrderId, record.orderStatus,
    record.customerName, record.orderDate, record.totalAmount, record.subTotal, record.totalTax,
    record.shippingAmount, record.currency, record.orderStatus,
    JSON.stringify(record.items), record.totalLanded, record.grossProfit, record.marginPercent, now
  );
  return { id: record.id, created: true, alreadyDeducted: false };
}

/** Deduct once. Safe to call repeatedly. */
export function deductOrderStock(orderId: string, operator = 'ShipStation') {
  const order = db.prepare('SELECT * FROM ecommerce_orders WHERE id = ?').get(orderId) as any;
  if (!order) return { deducted: 0, skipped: 'order not found' };
  if (order.stock_deducted === 1) return { deducted: 0, skipped: 'already deducted' };

  const items = JSON.parse(order.items_json || '[]');
  const now = new Date().toISOString();
  let moves = 0;

  db.exec('BEGIN');
  try {
    for (const line of items) {
      const units = (Number(line.quantity) || 0) * (line.unitsPerSale || 1);
      if (units <= 0) continue;
      for (const itemId of [line.matchedBlankId, line.matchedBoxId]) {
        if (!itemId) continue;
        const item = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(itemId) as any;
        if (!item) continue;
        const newStock = Math.max(0, item.current_stock - units);
        db.prepare('UPDATE inventory_items SET current_stock = ?, updated_at = ? WHERE id = ?')
          .run(newStock, now, item.id);
        db.prepare(`
          INSERT INTO stock_movements (
            id, item_id, sku, item_name, movement_type, quantity_delta,
            resulting_stock, unit_cost, reference_id, operator_name, notes, created_at
          ) VALUES (?, ?, ?, ?, 'ecommerce_sale', ?, ?, ?, ?, ?, ?, ?)
        `).run(
          `mov-${crypto.randomUUID().slice(0, 8)}`,
          item.id, item.sku, item.name,
          -units, newStock,
          item.landed_cost_per_unit || item.cost_per_unit || 0,
          order.order_number, operator,
          `${order.store_name || 'ShipStation'} order ${order.order_number}: ${line.productTitle}`,
          now
        );
        moves++;
      }
    }
    db.prepare('UPDATE ecommerce_orders SET stock_deducted = 1, deducted_at = ? WHERE id = ?').run(now, orderId);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return { deducted: moves };
}

/** Pull orders from ShipStation across every connected store. */
shipstationRouter.post('/orders/sync', async (req: Request, res: Response) => {
  try {
    const settings = getSettings();
    const {
      orderStatus = 'awaiting_shipment',
      storeId,
      fromDate,
      toDate,
      pages = 1,
      deduct = false
    } = req.body || {};

    for (const d of [fromDate, toDate]) {
      if (d && !/^\d{4}-\d{2}-\d{2}$/.test(String(d))) {
        return res.status(400).json({ error: 'Dates must be YYYY-MM-DD' });
      }
    }
    if (fromDate && toDate && toDate < fromDate) {
      return res.status(400).json({ error: 'toDate must not be earlier than fromDate' });
    }
    const pageCount = Math.min(10, Math.max(1, Number(pages) || 1));

    const storeNames = new Map<number, string>(
      (db.prepare('SELECT store_id, store_name FROM shipstation_stores').all() as any[])
        .map(s => [s.store_id, s.store_name])
    );

    let created = 0;
    let updated = 0;
    let deductedOrders = 0;
    let unmappedLines = 0;
    let fetched = 0;
    let totalPages = 1;

    for (let page = 1; page <= pageCount; page++) {
      const params = new URLSearchParams({ page: String(page), pageSize: '100', sortBy: 'OrderDate', sortDir: 'DESC' });
      if (orderStatus && orderStatus !== 'any') params.set('orderStatus', orderStatus);
      if (storeId) params.set('storeId', String(storeId));
      if (fromDate) params.set('orderDateStart', `${fromDate} 00:00:00`);
      if (toDate) params.set('orderDateEnd', `${toDate} 23:59:59`);

      const data = await ssFetch(`/orders?${params.toString()}`);
      totalPages = data.pages || 1;
      const orders = data.orders || [];
      fetched += orders.length;

      for (const o of orders) {
        const record = buildOrderRecord(o, storeNames);
        unmappedLines += record.items.filter((i: any) => !i.matchedBlankId).length;
        const { id, created: isNew, alreadyDeducted } = upsertOrder(record);
        if (isNew) created++; else updated++;

        const statusMatches = record.orderStatus === (settings?.deduct_on_status || 'awaiting_shipment');
        const allMapped = record.items.length > 0 && record.items.every((i: any) => i.matchedBlankId);
        if (deduct && !alreadyDeducted && statusMatches && allMapped) {
          if (deductOrderStock(id, `ShipStation · ${record.storeName}`).deducted > 0) deductedOrders++;
        }
      }

      if (page >= totalPages) break;
    }

    db.prepare("UPDATE shipstation_settings SET last_synced_at = ? WHERE id = 'primary'").run(new Date().toISOString());

    res.json({
      success: true,
      fetched,
      created,
      updated,
      deductedOrders,
      unmappedLines,
      totalPages,
      message:
        `Fetched ${fetched} order${fetched === 1 ? '' : 's'} (${created} new, ${updated} updated).` +
        (unmappedLines ? ` ${unmappedLines} line${unmappedLines === 1 ? '' : 's'} have no stock mapping.` : '') +
        (deductedOrders ? ` Stock deducted for ${deductedOrders}.` : '') +
        (totalPages > pageCount ? ` ${totalPages} pages available — increase the page count to fetch more.` : '')
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

shipstationRouter.post('/orders/:id/deduct', (req: Request, res: Response) => {
  try {
    const out = deductOrderStock(req.params.id, 'Manual');
    if (out.skipped) return res.status(400).json({ error: out.skipped });
    res.json({ success: true, movements: out.deducted, message: `Stock deducted (${out.deducted} movements).` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
