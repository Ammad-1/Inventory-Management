import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import { db } from '../db';
import { calculateQuote, markupToMargin, marginToMarkup } from '../../shared/quotePricing';
import {
  XeroAuth, xeroFetch, describeXeroError, taxTypeForRate,
  mirrorInvoiceLocally, deductForInvoice
} from '../services/xeroInvoice';
import { buildInvoiceLines, resolveStockForLines } from '../services/quoteToInvoice';
import { buildQuotePdf, CompanyDetails } from '../services/quotePdf';

/**
 * Quotes.
 *
 * Pricing is computed here, from shared/quotePricing.ts, and never taken
 * from the request. A client can say what the customer wants and how much
 * markup to apply; it cannot say what the total is.
 *
 * Line costs are snapshotted when the quote is saved. A quote already sent
 * to a customer must not change because a blank got more expensive.
 */
export function createQuotesRouter(
  getValidAccessToken: () => Promise<XeroAuth | null>
) {
const quotesRouter = Router();

const now = () => new Date().toISOString();
const uid = (p: string) => `${p}-${crypto.randomUUID().slice(0, 8)}`;

/** PBQ-0001, PBQ-0002 ... Derived from the highest existing number. */
function nextQuoteNumber(): string {
  const row = db.prepare(`
    SELECT quote_number FROM quotes
    WHERE quote_number LIKE 'PBQ-%'
    ORDER BY CAST(SUBSTR(quote_number, 5) AS INTEGER) DESC LIMIT 1
  `).get() as any;
  const last = row ? parseInt(String(row.quote_number).slice(4), 10) : 0;
  return `PBQ-${String((Number.isFinite(last) ? last : 0) + 1).padStart(4, '0')}`;
}

/* -------------------------------------------------------------- reference */

quotesRouter.get('/reference', (_req: Request, res: Response) => {
  try {
    res.json({
      customers: db.prepare(`
        SELECT contact_id as contactId, name, email
        FROM xero_contacts WHERE is_customer = 1 ORDER BY name
      `).all(),
      salesReps: db.prepare('SELECT id, name, email FROM sales_reps WHERE active = 1 ORDER BY name').all(),
      shippingMethods: ['Standard Shipping', 'Express Shipping', 'Next Day', 'Collection', 'Pallet'],
      // 20% is the UK standard rate; the others cover zero-rated and export work
      vatRates: [
        { rate: 20, label: '20% standard' },
        { rate: 5, label: '5% reduced' },
        { rate: 0, label: '0% zero-rated / export' }
      ],
      markupPresets: [20, 25, 30].map(pct => ({
        markupPct: pct,
        // Shown together so "30%" is never mistaken for a 30% margin
        marginPct: markupToMargin(pct)
      })),
      marginToMarkup: [20, 25, 30].map(pct => ({ marginPct: pct, markupPct: marginToMarkup(pct) }))
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

quotesRouter.get('/company', (_req: Request, res: Response) => {
  try {
    const row = db.prepare('SELECT * FROM company_details WHERE id = ?').get('primary') as any;
    res.json({
      name: row?.name || '',
      addressLines: row?.address_lines || '',
      email: row?.email || '',
      phone: row?.phone || '',
      website: row?.website || '',
      vatNumber: row?.vat_number || '',
      registrationNumber: row?.registration_number || '',
      quoteTerms: row?.quote_terms || ''
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

quotesRouter.put('/company', (req: Request, res: Response) => {
  try {
    const b = req.body || {};
    if (!b.name || !String(b.name).trim()) {
      return res.status(400).json({ error: 'Company name is required — it is the letterhead' });
    }
    db.prepare(`
      UPDATE company_details SET
        name = ?, address_lines = ?, email = ?, phone = ?,
        website = ?, vat_number = ?, registration_number = ?, quote_terms = ?, updated_at = ?
      WHERE id = 'primary'
    `).run(
      String(b.name).trim(), b.addressLines || null, b.email || null, b.phone || null,
      b.website || null, b.vatNumber || null, b.registrationNumber || null,
      b.quoteTerms || null, now()
    );
    res.json({ success: true, message: 'Company details saved' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ------------------------------------------------------------ sales reps */

quotesRouter.put('/sales-reps', (req: Request, res: Response) => {
  try {
    const { name, email } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'A name is required' });
    db.prepare(`
      INSERT INTO sales_reps (id, name, email, active) VALUES (?, ?, ?, 1)
      ON CONFLICT(name) DO UPDATE SET email = excluded.email, active = 1
    `).run(uid('rep'), String(name).trim(), email || null);
    res.json({ success: true, message: `${String(name).trim()} added` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

quotesRouter.delete('/sales-reps/:id', (req: Request, res: Response) => {
  try {
    // Deactivated rather than deleted: old quotes still name them
    db.prepare('UPDATE sales_reps SET active = 0 WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: 'Sales person removed' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ---------------------------------------------------------------- quotes */

const hydrate = (q: any) => {
  const lines = (db.prepare(`
    SELECT * FROM quote_lines WHERE quote_id = ? ORDER BY sort_order
  `).all(q.id) as any[]).map(l => ({
    id: l.id,
    productId: l.product_id,
    productSku: l.product_sku,
    productName: l.product_name,
    imageUrl: l.image_url,
    description: l.description,
    quantity: l.quantity,
    blankCost: l.blank_cost,
    packagingCost: l.packaging_cost,
    decorationUnitCost: l.decoration_unit_cost,
    setupCost: l.setup_cost,
    minCharge: l.min_charge,
    unitCost: l.unit_cost,
    lineCost: l.line_cost,
    minChargeApplied: !!l.min_charge_applied,
    decorations: db.prepare(`
      SELECT id, decoration_type_id as decorationTypeId, decoration_name as decorationName,
             print_area_id as printAreaId, print_area_name as printAreaName,
             setup_cost as setupCost, unit_cost as unitCost
      FROM quote_line_decorations WHERE quote_line_id = ?
    `).all(l.id)
  }));

  return {
    id: q.id,
    quoteNumber: q.quote_number,
    status: q.status,
    contactId: q.contact_id,
    customerName: q.customer_name,
    customerEmail: q.customer_email,
    customerReference: q.customer_reference,
    salesRep: q.sales_rep,
    quoteDate: q.quote_date,
    validUntil: q.valid_until,
    leadTime: q.lead_time,
    billingAddress: q.billing_address,
    deliveryAddress: q.delivery_address,
    deliverySameAsBilling: !!q.delivery_same_as_billing,
    cartonCount: q.carton_count,
    shippingMethod: q.shipping_method,
    shippingCost: q.shipping_cost,
    expressFee: q.express_fee,
    shippingNotes: q.shipping_notes,
    markupPct: q.markup_pct,
    vatRate: q.vat_rate,
    discount: q.discount,
    notes: q.notes,
    goodsCost: q.goods_cost,
    totalCost: q.total_cost,
    netTotal: q.net_total,
    vatTotal: q.vat_total,
    grossTotal: q.gross_total,
    profit: q.profit,
    marginPct: q.margin_pct,
    xeroInvoiceId: q.xero_invoice_id,
    xeroInvoiceNumber: q.xero_invoice_number,
    createdAt: q.created_at,
    updatedAt: q.updated_at,
    sentAt: q.sent_at,
    decidedAt: q.decided_at,
    lines
  };
};

quotesRouter.get('/', (req: Request, res: Response) => {
  try {
    const { status, search } = req.query as Record<string, string>;
    let sql = 'SELECT * FROM quotes WHERE 1 = 1';
    const params: any[] = [];
    if (status && status !== 'all') { sql += ' AND status = ?'; params.push(status); }
    if (search) {
      sql += ' AND (quote_number LIKE ? OR customer_name LIKE ? OR customer_reference LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    sql += ' ORDER BY created_at DESC';
    res.json((db.prepare(sql).all(...params) as any[]).map(hydrate));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

quotesRouter.get('/:id', (req: Request, res: Response) => {
  try {
    const q = db.prepare('SELECT * FROM quotes WHERE id = ?').get(req.params.id) as any;
    if (!q) return res.status(404).json({ error: 'Quote not found' });
    res.json(hydrate(q));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Price a draft without saving it, so the builder can show live totals
 * from the same code that will store them.
 */
quotesRouter.post('/preview', (req: Request, res: Response) => {
  try {
    res.json(priceFromBody(req.body || {}));
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

/** Build the costing input from a request body, resolving real stock costs. */
function priceFromBody(body: any) {
  const lines = (body.lines || []).map((l: any) => {
    const decorations = l.decorations || [];
    return {
      quantity: Number(l.quantity) || 0,
      blankCost: Number(l.blankCost) || 0,
      packagingCost: Number(l.packagingCost) || 0,
      decorationUnitCost: decorations.reduce((s: number, d: any) => s + (Number(d.unitCost) || 0), 0),
      setupCost: decorations.reduce((s: number, d: any) => s + (Number(d.setupCost) || 0), 0),
      minCharge: Number(l.minCharge) || 0
    };
  });

  return calculateQuote({
    lines,
    shippingCost: Number(body.shippingCost) || 0,
    expressFee: Number(body.expressFee) || 0,
    markupPct: Number(body.markupPct) || 0,
    vatRate: body.vatRate === undefined ? 20 : Number(body.vatRate),
    discount: Number(body.discount) || 0
  });
}

/** Create or update a quote. Totals are recomputed here, always. */
quotesRouter.put('/', (req: Request, res: Response) => {
  try {
    const b = req.body || {};

    if (!b.customerName || !String(b.customerName).trim()) {
      return res.status(400).json({ error: 'Customer name is required' });
    }
    if (!Array.isArray(b.lines) || b.lines.length === 0) {
      return res.status(400).json({ error: 'A quote needs at least one item' });
    }
    for (const [i, l] of b.lines.entries()) {
      if (!l.productName || !String(l.productName).trim()) {
        return res.status(400).json({ error: `Item ${i + 1} has no product` });
      }
      if (!Number.isFinite(Number(l.quantity)) || Number(l.quantity) < 1) {
        return res.status(400).json({ error: `Item ${i + 1}: quantity must be at least 1` });
      }
    }
    for (const [field, label] of [['shippingCost', 'Shipping cost'], ['expressFee', 'Express fee'], ['discount', 'Discount']]) {
      const v = Number(b[field] ?? 0);
      if (!Number.isFinite(v) || v < 0) return res.status(400).json({ error: `${label} must be zero or more` });
    }
    const markupPct = Number(b.markupPct ?? 30);
    if (!Number.isFinite(markupPct) || markupPct < 0) {
      return res.status(400).json({ error: 'Markup must be zero or more' });
    }

    const existing = b.id ? db.prepare('SELECT * FROM quotes WHERE id = ?').get(b.id) as any : null;
    if (b.id && !existing) return res.status(404).json({ error: 'Quote not found' });
    if (existing?.xero_invoice_id) {
      return res.status(409).json({
        error: `${existing.quote_number} has already been invoiced as ${existing.xero_invoice_number}. Invoiced quotes cannot be edited.`
      });
    }

    const totals = priceFromBody(b);
    const stamp = now();
    const quoteId = b.id || uid('q');
    const quoteNumber = existing?.quote_number || nextQuoteNumber();

    db.exec('BEGIN');
    try {
      db.prepare(`
        INSERT INTO quotes (
          id, quote_number, status, contact_id, customer_name, customer_email,
          customer_reference, sales_rep, quote_date, valid_until, lead_time,
          billing_address, delivery_address, delivery_same_as_billing,
          carton_count, shipping_method, shipping_cost, express_fee, shipping_notes,
          markup_pct, vat_rate, discount, notes,
          goods_cost, total_cost, net_total, vat_total, gross_total, profit, margin_pct,
          created_at, updated_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET
          contact_id = excluded.contact_id,
          customer_name = excluded.customer_name,
          customer_email = excluded.customer_email,
          customer_reference = excluded.customer_reference,
          sales_rep = excluded.sales_rep,
          quote_date = excluded.quote_date,
          valid_until = excluded.valid_until,
          lead_time = excluded.lead_time,
          billing_address = excluded.billing_address,
          delivery_address = excluded.delivery_address,
          delivery_same_as_billing = excluded.delivery_same_as_billing,
          carton_count = excluded.carton_count,
          shipping_method = excluded.shipping_method,
          shipping_cost = excluded.shipping_cost,
          express_fee = excluded.express_fee,
          shipping_notes = excluded.shipping_notes,
          markup_pct = excluded.markup_pct,
          vat_rate = excluded.vat_rate,
          discount = excluded.discount,
          notes = excluded.notes,
          goods_cost = excluded.goods_cost,
          total_cost = excluded.total_cost,
          net_total = excluded.net_total,
          vat_total = excluded.vat_total,
          gross_total = excluded.gross_total,
          profit = excluded.profit,
          margin_pct = excluded.margin_pct,
          updated_at = excluded.updated_at
      `).run(
        quoteId, quoteNumber, existing?.status || 'draft',
        b.contactId || null, String(b.customerName).trim(), b.customerEmail || null,
        b.customerReference || null, b.salesRep || null,
        b.quoteDate || stamp.slice(0, 10), b.validUntil || null, b.leadTime || null,
        b.billingAddress || null, b.deliveryAddress || null, b.deliverySameAsBilling ? 1 : 0,
        Number(b.cartonCount) || 0, b.shippingMethod || null,
        totals.shippingCost, totals.expressFee, b.shippingNotes || null,
        totals.markupPct, totals.vatRate, totals.discount, b.notes || null,
        totals.goodsCost, totals.totalCost, totals.netTotal, totals.vatTotal,
        totals.grossTotal, totals.profit, totals.marginPct,
        existing?.created_at || stamp, stamp
      );

      // Lines are edited as a whole set; replacing them keeps costs and
      // decorations consistent with the totals just computed above
      const oldLines = db.prepare('SELECT id FROM quote_lines WHERE quote_id = ?').all(quoteId) as any[];
      const delDecs = db.prepare('DELETE FROM quote_line_decorations WHERE quote_line_id = ?');
      for (const ol of oldLines) delDecs.run(ol.id);
      db.prepare('DELETE FROM quote_lines WHERE quote_id = ?').run(quoteId);

      const insLine = db.prepare(`
        INSERT INTO quote_lines (
          id, quote_id, sort_order, product_id, product_sku, product_name, image_url,
          description, quantity, blank_cost, packaging_cost, decoration_unit_cost,
          setup_cost, min_charge, unit_cost, line_cost, min_charge_applied
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `);
      const insDec = db.prepare(`
        INSERT INTO quote_line_decorations (
          id, quote_line_id, decoration_type_id, decoration_name,
          print_area_id, print_area_name, setup_cost, unit_cost
        ) VALUES (?,?,?,?,?,?,?,?)
      `);

      b.lines.forEach((l: any, i: number) => {
        const lineId = uid('ql');
        const costed = totals.lines[i];
        const decorations = l.decorations || [];
        insLine.run(
          lineId, quoteId, i,
          l.productId || null, l.productSku || null, String(l.productName).trim(), l.imageUrl || null,
          l.description || null, costed.quantity,
          Number(l.blankCost) || 0, Number(l.packagingCost) || 0,
          decorations.reduce((s: number, d: any) => s + (Number(d.unitCost) || 0), 0),
          costed.setupCost, Number(l.minCharge) || 0,
          costed.unitCost, costed.lineCost, costed.minChargeApplied ? 1 : 0
        );
        for (const d of decorations) {
          insDec.run(
            uid('qd'), lineId,
            d.decorationTypeId || null, d.decorationName || 'Decoration',
            d.printAreaId || null, d.printAreaName || 'Print area',
            Number(d.setupCost) || 0, Number(d.unitCost) || 0
          );
        }
      });

      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }

    res.json({ success: true, id: quoteId, quoteNumber, totals, message: `${quoteNumber} saved` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** Move a quote through draft -> sent -> accepted/declined. */
quotesRouter.post('/:id/status', (req: Request, res: Response) => {
  try {
    const { status } = req.body || {};
    const allowed = ['draft', 'sent', 'accepted', 'declined', 'expired'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: `Status must be one of: ${allowed.join(', ')}` });
    }
    const q = db.prepare('SELECT * FROM quotes WHERE id = ?').get(req.params.id) as any;
    if (!q) return res.status(404).json({ error: 'Quote not found' });
    if (q.xero_invoice_id && status !== 'accepted') {
      return res.status(409).json({
        error: `${q.quote_number} has been invoiced as ${q.xero_invoice_number} and stays accepted.`
      });
    }

    const stamp = now();
    db.prepare(`
      UPDATE quotes SET status = ?, updated_at = ?,
        sent_at = CASE WHEN ? = 'sent' AND sent_at IS NULL THEN ? ELSE sent_at END,
        decided_at = CASE WHEN ? IN ('accepted','declined') THEN ? ELSE decided_at END
      WHERE id = ?
    `).run(status, stamp, status, stamp, status, stamp, req.params.id);

    res.json({ success: true, message: `${q.quote_number} marked ${status}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

quotesRouter.delete('/:id', (req: Request, res: Response) => {
  try {
    const q = db.prepare('SELECT quote_number, xero_invoice_id, xero_invoice_number FROM quotes WHERE id = ?')
      .get(req.params.id) as any;
    if (!q) return res.status(404).json({ error: 'Quote not found' });
    if (q.xero_invoice_id) {
      return res.status(409).json({
        error: `${q.quote_number} was invoiced as ${q.xero_invoice_number}, so it is kept as a record.`
      });
    }

    db.exec('BEGIN');
    try {
      const lines = db.prepare('SELECT id FROM quote_lines WHERE quote_id = ?').all(req.params.id) as any[];
      const delDecs = db.prepare('DELETE FROM quote_line_decorations WHERE quote_line_id = ?');
      for (const l of lines) delDecs.run(l.id);
      db.prepare('DELETE FROM quote_lines WHERE quote_id = ?').run(req.params.id);
      db.prepare('DELETE FROM quotes WHERE id = ?').run(req.params.id);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    res.json({ success: true, message: `${q.quote_number} deleted` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});


/* ------------------------------------------------------- quote -> invoice */

/** Everything both the preview and the push need, or the reason it cannot run. */
function prepareInvoice(quoteId: string) {
  const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(quoteId) as any;
  if (!quote) return { error: 'Quote not found', status: 404 };

  if (quote.xero_invoice_id) {
    return {
      error: `${quote.quote_number} is already invoiced as ${quote.xero_invoice_number}.`,
      status: 409
    };
  }
  if (quote.status !== 'accepted') {
    return {
      error: `${quote.quote_number} is ${quote.status}. Only an accepted quote can be invoiced.`,
      status: 409
    };
  }
  if (!quote.contact_id) {
    return {
      error: `${quote.quote_number} has no Xero customer attached. Edit it and pick one.`,
      status: 400
    };
  }
  const contact = db.prepare('SELECT * FROM xero_contacts WHERE contact_id = ?').get(quote.contact_id) as any;
  if (!contact) {
    return { error: 'That customer is no longer in Xero. Re-sync customers and try again.', status: 400 };
  }

  const quoteLines = db.prepare(
    'SELECT * FROM quote_lines WHERE quote_id = ? ORDER BY sort_order'
  ).all(quoteId) as any[];
  if (quoteLines.length === 0) return { error: 'That quote has no items.', status: 400 };

  const settings = db.prepare('SELECT * FROM invoice_settings WHERE id = ?').get('primary') as any;
  const accountCode = settings?.default_account_code;
  if (!accountCode) {
    return { error: 'No revenue account code is set. Set one in Xero invoice settings first.', status: 400 };
  }

  const taxType = taxTypeForRate(quote.vat_rate, settings?.default_tax_type);
  if (!taxType) {
    return {
      error: `No Xero tax rate matches ${quote.vat_rate}% VAT on income. Re-sync Xero reference data.`,
      status: 400
    };
  }

  const conversion = buildInvoiceLines(quote, quoteLines);
  return { quote, contact, quoteLines, settings, accountCode, taxType, conversion };
}

/** Show the operator exactly what will be sent, before anything is created. */
quotesRouter.get('/:id/invoice-preview', (req: Request, res: Response) => {
  try {
    const prep = prepareInvoice(req.params.id);
    if ('error' in prep) return res.status(prep.status!).json({ error: prep.error });

    const { quote, contact, conversion, accountCode, taxType, settings } = prep as any;
    const vatTotal = Math.round(conversion.netTotal * (quote.vat_rate / 100) * 100) / 100;

    res.json({
      quoteNumber: quote.quote_number,
      customerName: contact.name,
      accountCode,
      taxType,
      vatRate: quote.vat_rate,
      dueDays: settings?.default_due_days ?? 30,
      lines: conversion.lines.map((l: any) => ({
        description: l.description,
        quantity: l.quantity,
        unitAmount: l.unitAmount,
        lineAmount: l.lineAmount,
        nonStock: l.nonStock
      })),
      netTotal: conversion.netTotal,
      vatTotal,
      grossTotal: Math.round((conversion.netTotal + vatTotal) * 100) / 100,
      quoteNetTotal: conversion.quoteNetTotal,
      quoteGrossTotal: quote.gross_total,
      roundingAdjustment: conversion.roundingAdjustment
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Create the invoice in Xero and record it against the quote.
 *
 * The quote is only marked invoiced after Xero returns an InvoiceID, so a
 * failure here leaves it invoiceable again rather than stranded.
 */
quotesRouter.post('/:id/invoice', async (req: Request, res: Response) => {
  try {
    const auth = await getValidAccessToken();
    if (!auth) return res.status(401).json({ error: 'Xero not connected. Connect your Xero account first.' });

    const { status = 'DRAFT', deductStock = false } = req.body || {};
    if (!['DRAFT', 'AUTHORISED'].includes(status)) {
      return res.status(400).json({ error: 'status must be DRAFT or AUTHORISED' });
    }

    const prep = prepareInvoice(req.params.id);
    if ('error' in prep) return res.status(prep.status!).json({ error: prep.error });
    const { quote, contact, quoteLines, settings, accountCode, taxType, conversion } = prep as any;

    const issueDate = new Date().toISOString().slice(0, 10);
    const dueDate = new Date(Date.now() + (settings?.default_due_days ?? 30) * 86400000)
      .toISOString().slice(0, 10);

    const payload = {
      Invoices: [{
        Type: 'ACCREC',
        Contact: { ContactID: quote.contact_id },
        Date: issueDate,
        DueDate: dueDate,
        // Quote figures are all net, so VAT is added on top, never extracted
        LineAmountTypes: 'Exclusive',
        Status: status,
        Reference: [quote.quote_number, quote.customer_reference].filter(Boolean).join(' / ').slice(0, 255),
        LineItems: conversion.lines.map((l: any) => ({
          Description: l.description,
          Quantity: l.quantity,
          UnitAmount: l.unitAmount,
          AccountCode: String(accountCode),
          TaxType: taxType
        }))
      }]
    };

    const pushRes = await xeroFetch(auth, '/Invoices', { method: 'POST', body: JSON.stringify(payload) });
    const bodyText = await pushRes.text();
    if (!pushRes.ok) {
      console.error('[Quote Invoice Push Failed]', bodyText);
      return res.status(pushRes.status).json({
        error: `Xero rejected the invoice: ${describeXeroError(bodyText)}`
      });
    }

    const created = (JSON.parse(bodyText).Invoices || [])[0];
    if (!created?.InvoiceID) {
      return res.status(502).json({ error: 'Xero accepted the request but returned no invoice' });
    }

    const drafts = resolveStockForLines(quoteLines, conversion.lines);
    const stored = mirrorInvoiceLocally({
      created,
      fallbackCustomerName: contact.name,
      fallbackDate: issueDate,
      fallbackDueDate: dueDate,
      fallbackStatus: status,
      localLines: drafts.map((l: any) => ({
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitAmount,
        matchedBlankId: l.blankItemId,
        matchedBoxId: l.packagingItemId,
        nonStock: l.nonStock,
        manualMatch: true,
        matchConfidence: 'manual' as const,
        deducted: false
      }))
    });

    // Stamped now, so the quote can never be invoiced a second time
    db.prepare(
      'UPDATE quotes SET xero_invoice_id = ?, xero_invoice_number = ?, updated_at = ? WHERE id = ?'
    ).run(created.InvoiceID, stored.invoiceNumber, now(), quote.id);

    let deducted = 0;
    let deductError: string | null = null;
    if (deductStock) {
      const result = deductForInvoice(
        drafts.filter((l: any) => !l.nonStock),
        stored.invoiceNumber,
        stored.id,
        `Deducted when quote ${quote.quote_number} was invoiced as ${stored.invoiceNumber}`
      );
      deducted = result.deducted;
      deductError = result.error;
    }

    res.status(201).json({
      success: true,
      quoteNumber: quote.quote_number,
      invoiceId: stored.id,
      xeroInvoiceId: created.InvoiceID,
      invoiceNumber: stored.invoiceNumber,
      status: created.Status || status,
      subTotal: Number(created.SubTotal ?? 0),
      totalTax: Number(created.TotalTax ?? 0),
      total: Number(created.Total ?? 0),
      onlineInvoiceUrl: created.OnlineInvoiceUrl || null,
      stockDeducted: deductStock && !deductError,
      stockMovements: deducted,
      deductError,
      message:
        `${quote.quote_number} invoiced as ${stored.invoiceNumber} (${created.Status || status}).` +
        (deductStock
          ? deductError
            ? ` The invoice was created, but the stock deduction failed: ${deductError}`
            : ` ${deducted} stock movement${deducted === 1 ? '' : 's'} written.`
          : '')
    });
  } catch (err: any) {
    console.error('[Quote Invoice Error]', err);
    res.status(500).json({ error: err.message });
  }
});


/* ------------------------------------------------------------- documents */

function getCompany(): CompanyDetails {
  const row = db.prepare('SELECT * FROM company_details WHERE id = ?').get('primary') as any;
  return {
    name: row?.name || 'PrintBerry Ltd',
    addressLines: row?.address_lines ? String(row.address_lines).split('\n').filter(Boolean) : [],
    email: row?.email || '',
    phone: row?.phone || '',
    website: row?.website || '',
    vatNumber: row?.vat_number || '',
    quoteTerms: row?.quote_terms || ''
  };
}

/**
 * The quote as a PDF. `?disposition=inline` renders it in the browser for
 * the preview; the default prompts a download.
 */
quotesRouter.get('/:id/pdf', (req: Request, res: Response) => {
  try {
    const quote = db.prepare('SELECT quote_number FROM quotes WHERE id = ?').get(req.params.id) as any;
    if (!quote) return res.status(404).json({ error: 'Quote not found' });

    const inline = req.query.disposition === 'inline';
    const filename = `Quote-${quote.quote_number}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `${inline ? 'inline' : 'attachment'}; filename="${filename}"`
    );

    const doc = buildQuotePdf(req.params.id, getCompany());
    doc.pipe(res);
    doc.end();
  } catch (err: any) {
    // Headers may already be out by the time a render fails
    if (res.headersSent) res.end();
    else res.status(500).json({ error: err.message });
  }
});


/**
 * Release a quote from an invoice that no longer exists in Xero.
 *
 * Invoicing stamps a quote so it can never be billed twice, but a test
 * invoice that gets deleted in Xero would otherwise leave the quote
 * permanently stuck: not editable, not deletable, pointing at nothing.
 *
 * Xero is asked first. A live invoice is never detached silently -- only
 * one Xero reports as DELETED or VOIDED, or has stopped existing.
 */
quotesRouter.post('/:id/unlink-invoice', async (req: Request, res: Response) => {
  try {
    const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(req.params.id) as any;
    if (!quote) return res.status(404).json({ error: 'Quote not found' });
    if (!quote.xero_invoice_id) {
      return res.status(400).json({ error: `${quote.quote_number} is not linked to an invoice.` });
    }

    const auth = await getValidAccessToken();
    if (!auth) {
      return res.status(401).json({
        error: 'Xero is not connected, so the invoice cannot be checked. Connect Xero and try again.'
      });
    }

    let liveStatus: string;
    const check = await xeroFetch(auth, `/Invoices/${quote.xero_invoice_id}`);
    if (check.status === 404) {
      liveStatus = 'GONE';
    } else if (check.ok) {
      const found = (JSON.parse(await check.text()).Invoices || [])[0];
      liveStatus = String(found?.Status || 'UNKNOWN');
    } else {
      const body = await check.text();
      return res.status(502).json({
        error: `Could not check that invoice with Xero: ${describeXeroError(body)}`
      });
    }

    const releasable = ['DELETED', 'VOIDED', 'GONE'];
    if (!releasable.includes(liveStatus)) {
      return res.status(409).json({
        error:
          `${quote.xero_invoice_number} still exists in Xero as ${liveStatus}. ` +
          'Delete or void it there first, then unlink.',
        liveStatus
      });
    }

    db.prepare(`
      UPDATE quotes SET xero_invoice_id = NULL, xero_invoice_number = NULL, updated_at = ?
      WHERE id = ?
    `).run(now(), quote.id);

    // The local mirror is only ours to clear; Xero has already lost it
    db.prepare('DELETE FROM xero_invoices WHERE invoice_number = ?').run(quote.xero_invoice_number);

    res.json({
      success: true,
      liveStatus,
      message:
        `${quote.quote_number} released from ${quote.xero_invoice_number} ` +
        `(${liveStatus === 'GONE' ? 'no longer in Xero' : `${liveStatus} in Xero`}). ` +
        'It can be edited, deleted or invoiced again.'
    });
  } catch (err: any) {
    console.error('[Quote Unlink Error]', err);
    res.status(500).json({ error: err.message });
  }
});

  return quotesRouter;
}
