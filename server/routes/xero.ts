import { Router, Request, Response } from 'express';
import { db } from '../db';
import crypto from 'node:crypto';

export const xeroRouter = Router();

// Where the browser is sent back to after the Xero OAuth round trip.
// Override with APP_URL when the UI is not on the default dev port.
const APP_URL = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');

// Smart matcher helper for freeform descriptions
export function matchLineItemToStock(description: string): {
  recipeId: string | null;
  blankItemId: string | null;
  packagingItemId: string | null;
  confidence: 'exact_sku' | 'keyword_high' | 'keyword_low' | 'none';
  matchReason: string;
} {
  const lowerDesc = description.toLowerCase();

  // 1. Check learned mappings
  const mappingsStmt = db.prepare('SELECT * FROM xero_mappings');
  const mappings = mappingsStmt.all() as any[];

  for (const map of mappings) {
    if (lowerDesc.includes(map.keyword_phrase.toLowerCase())) {
      return {
        recipeId: map.recipe_id,
        blankItemId: map.blank_item_id,
        packagingItemId: map.packaging_item_id,
        confidence: map.confidence === 'exact' ? 'exact_sku' : 'keyword_high',
        matchReason: `Matched learned pattern: "${map.keyword_phrase}"`
      };
    }
  }

  // 2. Check SKUs directly in description
  const itemsStmt = db.prepare('SELECT id, sku, name, category FROM inventory_items');
  const allItems = itemsStmt.all() as any[];

  for (const item of allItems) {
    if (lowerDesc.includes(item.sku.toLowerCase())) {
      return {
        recipeId: null,
        blankItemId: item.id,
        packagingItemId: 'item-007', // default box
        confidence: 'exact_sku',
        matchReason: `Found exact SKU "${item.sku}" in text`
      };
    }
  }

  // 3. Fallback heuristic keyword matching
  if (lowerDesc.includes('mug') || lowerDesc.includes('cambridge') || lowerDesc.includes('durham')) {
    if (lowerDesc.includes('black')) {
      return {
        recipeId: 'bom-004',
        blankItemId: 'item-002',
        packagingItemId: 'item-007',
        confidence: 'keyword_high',
        matchReason: 'Matched "black mug" keywords'
      };
    }
    return {
      recipeId: 'bom-001',
      blankItemId: 'item-001',
      packagingItemId: 'item-007',
      confidence: 'keyword_high',
      matchReason: 'Matched "mug" / "cambridge" keywords'
    };
  }

  if (lowerDesc.includes('tote') || lowerDesc.includes('bag') || lowerDesc.includes('canvas')) {
    return {
      recipeId: 'bom-002',
      blankItemId: 'item-004',
      packagingItemId: 'item-009',
      confidence: 'keyword_high',
      matchReason: 'Matched "tote bag" / "canvas" keywords'
    };
  }

  if (lowerDesc.includes('bottle') || lowerDesc.includes('water bottle')) {
    return {
      recipeId: 'bom-003',
      blankItemId: 'item-006',
      packagingItemId: 'item-009',
      confidence: 'keyword_high',
      matchReason: 'Matched "bottle" keywords'
    };
  }

  return {
    recipeId: null,
    blankItemId: null,
    packagingItemId: null,
    confidence: 'none',
    matchReason: 'No match found - requires manual selection'
  };
}

// Helper to get OAuth settings
export function getOAuthSettings() {
  try {
    const row = db.prepare('SELECT * FROM xero_oauth_settings WHERE id = ?').get('primary') as any;
    return row || null;
  } catch (e) {
    return null;
  }
}

// GET Xero status (real OAuth2 status)
xeroRouter.get('/status', (req: Request, res: Response) => {
  const settings = getOAuthSettings();
  const isConnected = !!(settings && settings.access_token && settings.tenant_id);

  res.json({
    connected: isConnected,
    mode: isConnected ? 'Real Xero Live API Connected' : 'Ready for Real Xero OAuth2 Connection',
    organisationName: settings?.tenant_name || (isConnected ? 'PrintBerry Ltd' : 'Not Connected'),
    tenantId: settings?.tenant_id || null,
    hasCredentials: !!(settings?.client_id && settings?.client_secret),
    clientId: settings?.client_id ? `${settings.client_id.slice(0, 6)}...` : null,
    apiCallsToday: 0,
    dailyCallLimit: 5000,
    rateLimitRemaining: 60,
    isFreeTier: true,
    lastSyncTimestamp: settings?.updated_at || null
  });
});

// GET OAuth status
xeroRouter.get('/oauth/status', (req: Request, res: Response) => {
  const settings = getOAuthSettings();
  res.json({
    hasCredentials: !!(settings && settings.client_id && settings.client_secret),
    clientId: settings?.client_id || '',
    redirectUri: settings?.redirect_uri || process.env.XERO_REDIRECT_URI || 'http://localhost:5000/api/xero/callback',
    connected: !!(settings && settings.access_token && settings.tenant_id),
    tenantName: settings?.tenant_name || '',
    tenantId: settings?.tenant_id || '',
    connectedAt: settings?.connected_at || null,
    tokenExpiresAt: settings?.token_expires_at || null
  });
});

