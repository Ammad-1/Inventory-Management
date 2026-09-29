import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import { db } from '../db';
import { calculateQuote, markupToMargin, marginToMarkup } from '../../shared/quotePricing';

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
export const quotesRouter = Router();

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
