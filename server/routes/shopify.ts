import { Router, Request, Response } from 'express';
import { db } from '../db';
import crypto from 'node:crypto';
import {
  DEFAULT_API_VERSION,
  getShopifySettings,
  normaliseShopDomain,
  getValidShopifyToken,
  shopifyGraphQL
} from './shopifyAuth';

export const shopifyRouter = Router();

/* ------------------------------------------------------------------ helpers */

const getSettings = getShopifySettings;

/**
 * Resolve what stock a sold SKU consumes.
 * Explicit mapping first, then an exact SKU match against the catalogue.
 */
function resolveStockForSku(sku: string | null | undefined) {
  if (!sku) return { blankItemId: null, packagingItemId: null, unitsPerSale: 1, via: 'none' as const };

  const mapped = db.prepare('SELECT * FROM shopify_sku_map WHERE shopify_sku = ?').get(sku) as any;
  if (mapped) {
    return {
      blankItemId: mapped.blank_item_id || null,
      packagingItemId: mapped.packaging_item_id || null,
      unitsPerSale: mapped.units_per_sale || 1,
      via: 'mapping' as const
    };
  }

  const direct = db.prepare('SELECT id FROM inventory_items WHERE sku = ?').get(sku) as any;
  if (direct) {
    return { blankItemId: direct.id, packagingItemId: null, unitsPerSale: 1, via: 'exact_sku' as const };
  }

  return { blankItemId: null, packagingItemId: null, unitsPerSale: 1, via: 'none' as const };
}

/* ------------------------------------------------------------------ settings */