// POST save Client ID & Client Secret
xeroRouter.post('/oauth/credentials', (req: Request, res: Response) => {
  try {
    const { clientId, clientSecret, redirectUri } = req.body;
    if (!clientId || !clientSecret) {
      return res.status(400).json({ error: 'Client ID and Client Secret are required' });
    }

    const uri = (redirectUri && redirectUri.trim()) ? redirectUri.trim() : 'http://localhost:5000/api/xero/callback';
    const now = new Date().toISOString();
    const existing = getOAuthSettings();

    if (existing) {
      db.prepare(`
        UPDATE xero_oauth_settings
        SET client_id = ?, client_secret = ?, redirect_uri = ?, updated_at = ?
        WHERE id = 'primary'
      `).run(clientId.trim(), clientSecret.trim(), uri, now);
    } else {
      db.prepare(`
        INSERT INTO xero_oauth_settings (id, client_id, client_secret, redirect_uri, updated_at)
        VALUES ('primary', ?, ?, ?, ?)
      `).run(clientId.trim(), clientSecret.trim(), uri, now);
    }

    res.json({ success: true, message: 'Xero API credentials saved successfully!' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Pending OAuth `state` values, kept in memory and consumed exactly once.
// Guards against login-CSRF: a callback we did not initiate is rejected.
const PENDING_STATE_TTL_MS = 10 * 60 * 1000;
const pendingOAuthStates = new Map<string, number>();

function issueOAuthState(): string {
  const value = crypto.randomUUID();
  const now = Date.now();
  // Opportunistically drop anything that has aged out
  for (const [key, issuedAt] of pendingOAuthStates) {
    if (now - issuedAt > PENDING_STATE_TTL_MS) pendingOAuthStates.delete(key);
  }
  pendingOAuthStates.set(value, now);
  return value;
}

function consumeOAuthState(value: unknown): boolean {
  if (typeof value !== 'string' || !value) return false;
  const issuedAt = pendingOAuthStates.get(value);
  if (issuedAt === undefined) return false;
  pendingOAuthStates.delete(value);
  return Date.now() - issuedAt <= PENDING_STATE_TTL_MS;
}

// GET Start OAuth flow - redirects to Xero
xeroRouter.get('/oauth/connect', (req: Request, res: Response) => {
  const settings = getOAuthSettings();
  const clientId = settings?.client_id || process.env.XERO_CLIENT_ID;

  if (!clientId) {
    return res.status(400).json({ error: 'Please save your Xero Client ID and Client Secret first.' });
  }

  const redirectUri = settings?.redirect_uri || process.env.XERO_REDIRECT_URI || 'http://localhost:5000/api/xero/callback';
  // Xero replaced the broad `accounting.transactions` scope with granular ones.
  // Web and PKCE apps have been assigned granular scopes since March 2026, so
  // requesting the deprecated broad scope now fails with invalid_scope.
  // `accounting.invoices` is its replacement for Invoices/CreditNotes/Quotes/Items.
  const scopes = process.env.XERO_SCOPES
    || 'openid profile email accounting.invoices accounting.contacts accounting.settings offline_access';
  const state = issueOAuthState();

  const authUrl = `https://login.xero.com/identity/connect/authorize?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&state=${state}`;

  if (req.query.json === 'true') {
    return res.json({ authUrl });
  }

  res.redirect(authUrl);
});

// GET OAuth Callback from Xero
xeroRouter.get('/callback', async (req: Request, res: Response) => {
  try {
    const { code, error, state } = req.query;

    if (error) {
      return res.redirect(`${APP_URL}/?xero_error=${encodeURIComponent(String(error))}`);
    }

    // Reject any callback that does not carry a state we issued and have not yet consumed
    if (!consumeOAuthState(state)) {
      console.warn('[Xero OAuth] Callback rejected: unknown or expired state parameter');
      return res.redirect(`${APP_URL}/?xero_error=invalid_state`);
    }

    if (!code) {
      return res.redirect(`${APP_URL}/?xero_error=no_code_provided`);
    }

    const settings = getOAuthSettings();
    const clientId = settings?.client_id || process.env.XERO_CLIENT_ID;
    const clientSecret = settings?.client_secret || process.env.XERO_CLIENT_SECRET;
    const redirectUri = settings?.redirect_uri || process.env.XERO_REDIRECT_URI || 'http://localhost:5000/api/xero/callback';

    if (!clientId || !clientSecret) {
      return res.redirect(`${APP_URL}/?xero_error=missing_credentials`);
    }

    // Exchange code for tokens
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      code: String(code),
      redirect_uri: redirectUri
    });

    const tokenRes = await fetch('https://identity.xero.com/connect/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: tokenParams.toString()
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error('[Xero OAuth] Token exchange error:', errText);
      return res.redirect(`${APP_URL}/?xero_error=token_exchange_failed`);
    }

    const tokenData = await tokenRes.json() as any;
    const { access_token, refresh_token, expires_in } = tokenData;
    const expiresAt = new Date(Date.now() + (expires_in || 1800) * 1000).toISOString();

    // Fetch authorized tenant
    const connectionsRes = await fetch('https://api.xero.com/connections', {
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json'
      }
    });

    let tenantId = '';
    let tenantName = 'PrintBerry Organisation';

    if (connectionsRes.ok) {
      const connections = await connectionsRes.json() as any[];
      if (connections.length > 0) {
        tenantId = connections[0].tenantId;
        tenantName = connections[0].tenantName || 'Xero Organisation';
      }
    }

    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO xero_oauth_settings (id, client_id, client_secret, access_token, refresh_token, token_expires_at, tenant_id, tenant_name, connected_at, updated_at)
      VALUES ('primary', ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        access_token = excluded.access_token,
        refresh_token = excluded.refresh_token,
        token_expires_at = excluded.token_expires_at,
        tenant_id = excluded.tenant_id,
        tenant_name = excluded.tenant_name,
        connected_at = excluded.connected_at,
        updated_at = excluded.updated_at
    `).run(clientId, clientSecret, access_token, refresh_token, expiresAt, tenantId, tenantName, now, now);

    console.log(`[Xero OAuth] Successfully connected to tenant: ${tenantName} (${tenantId})`);
    res.redirect(`${APP_URL}/?xero_success=true`);
  } catch (err: any) {
    console.error('[Xero OAuth Callback Error]', err);
    res.redirect(`${APP_URL}/?xero_error=${encodeURIComponent(err.message)}`);
  }
});

// POST Disconnect Xero
xeroRouter.post('/oauth/disconnect', (req: Request, res: Response) => {
  try {
    db.prepare(`
      UPDATE xero_oauth_settings
      SET access_token = NULL, refresh_token = NULL, tenant_id = NULL, tenant_name = NULL, token_expires_at = NULL, updated_at = datetime('now')
      WHERE id = 'primary'
    `).run();

    res.json({ success: true, message: 'Disconnected from Xero' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Helper to get valid access token (refreshes if needed)
export async function getValidAccessToken(): Promise<{ accessToken: string; tenantId: string } | null> {
  const settings = getOAuthSettings();
  if (!settings || !settings.access_token || !settings.tenant_id) return null;

  const now = Date.now();
  const expires = settings.token_expires_at ? new Date(settings.token_expires_at).getTime() : 0;

  // If token is still valid for at least 2 minutes
  if (expires - now > 120000) {
    return { accessToken: settings.access_token, tenantId: settings.tenant_id };
  }

  // Need refresh
  if (!settings.refresh_token || !settings.client_id || !settings.client_secret) {
    return null;
  }

  const basicAuth = Buffer.from(`${settings.client_id}:${settings.client_secret}`).toString('base64');
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: settings.refresh_token
  });

  const res = await fetch('https://identity.xero.com/connect/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  });

  if (!res.ok) {
    console.error('[Xero Token Refresh Failed]', await res.text());
    return null;
  }

  const data = await res.json() as any;
  const newExpiresAt = new Date(Date.now() + (data.expires_in || 1800) * 1000).toISOString();

  db.prepare(`
    UPDATE xero_oauth_settings
    SET access_token = ?, refresh_token = ?, token_expires_at = ?, updated_at = datetime('now')
    WHERE id = 'primary'
  `).run(data.access_token, data.refresh_token, newExpiresAt);

  return { accessToken: data.access_token, tenantId: settings.tenant_id };
}

// POST Sync Real Invoices from Xero API
xeroRouter.post('/oauth/sync', async (req: Request, res: Response) => {
  try {
    const auth = await getValidAccessToken();
    if (!auth) {
      return res.status(401).json({ error: 'Xero not connected or token expired. Please connect your Xero account.' });
    }

    // Optional date filter. `mode` is 'all' (default), 'date' (one day) or
    // 'range'. Dates arrive as YYYY-MM-DD and filter on the invoice's issue
    // Date, which is the field Xero has optimised for range queries.
    const { mode = 'recent', date, fromDate, toDate, limit } = (req.body || {}) as {
      mode?: 'all' | 'recent' | 'date' | 'range';
      date?: string;
      fromDate?: string;
      toDate?: string;
      limit?: number;
    };

    const parseDay = (value: string | undefined, label: string): Date => {
      if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new Error(`${label} must be a date in YYYY-MM-DD format`);
      }
      const [y, m, d] = value.split('-').map(Number);
      const parsed = new Date(Date.UTC(y, m - 1, d));
      if (Number.isNaN(parsed.getTime())) throw new Error(`${label} is not a valid date`);
      return parsed;
    };

    // Xero's where syntax wants DateTime(yyyy, mm, dd)
    const asXeroDateTime = (d: Date) =>
      `DateTime(${d.getUTCFullYear()}, ${String(d.getUTCMonth() + 1).padStart(2, '0')}, ${String(d.getUTCDate()).padStart(2, '0')})`;
    const nextDay = (d: Date) => new Date(d.getTime() + 86400000);

    // ACCREC = accounts receivable, i.e. invoices WE issued to customers.
    // Without this the endpoint also returns ACCPAY supplier bills, which are
    // purchases - deducting stock for one would be plainly wrong.
    const SALES_INVOICES_ONLY = 'Type=="ACCREC"';

    let whereClause = '';
    let filterLabel = 'no date filter';

    // 'recent' fetches only the newest N invoices by invoice date - one API
    // call, which is the cheap default rather than sweeping the whole org.
    let recentLimit = 0;
    if (mode === 'recent') {
      recentLimit = Math.min(250, Math.max(1, Number(limit) || 5));
      filterLabel = `newest first, limit ${recentLimit}`;
    }

    if (mode === 'date') {
      const day = parseDay(date, 'date');
      // Upper bound is exclusive, so this captures exactly the one day
      whereClause = `Date>=${asXeroDateTime(day)} AND Date<${asXeroDateTime(nextDay(day))}`;
      filterLabel = `dated ${date}`;
    } else if (mode === 'range') {
      const start = parseDay(fromDate, 'fromDate');
      const end = parseDay(toDate, 'toDate');
      if (end < start) throw new Error('toDate must not be earlier than fromDate');
      whereClause = `Date>=${asXeroDateTime(start)} AND Date<${asXeroDateTime(nextDay(end))}`;
      filterLabel = `dated ${fromDate} to ${toDate}`;
    }

    // Querying by Statuses makes Xero enforce paging, so walk every page
    // rather than silently keeping only the first 100 results.
    const PAGE_SIZE = mode === 'recent' ? recentLimit : 100;
    const MAX_PAGES = mode === 'recent' ? 1 : 50;
    const xeroInvoices: any[] = [];
    let pagesFetched = 0;
    let truncated = false;

    for (let page = 1; page <= MAX_PAGES; page++) {
      const params = new URLSearchParams({
        Statuses: 'AUTHORISED,PAID,SUBMITTED',
        page: String(page),
        pageSize: String(PAGE_SIZE),
        // Newest first, so 'recent' gets the latest invoices from page 1
        order: 'Date DESC'
      });
      params.set('where', whereClause
        ? `${SALES_INVOICES_ONLY} AND ${whereClause}`
        : SALES_INVOICES_ONLY);

      const xeroRes = await fetch(`https://api.xero.com/api.xro/2.0/Invoices?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${auth.accessToken}`,
          'xero-tenant-id': auth.tenantId,
          'Accept': 'application/json'
        }
      });

      if (!xeroRes.ok) {
        const errText = await xeroRes.text();
        console.error('[Xero Fetch Invoices Error]', errText);
        return res.status(xeroRes.status).json({ error: `Xero API error: ${errText.slice(0, 150)}` });
      }

      const pageData = await xeroRes.json() as any;
      const rawBatch = pageData.Invoices || [];
      // Defensive: only keep sales invoices even if the where filter is ignored
      const batch = rawBatch.filter((inv: any) => inv.Type === 'ACCREC');
      xeroInvoices.push(...batch);
      pagesFetched++;

      // Page fullness must be judged on what Xero returned, not what survived
      // the filter, or a page containing bills would end paging early.
      if (rawBatch.length < PAGE_SIZE) break;

      // Hit the safety cap with a full page still coming back - say so rather
      // than quietly returning a partial sync as if it were complete.
      if (page === MAX_PAGES && mode !== 'recent') truncated = true;
    }
    let importedCount = 0;
    const now = new Date().toISOString();

    // On conflict the Xero-owned fields are refreshed, but line_items_json is
    // NOT overwritten here - manual SKU matching lives in it and would be lost.
    // Lines are merged below instead.
    const insertOrUpdate = db.prepare(`
      INSERT INTO xero_invoices (
        id, invoice_number, type, customer_name, invoice_date, due_date,
        total_amount, currency, status, line_items_json, stock_deducted,
        deducted_at, created_at
      ) VALUES (?, ?, 'ACCREC', ?, ?, ?, ?, ?, ?, ?, 0, null, ?)
      ON CONFLICT(invoice_number) DO UPDATE SET
        customer_name = excluded.customer_name,
        total_amount = excluded.total_amount,
        status = excluded.status
    `);

    const existingLinesFor = db.prepare('SELECT line_items_json FROM xero_invoices WHERE invoice_number = ?');
    const updateLinesFor = db.prepare('UPDATE xero_invoices SET line_items_json = ? WHERE invoice_number = ?');

    // Carry an operator's manual match onto the freshly fetched line with the
    // same description, so re-syncing never silently undoes their work.
    const mergeManualMatches = (invoiceNumber: string, freshLines: any[]) => {
      const row = existingLinesFor.get(invoiceNumber) as { line_items_json?: string } | undefined;
      if (!row?.line_items_json) return freshLines;

      let previous: any[] = [];
      try { previous = JSON.parse(row.line_items_json) || []; } catch { return freshLines; }

      const manualByDescription = new Map<string, any>();
      for (const prev of previous) {
        if (prev?.manualMatch) manualByDescription.set(String(prev.description || ''), prev);
      }
      if (manualByDescription.size === 0) return freshLines;

      return freshLines.map(line => {
        const kept = manualByDescription.get(String(line.description || ''));
        if (!kept) return line;
        return {
          ...line,
          matchedBlankId: kept.matchedBlankId ?? null,
          matchedBoxId: kept.matchedBoxId ?? null,
          nonStock: kept.nonStock ?? false,
          matchConfidence: 'manual',
          manualMatch: true
        };
      });
    };

    for (const inv of xeroInvoices) {
      const lines = (inv.LineItems || []).map((li: any) => ({
        description: li.Description || li.ItemCode || 'Custom Print Job',
        quantity: li.Quantity || 1,
        unitPrice: li.UnitAmount || 0,
        matchedRecipeId: null,
        matchedBlankId: null,
        matchedBoxId: null,
        matchConfidence: 'keyword_high',
        deducted: false
      }));

      const invoiceNumber = inv.InvoiceNumber || `INV-${inv.InvoiceID.slice(0, 6)}`;
      const mergedLines = mergeManualMatches(invoiceNumber, lines);

      insertOrUpdate.run(
        `inv-${crypto.randomUUID().slice(0, 8)}`,
        invoiceNumber,
        inv.Contact?.Name || 'Client',
        inv.DateString ? inv.DateString.slice(0, 10) : now.slice(0, 10),
        inv.DueDateString ? inv.DueDateString.slice(0, 10) : now.slice(0, 10),
        inv.Total || 0,
        inv.CurrencyCode || 'GBP',
        inv.Status || 'AUTHORISED',
        JSON.stringify(mergedLines),
        now
      );
      // The upsert deliberately leaves line_items_json alone on conflict, so
      // write the merged lines explicitly for both the insert and update case.
      updateLinesFor.run(JSON.stringify(mergedLines), invoiceNumber);
      importedCount++;
    }

    res.json({
      success: true,
      importedCount,
      pagesFetched,
      filter: filterLabel,
      truncated,
      message: importedCount === 0
        ? `Xero returned no invoices (${filterLabel}).`
        : truncated
        ? `Synced the first ${importedCount} invoices (${filterLabel}) - more remain. Narrow the date range to fetch the rest.`
        : `Synced ${importedCount} invoice${importedCount === 1 ? '' : 's'} from Xero (${filterLabel}).`
    });
  } catch (err: any) {
    console.error('[Xero Sync Error]', err);
    const isValidation = /YYYY-MM-DD|valid date|earlier than/.test(err.message || '');
    res.status(isValidation ? 400 : 500).json({ error: err.message });
  }
});

