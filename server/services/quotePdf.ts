import PDFDocument from 'pdfkit';
import { db } from '../db';
import { calculateQuote } from '../../shared/quotePricing';

/**
 * The customer-facing quote document.
 *
 * It shows what the customer pays and nothing about what the job costs
 * us: no landed cost, no markup, no margin. Those belong on the internal
 * screen. The totals show net, VAT and gross separately, because a
 * business customer reclaims the VAT and needs both figures.
 */

const A4 = { width: 595.28, height: 841.89 };
const M = 48;                       // page margin
const RIGHT = A4.width - M;
const CONTENT = RIGHT - M;

const INK = '#0f172a';
const MUTED = '#64748b';
const LINE = '#e2e8f0';
const ACCENT = '#4f46e5';

const money = (n: number) =>
  '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const prettyDate = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? String(iso)
    : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

export interface CompanyDetails {
  name: string;
  addressLines: string[];
  email?: string;
  phone?: string;
  vatNumber?: string;
  website?: string;
}

const DEFAULT_COMPANY: CompanyDetails = {
  name: 'PrintBerry Ltd',
  addressLines: [],
  email: '',
  phone: '',
  vatNumber: '',
  website: ''
};

export function buildQuotePdf(quoteId: string, company: CompanyDetails = DEFAULT_COMPANY): PDFKit.PDFDocument {
  const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(quoteId) as any;
  if (!quote) throw new Error('Quote not found');

  const lines = db.prepare(
    'SELECT * FROM quote_lines WHERE quote_id = ? ORDER BY sort_order'
  ).all(quoteId) as any[];

  const totals = calculateQuote({
    lines: lines.map(l => ({
      quantity: l.quantity,
      blankCost: l.blank_cost,
      packagingCost: l.packaging_cost,
      decorationUnitCost: l.decoration_unit_cost,
      setupCost: l.setup_cost,
      minCharge: l.min_charge
    })),
    shippingCost: quote.shipping_cost,
    expressFee: quote.express_fee,
    markupPct: quote.markup_pct,
    vatRate: quote.vat_rate,
    discount: quote.discount
  });

  const markupFactor = 1 + totals.markupPct / 100;

  const doc = new PDFDocument({
    size: 'A4',
    margin: M,
    info: {
      Title: `Quote ${quote.quote_number}`,
      Author: company.name,
      Subject: `Quotation for ${quote.customer_name}`
    }
  });

  let y = M;

  /* ------------------------------------------------------------- header */
  doc.font('Helvetica-Bold').fontSize(20).fillColor(INK)
    .text(company.name, M, y);

  doc.font('Helvetica-Bold').fontSize(24).fillColor(ACCENT)
    .text('QUOTATION', M, y, { width: CONTENT, align: 'right' });

  y += 28;

  const companyMeta = [
    ...company.addressLines,
    company.phone, company.email, company.website,
    company.vatNumber ? `VAT ${company.vatNumber}` : ''
  ].filter(Boolean) as string[];

  doc.font('Helvetica').fontSize(8.5).fillColor(MUTED);
  for (const l of companyMeta) {
    doc.text(l, M, y, { width: CONTENT * 0.5 });
    y += 11;
  }

  // The quote's own identifiers sit opposite the company block
  let metaY = M + 30;
  const metaRow = (label: string, value: string) => {
    doc.font('Helvetica').fontSize(8.5).fillColor(MUTED)
      .text(label, RIGHT - 210, metaY, { width: 100, align: 'right' });
    doc.font('Helvetica-Bold').fontSize(9).fillColor(INK)
      .text(value, RIGHT - 105, metaY, { width: 105, align: 'right' });
    metaY += 14;
  };
  metaRow('Quote number', quote.quote_number);
  metaRow('Date', prettyDate(quote.quote_date));
  if (quote.valid_until) metaRow('Valid until', prettyDate(quote.valid_until));
  if (quote.customer_reference) metaRow('Your reference', String(quote.customer_reference));

  y = Math.max(y, metaY) + 12;

  doc.moveTo(M, y).lineTo(RIGHT, y).strokeColor(LINE).lineWidth(1).stroke();
  y += 18;

  /* ---------------------------------------------------------- addresses */
  const colW = (CONTENT - 24) / 2;
  const addrTop = y;

  const addressBlock = (title: string, name: string, body: string | null, x: number) => {
    let ay = addrTop;
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(MUTED)
      .text(title.toUpperCase(), x, ay, { width: colW, characterSpacing: 0.6 });
    ay += 13;
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(INK).text(name, x, ay, { width: colW });
    ay += doc.heightOfString(name, { width: colW }) + 2;
    if (body) {
      doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(body, x, ay, { width: colW });
      ay += doc.heightOfString(body, { width: colW });
    }
    return ay;
  };

  const leftEnd = addressBlock('Quotation for', quote.customer_name, quote.billing_address, M);
  const deliveryText = quote.delivery_same_as_billing ? quote.billing_address : quote.delivery_address;
  const rightEnd = deliveryText
    ? addressBlock('Deliver to', quote.customer_name, deliveryText, M + colW + 24)
    : addrTop;

  y = Math.max(leftEnd, rightEnd) + 18;

  /* ------------------------------------------------------- job details */
  const details: [string, string][] = [];
  if (quote.sales_rep) details.push(['Your contact', quote.sales_rep]);
  if (quote.lead_time) details.push(['Lead time', quote.lead_time]);
  if (quote.shipping_method) details.push(['Delivery', quote.shipping_method]);
  if (quote.carton_count) details.push(['Cartons', String(quote.carton_count)]);

  if (details.length) {
    const boxH = 30;
    doc.roundedRect(M, y, CONTENT, boxH, 4).fillColor('#f8fafc').fill();
    const cellW = CONTENT / details.length;
    details.forEach(([label, value], i) => {
      const x = M + i * cellW + 12;
      doc.font('Helvetica').fontSize(7.5).fillColor(MUTED).text(label.toUpperCase(), x, y + 7, { width: cellW - 16 });
      doc.font('Helvetica-Bold').fontSize(9).fillColor(INK).text(value, x, y + 17, { width: cellW - 16 });
    });
    y += boxH + 18;
  }

  /* ------------------------------------------------------------- items */
  const COL = {
    desc: M,
    qty: M + CONTENT - 210,
    unit: M + CONTENT - 140,
    total: M + CONTENT - 70
  };
  const W = { desc: CONTENT - 220, qty: 60, unit: 60, total: 70 };

  const drawTableHead = () => {
    doc.rect(M, y, CONTENT, 22).fillColor('#f1f5f9').fill();
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(MUTED);
    doc.text('DESCRIPTION', COL.desc + 10, y + 7, { width: W.desc });
    doc.text('QTY', COL.qty, y + 7, { width: W.qty, align: 'right' });
    doc.text('UNIT', COL.unit, y + 7, { width: W.unit, align: 'right' });
    doc.text('AMOUNT', COL.total - 10, y + 7, { width: W.total, align: 'right' });
    y += 22;
  };

  drawTableHead();

  lines.forEach((l, i) => {
    const costed = totals.lines[i];
    const sellTotal = Math.round(costed.lineCost * markupFactor * 100) / 100;
    const unitPrice = costed.quantity ? sellTotal / costed.quantity : sellTotal;

    const decorations = db.prepare(
      'SELECT decoration_name, print_area_name FROM quote_line_decorations WHERE quote_line_id = ?'
    ).all(l.id) as any[];

    const subtitleParts: string[] = [];
    if (l.product_sku) subtitleParts.push(l.product_sku);
    if (decorations.length) {
      subtitleParts.push(decorations.map(d => `${d.decoration_name} — ${d.print_area_name}`).join(', '));
    }
    if (l.description) subtitleParts.push(l.description);
    const subtitle = subtitleParts.join('  ·  ');

    const titleH = doc.font('Helvetica-Bold').fontSize(9.5).heightOfString(l.product_name, { width: W.desc });
    const subH = subtitle
      ? doc.font('Helvetica').fontSize(8).heightOfString(subtitle, { width: W.desc })
      : 0;
    const rowH = Math.max(28, titleH + subH + 14);

    // Start a new page before a row would run off this one
    if (y + rowH > A4.height - M - 150) {
      doc.addPage();
      y = M;
      drawTableHead();
    }

    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(INK)
      .text(l.product_name, COL.desc + 10, y + 7, { width: W.desc });
    if (subtitle) {
      doc.font('Helvetica').fontSize(8).fillColor(MUTED)
        .text(subtitle, COL.desc + 10, y + 7 + titleH + 1, { width: W.desc });
    }

    doc.font('Helvetica').fontSize(9.5).fillColor(INK);
    doc.text(String(costed.quantity), COL.qty, y + 7, { width: W.qty, align: 'right' });
    doc.text(money(unitPrice), COL.unit, y + 7, { width: W.unit, align: 'right' });
    doc.font('Helvetica-Bold')
      .text(money(sellTotal), COL.total - 10, y + 7, { width: W.total, align: 'right' });

    y += rowH;
    doc.moveTo(M, y).lineTo(RIGHT, y).strokeColor(LINE).lineWidth(0.5).stroke();
  });

  // Delivery and any discount read as their own lines, as on the invoice
  const extraRow = (label: string, amount: number) => {
    if (y + 24 > A4.height - M - 130) { doc.addPage(); y = M; }
    doc.font('Helvetica').fontSize(9.5).fillColor(INK)
      .text(label, COL.desc + 10, y + 7, { width: W.desc });
    doc.font('Helvetica-Bold').fontSize(9.5)
      .text(money(amount), COL.total - 10, y + 7, { width: W.total, align: 'right' });
    y += 24;
    doc.moveTo(M, y).lineTo(RIGHT, y).strokeColor(LINE).lineWidth(0.5).stroke();
  };

  if (totals.shippingCost > 0) {
    extraRow(quote.shipping_method || 'Delivery', Math.round(totals.shippingCost * markupFactor * 100) / 100);
  }
  if (totals.expressFee > 0) {
    extraRow('Express handling', Math.round(totals.expressFee * markupFactor * 100) / 100);
  }
  if (totals.discount > 0) extraRow('Discount', -totals.discount);

  /* ------------------------------------------------------------ totals */
  y += 14;
  if (y + 110 > A4.height - M) { doc.addPage(); y = M; }

  const totalsX = RIGHT - 230;
  const totalRow = (label: string, value: string, bold = false) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 10 : 9.5)
      .fillColor(bold ? INK : MUTED)
      .text(label, totalsX, y, { width: 130 });
    doc.font('Helvetica-Bold').fontSize(bold ? 10 : 9.5).fillColor(INK)
      .text(value, totalsX + 130, y, { width: 100, align: 'right' });
    y += bold ? 17 : 15;
  };

  totalRow('Subtotal (excl. VAT)', money(totals.netTotal));
  totalRow(`VAT at ${totals.vatRate}%`, money(totals.vatTotal));

  y += 4;
  doc.moveTo(totalsX, y).lineTo(RIGHT, y).strokeColor(LINE).lineWidth(1).stroke();
  y += 8;

  doc.roundedRect(totalsX - 10, y - 4, 250, 28, 4).fillColor('#eef2ff').fill();
  doc.font('Helvetica-Bold').fontSize(11).fillColor(ACCENT)
    .text('Total to pay', totalsX, y + 4, { width: 130 });
  doc.font('Helvetica-Bold').fontSize(13).fillColor(ACCENT)
    .text(money(totals.grossTotal), totalsX + 120, y + 2, { width: 110, align: 'right' });
  y += 38;

  /* ------------------------------------------------------------- notes */
  if (quote.notes) {
    if (y + 60 > A4.height - M) { doc.addPage(); y = M; }
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(MUTED)
      .text('NOTES', M, y, { characterSpacing: 0.6 });
    y += 12;
    doc.font('Helvetica').fontSize(9).fillColor(INK)
      .text(String(quote.notes), M, y, { width: CONTENT });
    y += doc.heightOfString(String(quote.notes), { width: CONTENT }) + 14;
  }

  /* ------------------------------------------------------------ footer */
  const footerY = A4.height - M - 28;
  doc.moveTo(M, footerY).lineTo(RIGHT, footerY).strokeColor(LINE).lineWidth(0.5).stroke();

  const validity = quote.valid_until
    ? `This quotation is valid until ${prettyDate(quote.valid_until)}.`
    : 'This quotation is valid for 14 days from the date above.';
  doc.font('Helvetica').fontSize(7.5).fillColor(MUTED)
    .text(`${validity} All prices are in GBP and exclude VAT unless stated.`,
      M, footerY + 8, { width: CONTENT * 0.75 });
  doc.text(quote.quote_number, RIGHT - 120, footerY + 8, { width: 120, align: 'right' });

  return doc;
}