shopifyRouter.get('/settings', (_req: Request, res: Response) => {
  try {
    const s = getSettings();
    res.json({
      shopDomain: s?.shop_domain || '',
      shopName: s?.shop_name || '',
      apiVersion: s?.api_version || DEFAULT_API_VERSION,
      autoDeduct: !!s?.auto_deduct,
      // Never return the credentials themselves
      hasClientId: !!s?.client_id,
      hasClientSecret: !!s?.client_secret,
      tokenExpiresAt: s?.token_expires_at || null,
      connected: !!(s?.shop_domain && s?.client_id && s?.client_secret),
      connectedAt: s?.connected_at || null,
      lastSyncedAt: s?.last_synced_at || null,
      registeredWebhooks: s?.webhook_ids ? JSON.parse(s.webhook_ids) : []
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

shopifyRouter.put('/settings', (req: Request, res: Response) => {
  try {
    const { shopDomain, clientId, clientSecret, apiVersion, autoDeduct } = req.body || {};
    const existing = getSettings();

    const domain = shopDomain !== undefined ? normaliseShopDomain(shopDomain) : existing?.shop_domain;
    if (!domain) return res.status(400).json({ error: 'Shop domain is required' });

    if (apiVersion !== undefined && apiVersion && !/^\d{4}-\d{2}$/.test(String(apiVersion))) {
      return res.status(400).json({ error: 'API version must look like 2026-07' });
    }

    // The two credentials are easy to transpose: the secret is prefixed
    // shpss_, the client ID is plain hex. Catch it here, not at Shopify.
    if (clientId && /^shpss_/i.test(String(clientId).trim())) {
      return res.status(400).json({
        error: 'That looks like the Client secret (it starts with shpss_). The Client ID is the plain value above it in Dev Dashboard → Settings.'
      });
    }
    if (clientSecret && !/^shpss_/i.test(String(clientSecret).trim())) {
      return res.status(400).json({
        error: 'The Client secret should start with shpss_. Check you copied the secret, not the Client ID.'
      });
    }

    // Changing the shop or credentials invalidates any cached token
    const credsChanged =
      (clientId && clientId !== existing?.client_id) ||
      (clientSecret && clientSecret !== existing?.client_secret) ||
      domain !== existing?.shop_domain;

    const now = new Date().toISOString();
    if (existing) {
      db.prepare(`
        UPDATE shopify_settings SET
          shop_domain = ?,
          client_id = COALESCE(?, client_id),
          client_secret = COALESCE(?, client_secret),
          api_version = COALESCE(?, api_version),
          auto_deduct = COALESCE(?, auto_deduct),
          access_token = CASE WHEN ? THEN NULL ELSE access_token END,
          token_expires_at = CASE WHEN ? THEN NULL ELSE token_expires_at END,
          updated_at = ?
        WHERE id = 'primary'
      `).run(
        domain,
        clientId ? String(clientId).trim() : null,
        clientSecret ? String(clientSecret).trim() : null,
        apiVersion || null,
        autoDeduct === undefined ? null : (autoDeduct ? 1 : 0),
        credsChanged ? 1 : 0,
        credsChanged ? 1 : 0,
        now
      );
    } else {
      db.prepare(`
        INSERT INTO shopify_settings (id, shop_domain, client_id, client_secret, api_version, auto_deduct, updated_at)
        VALUES ('primary', ?, ?, ?, ?, ?, ?)
      `).run(
        domain,
        clientId ? String(clientId).trim() : null,
        clientSecret ? String(clientSecret).trim() : null,
        apiVersion || DEFAULT_API_VERSION,
        autoDeduct ? 1 : 0,
        now
      );
    }

    res.json({ success: true, message: 'Shopify settings saved' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/** Confirm the credentials actually work before anything else is attempted. */
shopifyRouter.post('/test', async (_req: Request, res: Response) => {
  try {
    const data = await shopifyGraphQL<{
      shop: { name: string; myshopifyDomain: string; currencyCode: string; ianaTimezone: string };
      currentAppInstallation: { accessScopes: { handle: string }[] };
    }>(`
      query ConnectionCheck {
        shop { name myshopifyDomain currencyCode ianaTimezone }
        currentAppInstallation { accessScopes { handle } }
      }
    `);

    const granted = (data.currentAppInstallation?.accessScopes || []).map(s => s.handle);
    const needed = ['read_orders', 'read_products'];
    const missing = needed.filter(n => !granted.includes(n));

    const now = new Date().toISOString();
    db.prepare(
      "UPDATE shopify_settings SET shop_name = ?, connected_at = COALESCE(connected_at, ?), updated_at = ? WHERE id = 'primary'"
    ).run(data.shop?.name || null, now, now);

    res.json({
      success: true,
      shopName: data.shop?.name,
      domain: data.shop?.myshopifyDomain,
      currency: data.shop?.currencyCode,
      timezone: data.shop?.ianaTimezone,
      grantedScopes: granted,
      missingScopes: missing,
      canReadAllOrders: granted.includes('read_all_orders'),
      message: missing.length
        ? `Connected to ${data.shop?.name}, but these scopes are missing: ${missing.join(', ')}. Add them to your app version in the Dev Dashboard and reinstall.`
        : `Connected to ${data.shop?.name}.` +
          (granted.includes('read_all_orders') ? '' : ' Note: without read_all_orders only the last 60 days of orders are visible.')
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/* ------------------------------------------------------------- sku mapping */

shopifyRouter.get('/sku-map', (_req: Request, res: Response) => {
  try {
    const rows = db.prepare(`
      SELECT m.shopify_sku as shopifySku, m.blank_item_id as blankItemId, b.sku as blankSku,
             m.packaging_item_id as packagingItemId, p.sku as packagingSku,
             m.units_per_sale as unitsPerSale
      FROM shopify_sku_map m
      LEFT JOIN inventory_items b ON m.blank_item_id = b.id
      LEFT JOIN inventory_items p ON m.packaging_item_id = p.id
      ORDER BY m.shopify_sku ASC
    `).all();
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

shopifyRouter.put('/sku-map', (req: Request, res: Response) => {
  try {
    const { shopifySku, blankItemId, packagingItemId, unitsPerSale = 1 } = req.body || {};
    if (!shopifySku) return res.status(400).json({ error: 'shopifySku is required' });

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
      INSERT INTO shopify_sku_map (shopify_sku, blank_item_id, packaging_item_id, units_per_sale, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(shopify_sku) DO UPDATE SET
        blank_item_id = excluded.blank_item_id,
        packaging_item_id = excluded.packaging_item_id,
        units_per_sale = excluded.units_per_sale,
        updated_at = excluded.updated_at
    `).run(String(shopifySku).trim(), blankItemId || null, packagingItemId || null, units, now, now);

    res.json({ success: true, message: `Mapping saved for ${shopifySku}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

shopifyRouter.delete('/sku-map/:sku', (req: Request, res: Response) => {
  try {
    db.prepare('DELETE FROM shopify_sku_map WHERE shopify_sku = ?').run(req.params.sku);
    res.json({ success: true, message: 'Mapping removed' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** Every distinct SKU seen on stored Shopify orders, with its mapping state. */
shopifyRouter.get('/unmapped-skus', (_req: Request, res: Response) => {
  try {
    const orders = db.prepare("SELECT items_json FROM ecommerce_orders WHERE platform = 'shopify'").all() as any[];
    const seen = new Map<string, { sku: string; title: string; count: number }>();

    for (const o of orders) {
      let items: any[] = [];
      try { items = JSON.parse(o.items_json) || []; } catch { continue; }
      for (const it of items) {
        const sku = it.skuSold || it.sku;
        if (!sku) continue;
        const entry = seen.get(sku) || { sku, title: it.productTitle || '', count: 0 };
        entry.count++;
        seen.set(sku, entry);
      }
    }

    const rows = [...seen.values()].map(e => {
      const r = resolveStockForSku(e.sku);
      return { ...e, resolvedVia: r.via, blankItemId: r.blankItemId, mapped: r.via !== 'none' };
    });

    res.json({ total: rows.length, unmapped: rows.filter(r => !r.mapped).length, skus: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ------------------------------------------------------------ order syncing */

/**
 * Normalise an order into one shape.
 * GraphQL sync returns camelCase with edges/nodes; webhooks still deliver the
 * REST-style snake_case payload, so both are accepted here.
 */
function normaliseOrder(o: any) {
  const isGraphQL = !!o.lineItems || !!o.totalPriceSet;

  const lines = isGraphQL
    ? (o.lineItems?.edges || []).map((e: any) => ({
        title: e.node.title,
        sku: e.node.sku,
        quantity: Number(e.node.quantity) || 0,
        price: Number(e.node.originalUnitPriceSet?.shopMoney?.amount || 0),
        variantId: e.node.variant?.id || null
      }))
    : (o.line_items || []).map((li: any) => ({
        title: li.title || li.name,
        sku: li.sku,
        quantity: Number(li.quantity) || 0,
        price: Number(li.price || 0),
        variantId: li.variant_id || null
      }));

  const customer = isGraphQL
    ? [o.customer?.firstName, o.customer?.lastName].filter(Boolean).join(' ')
    : [o.customer?.first_name, o.customer?.last_name].filter(Boolean).join(' ');

  return {
    orderNumber: o.name || `#${o.order_number ?? o.id}`,
    createdAt: o.createdAt || o.created_at || new Date().toISOString(),
    cancelled: !!(o.cancelledAt || o.cancelled_at),
    financialStatus: (o.displayFinancialStatus || o.financial_status || 'paid').toLowerCase(),
    currency: o.currencyCode || o.currency || 'GBP',
    total: Number(o.totalPriceSet?.shopMoney?.amount ?? o.total_price ?? 0),
    customerName: customer || o.email || 'Shopify customer',
    lines
  };
}

/** Turn a Shopify order into our stored shape, resolving stock per line. */
function buildOrderRecord(raw: any) {
  const o = normaliseOrder(raw);

  const items = o.lines.map((li: any) => {
    const resolved = resolveStockForSku(li.sku);
    const blank = resolved.blankItemId
      ? (db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(resolved.blankItemId) as any)
      : null;
    const box = resolved.packagingItemId
      ? (db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(resolved.packagingItemId) as any)
      : null;

    const qty = li.quantity;
    const unitCost =
      (blank ? blank.landed_cost_per_unit || blank.cost_per_unit || 0 : 0) +
      (box ? box.landed_cost_per_unit || box.cost_per_unit || 0 : 0);
    const landed = unitCost * qty * (resolved.unitsPerSale || 1);
    const revenue = li.price * qty;

    return {
      productTitle: li.title || 'Shopify item',
      skuSold: li.sku || null,
      variantId: li.variantId,
      quantity: qty,
      unitPrice: li.price,
      unitsPerSale: resolved.unitsPerSale || 1,
      matchedBlankId: resolved.blankItemId,
      matchedBlankSku: blank?.sku || null,
      matchedBoxId: resolved.packagingItemId,
      matchedBoxSku: box?.sku || null,
      resolvedVia: resolved.via,
      estimatedLandedCost: Number(landed.toFixed(2)),
      grossProfit: Number((revenue - landed).toFixed(2))
    };
  });

  const totalAmount = o.total;
  const totalLanded = items.reduce((sum: number, i: any) => sum + i.estimatedLandedCost, 0);
  const grossProfit = totalAmount - totalLanded;

  return {
    id: `ecom-${crypto.randomUUID().slice(0, 8)}`,
    orderNumber: o.orderNumber,
    customerName: o.customerName,
    orderDate: o.createdAt.slice(0, 10),
    totalAmount,
    currency: o.currency,
    status: o.cancelled ? 'cancelled' : o.financialStatus,
    items,
    totalLanded: Number(totalLanded.toFixed(2)),
    grossProfit: Number(grossProfit.toFixed(2)),
    marginPercent: totalAmount > 0 ? Number(((grossProfit / totalAmount) * 100).toFixed(1)) : 0
  };
}

/** Store an order without deducting stock. Returns whether it was new. */
function upsertOrder(record: ReturnType<typeof buildOrderRecord>) {
  const now = new Date().toISOString();
  const existing = db.prepare('SELECT id FROM ecommerce_orders WHERE order_number = ?').get(record.orderNumber) as any;

  if (existing) {
    db.prepare(`
      UPDATE ecommerce_orders SET
        customer_name = ?, total_amount = ?, status = ?, items_json = ?,
        total_landed_cost = ?, gross_profit = ?, margin_percent = ?
      WHERE id = ?
    `).run(
      record.customerName, record.totalAmount, record.status, JSON.stringify(record.items),
      record.totalLanded, record.grossProfit, record.marginPercent, existing.id
    );
    return { id: existing.id, created: false };
  }

  db.prepare(`
    INSERT INTO ecommerce_orders (
      id, order_number, platform, customer_name, order_date, total_amount, currency,
      status, items_json, stock_deducted, deducted_at, total_landed_cost,
      gross_profit, margin_percent, created_at
    ) VALUES (?, ?, 'shopify', ?, ?, ?, ?, ?, ?, 0, null, ?, ?, ?, ?)
  `).run(
    record.id, record.orderNumber, record.customerName, record.orderDate,
    record.totalAmount, record.currency, record.status, JSON.stringify(record.items),
    record.totalLanded, record.grossProfit, record.marginPercent, now
  );
  return { id: record.id, created: true };
}

/** Deduct the stock an order consumes, once. Safe to call twice. */
function deductOrderStock(orderId: string, operator = 'Shopify') {
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
          `Shopify order ${order.order_number}: ${line.productTitle}`,
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

/** Pull orders from Shopify. Mirrors the Xero fetch controls. */
shopifyRouter.post('/orders/sync', async (req: Request, res: Response) => {
  try {
    const { mode = 'recent', limit = 10, date, fromDate, toDate, deduct = false } = req.body || {};

    // Shopify's GraphQL search syntax for orders
    let first = 10;
    let searchQuery = '';

    if (mode === 'recent') {
      first = Math.min(250, Math.max(1, Number(limit) || 10));
    } else if (mode === 'date') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
        return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
      }
      first = 250;
      searchQuery = `created_at:>='${date}T00:00:00Z' AND created_at:<='${date}T23:59:59Z'`;
    } else if (mode === 'range') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fromDate)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(toDate))) {
        return res.status(400).json({ error: 'fromDate and toDate must be YYYY-MM-DD' });
      }
      if (toDate < fromDate) return res.status(400).json({ error: 'toDate must not be earlier than fromDate' });
      first = 250;
      searchQuery = `created_at:>='${fromDate}T00:00:00Z' AND created_at:<='${toDate}T23:59:59Z'`;
    } else {
      return res.status(400).json({ error: 'mode must be recent, date or range' });
    }

    const data = await shopifyGraphQL<{ orders: { edges: { node: any }[] } }>(
      `query PullOrders($first: Int!, $query: String) {
         orders(first: $first, sortKey: CREATED_AT, reverse: true, query: $query) {
           edges {
             node {
               id
               name
               createdAt
               cancelledAt
               displayFinancialStatus
               email
               currencyCode
               totalPriceSet { shopMoney { amount } }
               customer { firstName lastName }
               lineItems(first: 100) {
                 edges {
                   node {
                     id
                     title
                     quantity
                     sku
                     variant { id }
                     originalUnitPriceSet { shopMoney { amount } }
                   }
                 }
               }
             }
           }
         }
       }`,
      { first, query: searchQuery || null }
    );

    const orders = (data.orders?.edges || []).map(e => e.node);
    let created = 0;
    let updated = 0;
    let deductedOrders = 0;
    let unmappedLines = 0;

    for (const o of orders) {
      const record = buildOrderRecord(o);
      unmappedLines += record.items.filter((i: any) => !i.matchedBlankId).length;
      const { id, created: isNew } = upsertOrder(record);
      if (isNew) created++; else updated++;

      // Only auto-deduct when asked AND every line resolved to stock
      if (deduct && isNew && record.items.length > 0 && record.items.every((i: any) => i.matchedBlankId)) {
        const out = deductOrderStock(id, 'Shopify sync');
        if (out.deducted > 0) deductedOrders++;
      }
    }

    db.prepare("UPDATE shopify_settings SET last_synced_at = ? WHERE id = 'primary'").run(new Date().toISOString());

    res.json({
      success: true,
      fetched: orders.length,
      created,
      updated,
      deductedOrders,
      unmappedLines,
      message:
        `Fetched ${orders.length} Shopify order${orders.length === 1 ? '' : 's'} (${created} new, ${updated} updated).` +
        (unmappedLines ? ` ${unmappedLines} line${unmappedLines === 1 ? '' : 's'} have no stock mapping.` : '') +
        (deductedOrders ? ` Stock deducted for ${deductedOrders}.` : '')
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/** Deduct stock for one already-stored order. */
shopifyRouter.post('/orders/:id/deduct', (req: Request, res: Response) => {
  try {
    const out = deductOrderStock(req.params.id, 'Manual');
    if (out.skipped) return res.status(400).json({ error: out.skipped });
    res.json({ success: true, movements: out.deducted, message: `Stock deducted (${out.deducted} movements).` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ---------------------------------------------------------------- webhooks */

/** Register the order webhooks against a public HTTPS callback. */
shopifyRouter.post('/webhooks/register', async (req: Request, res: Response) => {
  try {
    const { callbackUrl } = req.body || {};
    if (!/^https:\/\/[^\s]+$/.test(String(callbackUrl || ''))) {
      return res.status(400).json({ error: 'callbackUrl must be an https URL (Shopify refuses http)' });
    }

    const topics = ['ORDERS_CREATE', 'ORDERS_CANCELLED'];
    const registered: any[] = [];
    const failures: any[] = [];

    for (const topic of topics) {
      try {
        const data = await shopifyGraphQL<any>(
          `mutation Register($topic: WebhookSubscriptionTopic!, $sub: WebhookSubscriptionInput!) {
             webhookSubscriptionCreate(topic: $topic, webhookSubscription: $sub) {
               webhookSubscription {
                 id
                 topic
                 endpoint { __typename ... on WebhookHttpEndpoint { callbackUrl } }
               }
               userErrors { field message }
             }
           }`,
          { topic, sub: { callbackUrl, format: 'JSON' } }
        );

        const result = data.webhookSubscriptionCreate;
        if (result?.userErrors?.length) {
          failures.push({ topic, detail: result.userErrors.map((e: any) => e.message).join('; ') });
        } else if (result?.webhookSubscription) {
          registered.push({
            topic,
            id: result.webhookSubscription.id,
            address: result.webhookSubscription.endpoint?.callbackUrl
          });
        }
      } catch (e: any) {
        failures.push({ topic, detail: e.message });
      }
    }

    if (registered.length) {
      db.prepare("UPDATE shopify_settings SET webhook_ids = ?, updated_at = ? WHERE id = 'primary'")
        .run(JSON.stringify(registered), new Date().toISOString());
    }

    res.json({
      success: failures.length === 0,
      registered,
      failures,
      message: failures.length
        ? `Registered ${registered.length}, failed ${failures.length}. Shopify rejects a topic already pointing at the same URL.`
        : `Registered ${registered.length} webhooks.`
    });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

shopifyRouter.get('/webhooks', async (_req: Request, res: Response) => {
  try {
    const data = await shopifyGraphQL<any>(
      `query { webhookSubscriptions(first: 50) {
         edges { node {
           id topic createdAt
           endpoint { __typename ... on WebhookHttpEndpoint { callbackUrl } }
         } }
       } }`
    );
    const hooks = (data.webhookSubscriptions?.edges || []).map((e: any) => ({
      id: e.node.id,
      topic: e.node.topic,
      address: e.node.endpoint?.callbackUrl || null,
      createdAt: e.node.createdAt
    }));
    res.json(hooks);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

shopifyRouter.delete('/webhooks/:id', async (req: Request, res: Response) => {
  try {
    const data = await shopifyGraphQL<any>(
      `mutation Del($id: ID!) {
         webhookSubscriptionDelete(id: $id) { deletedWebhookSubscriptionId userErrors { message } }
       }`,
      { id: req.params.id }
    );
    const errs = data.webhookSubscriptionDelete?.userErrors || [];
    if (errs.length) return res.status(400).json({ error: errs.map((e: any) => e.message).join('; ') });
    res.json({ success: true, message: 'Webhook removed' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * Inbound webhook. Verified with HMAC-SHA256 of the RAW body keyed on the
 * app's API secret, per Shopify's spec. Fails closed when no secret is set.
 */
shopifyRouter.post('/webhook', (req: Request, res: Response) => {
  const started = Date.now();
  try {
    const s = getSettings();
    // Shopify signs webhooks with the app's client secret
    const secret = s?.client_secret;
    if (!secret) {
      console.error('[Shopify Webhook] No client secret configured - rejecting');
      return res.status(503).send('Webhook secret not configured');
    }

    const headerHmac = req.headers['x-shopify-hmac-sha256'] as string | undefined;
    const rawBody: Buffer | undefined = (req as any).rawBody;
    if (!headerHmac || !rawBody) return res.status(401).send('Missing signature');

    const digest = crypto.createHmac('sha256', secret).update(rawBody).digest();
    const provided = Buffer.from(headerHmac, 'base64');
    const valid = digest.length === provided.length && crypto.timingSafeEqual(digest, provided);
    if (!valid) {
      console.warn('[Shopify Webhook] HMAC mismatch - rejected');
      return res.status(401).send('Invalid signature');
    }

    // Shopify retries on anything slow, so acknowledge fast and do the work inline
    const topic = String(req.headers['x-shopify-topic'] || '');
    const order = req.body || {};

    if (topic === 'orders/create' || topic === 'orders/updated') {
      const record = buildOrderRecord(order);
      const { id, created } = upsertOrder(record);
      const allMapped = record.items.every((i: any) => i.matchedBlankId);
      if (created && s.auto_deduct && allMapped) {
        try { deductOrderStock(id, 'Shopify webhook'); } catch (e) {
          console.error('[Shopify Webhook] deduction failed', e);
        }
      }
      console.log(`[Shopify Webhook] ${topic} ${record.orderNumber} in ${Date.now() - started}ms`);
    } else if (topic === 'orders/cancelled') {
      const record = buildOrderRecord(order);
      db.prepare("UPDATE ecommerce_orders SET status = 'cancelled' WHERE order_number = ?").run(record.orderNumber);
      console.log(`[Shopify Webhook] cancelled ${record.orderNumber}`);
    }

    return res.status(200).send('OK');
  } catch (err: any) {
    console.error('[Shopify Webhook Error]', err);
    // Still 200: a 500 makes Shopify retry a payload we already failed on
    return res.status(200).send('OK');
  }
});