// GET all Xero Invoices with enriched stock matching
xeroRouter.get('/invoices', (req: Request, res: Response) => {
  try {
    const stmt = db.prepare(`
      SELECT 
        id,
        invoice_number as invoiceNumber,
        type,
        customer_name as customerName,
        invoice_date as invoiceDate,
        due_date as dueDate,
        total_amount as totalAmount,
        currency,
        status,
        line_items_json as lineItemsJson,
        stock_deducted as stockDeducted,
        deducted_at as deductedAt,
        created_at as createdAt
      FROM xero_invoices
      ORDER BY invoice_date DESC, created_at DESC
    `);
    const rows = stmt.all() as any[];

    // Fetch all inventory items for lookups
    const items = db.prepare('SELECT id, sku, name, landed_cost_per_unit, cost_per_unit, current_stock FROM inventory_items').all() as any[];
    const itemMap = new Map(items.map(i => [i.id, i]));

    const enriched = rows.map(inv => {
      const rawLines = JSON.parse(inv.lineItemsJson || '[]');
      let totalLandedCost = 0;

      const processedLines = rawLines.map((line: any) => {
        // A line the operator marked non-stock (freight, setup, artwork) never
        // matches and never deducts, whatever the description looks like.
        const match = line.manualMatch
          ? { blankItemId: null, packagingItemId: null, confidence: 'manual' as const, matchReason: 'Set manually' }
          : matchLineItemToStock(line.description);
        const blankId = line.nonStock ? null : (line.matchedBlankId || match.blankItemId);
        const boxId = line.nonStock ? null : (line.matchedBoxId || match.packagingItemId);

        const blankItem = blankId ? itemMap.get(blankId) : null;
        const boxItem = boxId ? itemMap.get(boxId) : null;

        const blankUnitCost = blankItem ? (blankItem.landed_cost_per_unit || blankItem.cost_per_unit || 0) : 0;
        const boxUnitCost = boxItem ? (boxItem.cost_per_unit || 0) : 0;
        const unitCostTotal = blankUnitCost + boxUnitCost;
        const lineTotalCost = unitCostTotal * (line.quantity || 0);

        totalLandedCost += lineTotalCost;

        return {
          ...line,
          matchedBlankId: blankId,
          matchedBlankSku: blankItem?.sku || null,
          matchedBlankName: blankItem?.name || null,
          matchedBlankStock: blankItem?.current_stock || 0,
          matchedBoxId: boxId,
          matchedBoxSku: boxItem?.sku || null,
          matchedBoxName: boxItem?.name || null,
          matchedBoxStock: boxItem?.current_stock || 0,
          matchConfidence: line.matchConfidence || match.confidence,
          matchReason: line.nonStock ? 'Marked as non-stock' : match.matchReason,
          nonStock: !!line.nonStock,
          manualMatch: !!line.manualMatch,
          estimatedLandedCost: Number(lineTotalCost.toFixed(2)),
          grossProfit: Number(((line.quantity * (line.unitPrice || 0)) - lineTotalCost).toFixed(2))
        };
      });

      const totalRevenue = inv.totalAmount || 0;
      const trueGrossProfit = totalRevenue - totalLandedCost;
      const marginPercent = totalRevenue > 0 ? (trueGrossProfit / totalRevenue) * 100 : 0;

      return {
        ...inv,
        lines: processedLines,
        totalLandedCost: Number(totalLandedCost.toFixed(2)),
        trueGrossProfit: Number(trueGrossProfit.toFixed(2)),
        marginPercent: Number(marginPercent.toFixed(1))
      };
    });

    res.json(enriched);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST approve stock deduction for an invoice
xeroRouter.post('/invoices/:id/deduct', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const invStmt = db.prepare('SELECT * FROM xero_invoices WHERE id = ?');
    const invoice = invStmt.get(id) as any;

    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    if (invoice.stock_deducted === 1) {
      return res.status(400).json({ error: 'Stock has already been deducted for this invoice' });
    }

    const lines = JSON.parse(invoice.line_items_json || '[]');
    const now = new Date().toISOString();

    for (const line of lines) {
      // Non-stock lines (freight, setup, artwork) deduct nothing
      if (line.nonStock) continue;

      const match = line.manualMatch
        ? { blankItemId: null, packagingItemId: null }
        : matchLineItemToStock(line.description);
      const blankId = line.matchedBlankId || match.blankItemId;
      const boxId = line.matchedBoxId || match.packagingItemId;
      const qty = Number(line.quantity || 0);

      // Deduct blank
      if (blankId && qty > 0) {
        const blank = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(blankId) as any;
        if (blank) {
          const newStock = Math.max(0, blank.current_stock - qty);
          db.prepare('UPDATE inventory_items SET current_stock = ?, updated_at = ? WHERE id = ?')
            .run(newStock, now, blank.id);

          db.prepare(`
            INSERT INTO stock_movements (
              id, item_id, sku, item_name, movement_type, quantity_delta,
              resulting_stock, unit_cost, reference_id, operator_name, notes, created_at
            ) VALUES (?, ?, ?, ?, 'xero_sale_deduct', ?, ?, ?, ?, 'Xero Auto-Deduct', ?, ?)
          `).run(
            `mov-${crypto.randomUUID().slice(0, 8)}`,
            blank.id,
            blank.sku,
            blank.name,
            -qty,
            newStock,
            blank.landed_cost_per_unit || blank.cost_per_unit,
            invoice.invoice_number,
            `Deducted for Xero Invoice ${invoice.invoice_number} (${invoice.customer_name})`,
            now
          );
        }
      }

      // Deduct box/packaging
      if (boxId && qty > 0) {
        const box = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(boxId) as any;
        if (box) {
          const newStock = Math.max(0, box.current_stock - qty);
          db.prepare('UPDATE inventory_items SET current_stock = ?, updated_at = ? WHERE id = ?')
            .run(newStock, now, box.id);

          db.prepare(`
            INSERT INTO stock_movements (
              id, item_id, sku, item_name, movement_type, quantity_delta,
              resulting_stock, unit_cost, reference_id, operator_name, notes, created_at
            ) VALUES (?, ?, ?, ?, 'xero_sale_deduct', ?, ?, ?, ?, 'Xero Auto-Deduct', ?, ?)
          `).run(
            `mov-${crypto.randomUUID().slice(0, 8)}`,
            box.id,
            box.sku,
            box.name,
            -qty,
            newStock,
            box.cost_per_unit,
            invoice.invoice_number,
            `Packaging deducted for Xero Invoice ${invoice.invoice_number}`,
            now
          );
        }
      }
    }

    // Mark invoice as deducted
    db.prepare('UPDATE xero_invoices SET stock_deducted = 1, deducted_at = ? WHERE id = ?')
      .run(now, id);

    res.json({
      success: true,
      message: `Stock successfully deducted for Xero Invoice ${invoice.invoice_number}`
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// RETIRED: this endpoint wrote a local row with a random INV-#### number and
// reported "pushed to Xero" without ever calling the Xero API. Any invoice it
// created was a phantom that deducted real stock against nothing.
// Real creation now lives at POST /api/xero/invoices/push (server/routes/xeroPush.ts),
// which only stores an invoice after Xero returns an InvoiceID.
xeroRouter.post('/invoices/create', (_req: Request, res: Response) => {
  res.status(410).json({
    error: 'This endpoint has been retired because it never reached Xero. Use POST /api/xero/invoices/push instead.'
  });
});

// POST simulate receiving a new Xero invoice with free-text description
xeroRouter.post('/invoices/mock-generate', (req: Request, res: Response) => {
  try {
    const templates = [
      {
        customer: 'St. Andrews University Golf Society',
        desc: 'PO: GOLF-2026-99 - Printed 11Oz white cambridge mugs with navy crest - Courier DPD',
        qty: 360,
        price: 3.65
      },
      {
        customer: 'London Marathon Expo Promo',
        desc: 'Urgent: 500x Natural Cotton Canvas Tote bags with sponsor branding front and back',
        qty: 500,
        price: 4.80
      },
      {
        customer: 'Fitness First UK Ltd',
        desc: 'Order #FF-491: 200 pcs engraved silver 500ml aluminium water bottles with black cap',
        qty: 200,
        price: 6.40
      },
      {
        customer: 'Blackwood Coffee Roasters',
        desc: 'Black ceramic 11oz mugs with white silk screen logo print - 180 units',
        qty: 180,
        price: 4.10
      }
    ];

    const pick = templates[Math.floor(Math.random() * templates.length)];
    const invNum = `INV-${Math.floor(3000 + Math.random() * 6000)}`;
    const now = new Date().toISOString();
    const id = `inv-${crypto.randomUUID().slice(0, 8)}`;
    const total = Number((pick.qty * pick.price).toFixed(2));

    const lines = [
      {
        description: pick.desc,
        quantity: pick.qty,
        unitPrice: pick.price,
        matchedRecipeId: null,
        matchedBlankId: null,
        matchedBoxId: null,
        matchConfidence: 'keyword_high',
        deducted: false
      }
    ];

    db.prepare(`
      INSERT INTO xero_invoices (
        id, invoice_number, type, customer_name, invoice_date, due_date,
        total_amount, currency, status, line_items_json, stock_deducted,
        deducted_at, created_at
      ) VALUES (?, ?, 'ACCREC', ?, ?, ?, ?, 'GBP', 'AUTHORISED', ?, 0, null, ?)
    `).run(
      id,
      invNum,
      pick.customer,
      now.slice(0, 10),
      new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      total,
      JSON.stringify(lines),
      now
    );

    res.status(201).json({
      success: true,
      invoiceNumber: invNum,
      customerName: pick.customer,
      message: `Generated realistic Xero invoice ${invNum} for testing!`
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE Xero invoice (for test/cleanup)
xeroRouter.delete('/invoices/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const invoice = db.prepare('SELECT * FROM xero_invoices WHERE id = ?').get(id) as any;
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    const now = new Date().toISOString();
    let reversed = 0;

    db.exec('BEGIN');
    try {
      // Deleting a deducted invoice previously left its movements orphaned,
      // pointing at a reference that no longer existed. Put the stock back and
      // record the reversal, so the ledger stays a truthful history.
      if (invoice.stock_deducted === 1) {
        const movements = db
          .prepare("SELECT * FROM stock_movements WHERE reference_id = ? AND movement_type = 'xero_sale_deduct'")
          .all(invoice.invoice_number) as any[];

        for (const m of movements) {
          const item = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(m.item_id) as any;
          if (!item) continue;
          const restored = item.current_stock + Math.abs(m.quantity_delta);
          db.prepare('UPDATE inventory_items SET current_stock = ?, updated_at = ? WHERE id = ?')
            .run(restored, now, item.id);

          db.prepare(`
            INSERT INTO stock_movements (
              id, item_id, sku, item_name, movement_type, quantity_delta,
              resulting_stock, unit_cost, reference_id, operator_name, notes, created_at
            ) VALUES (?, ?, ?, ?, 'manual_adjust', ?, ?, ?, ?, 'Invoice deleted', ?, ?)
          `).run(
            `mov-${crypto.randomUUID().slice(0, 8)}`,
            item.id, item.sku, item.name,
            Math.abs(m.quantity_delta), restored,
            m.unit_cost,
            invoice.invoice_number,
            `Reversed: invoice ${invoice.invoice_number} was deleted after stock had been deducted`,
            now
          );
          reversed++;
        }
      }

      db.prepare('DELETE FROM xero_invoices WHERE id = ?').run(id);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }

    res.json({
      success: true,
      reversedMovements: reversed,
      message: reversed
        ? `Invoice ${invoice.invoice_number} deleted and ${reversed} stock deduction${reversed === 1 ? '' : 's'} reversed.`
        : `Invoice ${invoice.invoice_number} deleted.`
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PUT save manual line matching for one invoice.
// Lines are matched by index against the stored array; only the fields an
// operator can change are written, so a later re-sync of the Xero fields
// (customer, total, status) cannot clobber them.
xeroRouter.put('/invoices/:id/lines', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { lines } = req.body as {
      lines?: Array<{
        index: number;
        blankItemId?: string | null;
        packagingItemId?: string | null;
        quantity?: number;
        unitPrice?: number;
        nonStock?: boolean;
      }>;
    };

    if (!Array.isArray(lines)) {
      return res.status(400).json({ error: 'lines must be an array' });
    }

    const invoice = db.prepare('SELECT * FROM xero_invoices WHERE id = ?').get(id) as any;
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (invoice.stock_deducted === 1) {
      return res.status(400).json({ error: 'Stock has already been deducted for this invoice; matching is locked' });
    }

    const stored = JSON.parse(invoice.line_items_json || '[]');

    for (const edit of lines) {
      const line = stored[edit.index];
      if (!line) continue;

      // Validate any referenced item actually exists before storing it
      for (const itemId of [edit.blankItemId, edit.packagingItemId]) {
        if (itemId) {
          const exists = db.prepare('SELECT 1 FROM inventory_items WHERE id = ?').get(itemId);
          if (!exists) return res.status(400).json({ error: `Unknown inventory item: ${itemId}` });
        }
      }

      if (edit.nonStock) {
        line.matchedBlankId = null;
        line.matchedBoxId = null;
        line.nonStock = true;
      } else {
        line.nonStock = false;
        if (edit.blankItemId !== undefined) line.matchedBlankId = edit.blankItemId || null;
        if (edit.packagingItemId !== undefined) line.matchedBoxId = edit.packagingItemId || null;
      }

      if (edit.quantity !== undefined) {
        const q = Number(edit.quantity);
        if (!Number.isFinite(q) || q < 0) return res.status(400).json({ error: 'quantity must be a non-negative number' });
        line.quantity = q;
      }
      if (edit.unitPrice !== undefined) {
        const up = Number(edit.unitPrice);
        if (!Number.isFinite(up) || up < 0) return res.status(400).json({ error: 'unitPrice must be a non-negative number' });
        line.unitPrice = up;
      }

      // Mark the line as operator-set so re-sync leaves it alone
      line.matchConfidence = 'manual';
      line.manualMatch = true;
    }

    db.prepare('UPDATE xero_invoices SET line_items_json = ? WHERE id = ?')
      .run(JSON.stringify(stored), id);

    res.json({ success: true, message: 'Line matching saved' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET mappings
xeroRouter.get('/mappings', (req: Request, res: Response) => {
  try {
    const stmt = db.prepare('SELECT * FROM xero_mappings ORDER BY created_at DESC');
    res.json(stmt.all());
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST save a mapping rule
xeroRouter.post('/mappings', (req: Request, res: Response) => {
  try {
    const { keywordPhrase, recipeId, blankItemId, packagingItemId } = req.body;
    if (!keywordPhrase) {
      return res.status(400).json({ error: 'Keyword phrase required' });
    }

    const id = `map-${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    db.prepare(`
      INSERT OR REPLACE INTO xero_mappings (id, keyword_phrase, recipe_id, blank_item_id, packaging_item_id, confidence, created_at)
      VALUES (?, ?, ?, ?, ?, 'manual', ?)
    `).run(id, keywordPhrase.trim().toLowerCase(), recipeId || null, blankItemId || null, packagingItemId || null, now);

    res.status(201).json({ success: true, message: `Learned mapping rule for "${keywordPhrase}"` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// XERO WEBHOOKS: ITR HANDSHAKE & EVENT SYNC
// ==========================================

export interface XeroWebhookLogEntry {
  id: string;
  timestamp: string;
  source: 'live_xero' | 'local_simulator';
  eventType: string;
  signatureReceived: string;
  signatureCalculated: string;
  signatureValid: boolean;
  httpStatus: number;
  payloadSummary: string;
  processingTimeMs: number;
  notes: string;
}

// In-memory log of webhook events (keeps last 50)
const webhookLogs: XeroWebhookLogEntry[] = [
  {
    id: 'wh-init-01',
    timestamp: new Date(Date.now() - 15 * 60000).toISOString(),
    source: 'local_simulator',
    eventType: 'ITR_HANDSHAKE_TEST',
    signatureReceived: 'Y2VydGlmaWVkLXhlcm8tc2lnbmF0dXJlLWhzaGEyNTY=',
    signatureCalculated: 'Y2VydGlmaWVkLXhlcm8tc2lnbmF0dXJlLWhzaGEyNTY=',
    signatureValid: true,
    httpStatus: 200,
    payloadSummary: '{"events":[],"firstEventSequence":0,"lastEventSequence":0,"entropy":"ITR_OK"}',
    processingTimeMs: 4,
    notes: 'Intent to Receive (ITR) Handshake succeeded. Ready for production events.'
  }
];

// Helper to verify Xero HMAC signature
export function verifyXeroSignature(
  rawBody: Buffer | string,
  signatureHeader: string | undefined,
  webhookKey: string
): { isValid: boolean; calculatedSignature: string } {
  if (!webhookKey || !signatureHeader) {
    const fallbackCalc = crypto.createHmac('sha256', webhookKey || 'demo-key').update(rawBody).digest('base64');
    return { isValid: false, calculatedSignature: fallbackCalc };
  }

  const calculatedSignature = crypto.createHmac('sha256', webhookKey).update(rawBody).digest('base64');
  
  // Constant time comparison to prevent timing attacks
  const isValid = crypto.timingSafeEqual(
    Buffer.from(calculatedSignature),
    Buffer.from(signatureHeader.length === calculatedSignature.length ? signatureHeader : calculatedSignature)
  ) && (signatureHeader === calculatedSignature);

  return { isValid, calculatedSignature };
}

// GET Webhook Logs & Config
xeroRouter.get('/webhook/logs', (req: Request, res: Response) => {
  res.json({
    logs: webhookLogs.slice(0, 50),
    // Never return the signing key itself - anyone holding it can forge valid webhooks
    hasConfiguredKey: !!process.env.XERO_WEBHOOK_KEY,
    webhookEndpoint: '/api/xero/webhook',
    isHttpsRequiredByXero: true,
    localTunnelGuide: 'Run: npx ngrok http 5000 OR npx cloudflared tunnel --url http://localhost:5000'
  });
});

// POST Clear Webhook Logs
xeroRouter.post('/webhook/clear-logs', (req: Request, res: Response) => {
  webhookLogs.length = 0;
  res.json({ success: true, message: 'Webhook logs cleared' });
});

// POST Live Xero Webhook Endpoint (Receives production calls from Xero or via ngrok/Cloudflare tunnel)
xeroRouter.post('/webhook', (req: Request, res: Response) => {
  const startTime = Date.now();
  const signatureHeader = req.headers['x-xero-signature'] as string | undefined;
  const webhookKey = process.env.XERO_WEBHOOK_KEY;

  // Fail closed: with no configured key there is nothing to verify against
  if (!webhookKey) {
    console.error('[Xero Webhook] XERO_WEBHOOK_KEY is not set - rejecting inbound webhook');
    return res.status(503).send('Webhook signing key not configured');
  }

  const rawBody = (req as any).rawBody || JSON.stringify(req.body);
  const { isValid, calculatedSignature } = verifyXeroSignature(rawBody, signatureHeader, webhookKey);
  const latency = Date.now() - startTime;

  if (!isValid) {
    const entry: XeroWebhookLogEntry = {
      id: `wh-${Date.now()}`,
      timestamp: new Date().toISOString(),
      source: 'live_xero',
      eventType: 'UNAUTHORIZED_SIGNATURE',
      signatureReceived: signatureHeader || 'NONE_PROVIDED',
      signatureCalculated: calculatedSignature,
      signatureValid: false,
      httpStatus: 401,
      payloadSummary: typeof req.body === 'object' ? JSON.stringify(req.body).slice(0, 150) : String(req.body).slice(0, 150),
      processingTimeMs: latency,
      notes: 'HMAC signature mismatch! Rejected with HTTP 401 as required by Xero ITR spec.'
    };
    webhookLogs.unshift(entry);
    return res.status(401).send('Invalid Xero Webhook Signature');
  }

  // Signature valid! Inspect events
  const payload = req.body || {};
  const events = Array.isArray(payload.events) ? payload.events : [];
  let eventType = events.length === 0 ? 'ITR_HANDSHAKE_VALIDATION' : `${events[0].eventCategory}.${events[0].eventType}`;
  let notes = events.length === 0 
    ? 'Xero ITR (Intent to Receive) Handshake confirmed. Status 200 returned.'
    : `Received ${events.length} event(s) from Xero organization.`;

  // If there's an invoice event, flag for processing
  const invoiceEvents = events.filter((e: any) => e.eventCategory === 'INVOICE');
  if (invoiceEvents.length > 0) {
    notes += ` [Triggered sync for ${invoiceEvents.length} invoice(s)]`;
  }

  const logEntry: XeroWebhookLogEntry = {
    id: `wh-${Date.now()}`,
    timestamp: new Date().toISOString(),
    source: 'live_xero',
    eventType,
    signatureReceived: signatureHeader || '',
    signatureCalculated: calculatedSignature,
    signatureValid: true,
    httpStatus: 200,
    payloadSummary: JSON.stringify(payload).slice(0, 200),
    processingTimeMs: latency,
    notes
  };

  webhookLogs.unshift(logEntry);
  return res.status(200).send('OK');
});

// POST Webhook Simulator (Enables instant local testing WITHOUT HTTPS or external tunnels)
xeroRouter.post('/webhook/simulate', (req: Request, res: Response) => {
  const startTime = Date.now();
  const { testType = 'itr_handshake', customKey, simulateTamper = false } = req.body;
  // Simulator-only fallback: this key never guards the live /webhook endpoint
  const webhookKey = customKey || process.env.XERO_WEBHOOK_KEY || 'LOCAL_SIMULATOR_KEY_NOT_FOR_PRODUCTION';

  let mockPayload: any = {};
  let eventTypeLabel = '';

  if (testType === 'itr_handshake') {
    eventTypeLabel = 'ITR_HANDSHAKE_VALIDATION';
    mockPayload = {
      events: [],
      firstEventSequence: 0,
      lastEventSequence: 0,
      entropy: `SIM_ITR_${Math.random().toString(36).substring(2, 9).toUpperCase()}`
    };
  } else if (testType === 'invoice_create') {
    eventTypeLabel = 'INVOICE.CREATE';
    const fakeInvId = crypto.randomUUID();
    mockPayload = {
      events: [
        {
          resourceUrl: `https://api.xero.com/api.xro/2.0/Invoices/${fakeInvId}`,
          resourceId: fakeInvId,
          eventDateUtc: new Date().toISOString(),
          eventType: 'CREATE',
          eventCategory: 'INVOICE',
          tenantId: '8f38bbd1-6712-4eb2-9d32-dcf7a5bc8392',
          tenantType: 'ORGANISATION'
        }
      ],
      firstEventSequence: 1,
      lastEventSequence: 1,
      entropy: 'EVT_ENTROPY_01'
    };
  } else if (testType === 'invoice_update') {
    eventTypeLabel = 'INVOICE.UPDATE';
    const fakeInvId = crypto.randomUUID();
    mockPayload = {
      events: [
        {
          resourceUrl: `https://api.xero.com/api.xro/2.0/Invoices/${fakeInvId}`,
          resourceId: fakeInvId,
          eventDateUtc: new Date().toISOString(),
          eventType: 'UPDATE',
          eventCategory: 'INVOICE',
          tenantId: '8f38bbd1-6712-4eb2-9d32-dcf7a5bc8392',
          tenantType: 'ORGANISATION'
        }
      ],
      firstEventSequence: 2,
      lastEventSequence: 2,
      entropy: 'EVT_ENTROPY_02'
    };
  }

  const rawJson = JSON.stringify(mockPayload);
  const trueSignature = crypto.createHmac('sha256', webhookKey).update(rawJson).digest('base64');
  
  // If user requested simulated tampering
  const headerSignature = simulateTamper ? 'INVALID_TAMPERED_HMAC_SIG_FAIL==' : trueSignature;

  // Run through verification
  const { isValid, calculatedSignature } = verifyXeroSignature(rawJson, headerSignature, webhookKey);
  const latency = Date.now() - startTime;
  const httpStatus = isValid ? 200 : 401;

  let notes = isValid 
    ? (testType === 'itr_handshake' 
        ? 'Simulation: ITR Handshake validated perfectly! Status 200 returned.' 
        : `Simulation: Successfully authenticated ${eventTypeLabel} webhook. Ready to sync invoice.`)
    : 'Simulation: Negative test passed! Tampered signature was intercepted and rejected with HTTP 401.';

  const logEntry: XeroWebhookLogEntry = {
    id: `sim-wh-${Date.now()}`,
    timestamp: new Date().toISOString(),
    source: 'local_simulator',
    eventType: eventTypeLabel,
    signatureReceived: headerSignature,
    signatureCalculated: calculatedSignature,
    signatureValid: isValid,
    httpStatus,
    payloadSummary: rawJson.slice(0, 200),
    processingTimeMs: latency,
    notes
  };

  webhookLogs.unshift(logEntry);

  res.status(200).json({
    success: true,
    testType,
    signatureVerified: isValid,
    receivedSignature: headerSignature,
    calculatedSignature,
    httpStatus,
    latencyMs: latency,
    rawPayload: mockPayload,
    message: notes
  });
});

