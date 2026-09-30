import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../db';
import { calculateQuote } from '../../shared/quotePricing';
import { getProductImage, getPrintAreaImage } from './imageCache';

/**
 * The customer-facing quote, laid out to the owner's design: PrintBerry
 * letterhead, the selected product panel, a purple items table, notes
 * beside the totals, the four detail boxes and the terms.
 *
 * It shows what the customer pays and nothing about what the job costs
 * us. No landed cost, no markup, no margin -- those belong on the
 * internal screen.
 *
 * One deliberate departure from the design: its totals block read
 * "Subtotal (Cost) / VAT / Shipping / TOTAL", which added VAT to our own
 * costs and never charged the customer any. The figures here are the
 * corrected ones -- goods and delivery at the selling price, then VAT on
 * that -- with the labels saying plainly which is which.
 */

const A4 = { width: 595.28, height: 841.89 };
const M = 40;
const RIGHT = A4.width - M;
const CONTENT = RIGHT - M;

// Sampled from the owner's artwork
const PURPLE = '#943F94';
const INK = '#2b2b2b';
const MUTED = '#6b6b6b';
const RULE = '#d8d8d8';

const money = (n: number) =>
  '£' + n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const prettyDate = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? String(iso)
    : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

export interface CompanyDetails {
  name: string;
  addressLines: string[];
  email?: string;
  phone?: string;
  vatNumber?: string;
  website?: string;
  quoteTerms?: string;
  /** Print each item's product link. Off unless the owner turns it on. */
  showProductLinks?: boolean;
}

const DEFAULT_TERMS = [
  'Prices are based on the quantities and specifications provided.',
  'Lead times will be confirmed upon order confirmation.',
  'This quote is valid until the date specified above.'
];

const LOGO = path.resolve(process.cwd(), 'public', 'brand', 'printberry-logo.png');

export async function buildQuotePdf(
  quoteId: string,
  company: CompanyDetails
): Promise<PDFKit.PDFDocument> {
  const quote = db.prepare('SELECT * FROM quotes WHERE id = ?').get(quoteId) as any;
  if (!quote) throw new Error('Quote not found');

  const lines = db.prepare(
    'SELECT * FROM quote_lines WHERE quote_id = ? ORDER BY sort_order'
  ).all(quoteId) as any[];

  const charges = db.prepare(
    'SELECT description, amount, cost FROM quote_charges WHERE quote_id = ? ORDER BY sort_order'
  ).all(quote.id) as any[];

  const totals = calculateQuote({
    lines: lines.map(l => ({
      quantity: l.quantity,
      blankCost: l.blank_cost,
      packagingCost: l.packaging_cost,
      decorationUnitCost: l.decoration_unit_cost,
      setupCost: l.setup_cost,
      minCharge: l.min_charge,
      unitPrice: l.unit_price,
      setupPrice: l.setup_price
    })),
    shippingCost: quote.shipping_cost,
    expressFee: quote.express_fee,
    shippingPrice: quote.shipping_price,
    expressPrice: quote.express_price,
    charges: charges.map(c => ({ description: c.description, amount: c.amount, cost: c.cost })),
    markupPct: quote.markup_pct,
    vatRate: quote.vat_rate,
    discount: quote.discount
  });

  const doc = new PDFDocument({
    size: 'A4',
    margin: M,
    info: {
      Title: `Quote ${quote.quote_number}`,
      Author: company.name,
      Subject: `Quotation for ${quote.customer_name}`
    }
  });

  /* ----------------------------------------------------- small helpers */
  const label = (text: string, x: number, y: number, w: number, color = PURPLE, size = 8) =>
    doc.font('Helvetica-Bold').fontSize(size).fillColor(color)
      .text(text.toUpperCase(), x, y, { width: w, characterSpacing: 0.5 });

  const box = (x: number, y: number, w: number, h: number, fill?: string) => {
    doc.roundedRect(x, y, w, h, 3);
    if (fill) doc.fillColor(fill).fill();
    else doc.strokeColor(RULE).lineWidth(0.8).stroke();
  };

  /* ------------------------------------------------------------ header */
  let y = M;
  const headTop = y;

  if (fs.existsSync(LOGO)) {
    doc.image(LOGO, M, y - 4, { fit: [150, 48] });
    y += 50;
  } else {
    doc.font('Helvetica-Bold').fontSize(19).fillColor(PURPLE).text(company.name, M, y);
    y += 26;
  }

  doc.font('Helvetica-Bold').fontSize(26).fillColor(PURPLE)
    .text('QUOTE', RIGHT - 200, headTop, { width: 200, align: 'right' });

  // Company contact block, under the logo
  const contact = [
    company.addressLines.join(', '),
    company.phone, company.email, company.website
  ].filter(Boolean) as string[];
  doc.font('Helvetica').fontSize(9).fillColor(INK);
  for (const c of contact) {
    doc.text(c, M, y, { width: CONTENT * 0.5 });
    y += 13;
  }
  if (company.vatNumber) {
    doc.fillColor(MUTED).fontSize(8).text(`VAT ${company.vatNumber}`, M, y, { width: CONTENT * 0.5 });
    y += 12;
  }

  // Quote identifiers, opposite
  let my = headTop + 34;
  const metaRow = (k: string, v: string) => {
    doc.font('Helvetica').fontSize(9).fillColor(INK)
      .text(k, RIGHT - 250, my, { width: 150, align: 'right' });
    doc.font('Helvetica-Bold').fontSize(9).fillColor(INK)
      .text(v, RIGHT - 95, my, { width: 95, align: 'right' });
    my += 15;
  };
  metaRow('Quote Date:', prettyDate(quote.quote_date));
  metaRow('Quote Reference:', quote.quote_number);
  if (quote.valid_until) metaRow('Valid Until:', prettyDate(quote.valid_until));
  if (quote.lead_time) metaRow('Lead Time:', String(quote.lead_time));

  y = Math.max(y, my) + 8;
  doc.moveTo(M, y).lineTo(RIGHT, y).strokeColor(RULE).lineWidth(1).stroke();
  y += 14;

  /* ------------------------------------ prepared for / delivery to */
  /*
   * No "selected product" panel. It could only ever show the first line,
   * so a quote for three products announced one of them with "+2 more
   * items" beneath — and every line already carries its own photograph,
   * colour, size, type and SKU. The addresses take the width instead.
   */
  const blockTop = y;
  const colA = M;
  const colB = M + CONTENT * 0.5;
  const colW = CONTENT * 0.46;

  label('Prepared for', colA, blockTop, colW);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(INK)
    .text(quote.customer_name, colA, blockTop + 13, { width: colW });
  let aY = blockTop + 13 + doc.heightOfString(quote.customer_name, { width: colW }) + 2;
  if (quote.billing_address) {
    doc.font('Helvetica').fontSize(9).fillColor(INK)
      .text(String(quote.billing_address), colA, aY, { width: colW });
    aY += doc.heightOfString(String(quote.billing_address), { width: colW });
  }
  if (quote.customer_email) {
    doc.font('Helvetica').fontSize(9).fillColor(INK)
      .text(String(quote.customer_email), colA, aY, { width: colW });
    aY += 12;
  }

  label('Delivery address', colB, blockTop, colW);
  const deliveryText = quote.delivery_same_as_billing ? quote.billing_address : quote.delivery_address;
  let bY = blockTop + 13;
  if (deliveryText) {
    doc.font('Helvetica').fontSize(9).fillColor(INK)
      .text(String(deliveryText), colB, bY, { width: colW });
    bY += doc.heightOfString(String(deliveryText), { width: colW }) + 4;
  }
  if (quote.delivery_same_as_billing) {
    doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(MUTED)
      .text('Same as billing address', colB, bY, { width: colW });
    bY += 12;
  }

  /*
   * Photographs are fetched up front rather than mid-draw, because pdfkit
   * lays out synchronously and awaiting inside the drawing would put the
   * cursor somewhere unpredictable by the time the bytes arrived.
   */
  const lineImages = new Map<string, Buffer>();
  for (const l of lines) {
    const url = l.image_url || (l.product_id
      ? (db.prepare('SELECT image_url FROM products WHERE id = ?').get(l.product_id) as any)?.image_url
      : null);
    const buf = await getProductImage(url);
    if (buf) lineImages.set(l.id, buf);
  }

  /** Print-area diagrams, so the customer sees where the print goes. */
  const areaImages = new Map<string, Buffer>();
  for (const l of lines) {
    const areas = db.prepare(`
      SELECT DISTINCT a.name, a.image_path
      FROM quote_line_decorations d
      LEFT JOIN print_areas a ON a.id = d.print_area_id
      WHERE d.quote_line_id = ? AND a.image_path IS NOT NULL
    `).all(l.id) as any[];
    for (const a of areas) {
      if (areaImages.has(a.name)) continue;
      const buf = getPrintAreaImage(a.image_path);
      if (buf) areaImages.set(a.name, buf);
    }
  }

  y = Math.max(aY, bY) + 16;

  /* ------------------------------------------------------ items table */
  const COLS = [
    { key: 'item', label: 'Item', w: CONTENT * 0.30, align: 'left' as const },
    { key: 'areas', label: 'Print Areas', w: CONTENT * 0.17, align: 'left' as const },
    { key: 'deco', label: 'Decoration Type', w: CONTENT * 0.18, align: 'left' as const },
    { key: 'qty', label: 'Qty', w: CONTENT * 0.09, align: 'center' as const },
    { key: 'unit', label: 'Unit Price', w: CONTENT * 0.13, align: 'right' as const },
    { key: 'total', label: 'Total', w: CONTENT * 0.13, align: 'right' as const }
  ];
  const colX = (i: number) => M + COLS.slice(0, i).reduce((s, c) => s + c.w, 0);

  const tableHead = () => {
    doc.rect(M, y, CONTENT, 20).fillColor(PURPLE).fill();
    COLS.forEach((c, i) => {
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#ffffff')
        .text(c.label.toUpperCase(), colX(i) + 6, y + 6.5, { width: c.w - 12, align: c.align, characterSpacing: 0.4 });
    });
    y += 20;
  };
  tableHead();

  lines.forEach((l, i) => {
    const costed = totals.lines[i];
    const sellTotal = costed.lineprice;
    const unitPrice = costed.effectiveUnitPrice;

    const decs = db.prepare(
      'SELECT decoration_name, print_area_name, colours FROM quote_line_decorations WHERE quote_line_id = ?'
    ).all(l.id) as any[];

    const areas = [...new Set(decs.map(d => d.print_area_name))];
    // A two-colour print costs more than a one-colour one, so say so
    const types = [...new Set(decs.map(d =>
      (d.colours || 1) > 1 ? `${d.decoration_name} (${d.colours} colour)` : d.decoration_name
    ))];

    const bulletText = (items: string[]) =>
      items.length ? items.map(t => `•  ${t}`).join('\n') : '—';

    const photo = lineImages.get(l.id);
    const THUMB = photo ? 40 : 0;

    /* What the customer wants to know about the item itself. */
    const prod = l.product_id
      ? db.prepare('SELECT colour, size, type FROM products WHERE id = ?').get(l.product_id) as any
      : null;
    const spec = [prod?.colour, prod?.size, prod?.type].filter(Boolean).join(' · ');

    const productLink = company.showProductLinks && l.product_id
      ? (db.prepare('SELECT supplier_product_link FROM products WHERE id = ?')
          .get(l.product_id) as any)?.supplier_product_link
      : null;

    const iw = COLS[0].w - 12 - (THUMB ? THUMB + 8 : 0);
    const nameH = doc.font('Helvetica-Bold').fontSize(9).heightOfString(l.product_name, { width: iw });
    const specH = spec ? doc.font('Helvetica').fontSize(7.5).heightOfString(spec, { width: iw }) : 0;
    const skuH = l.product_sku
      ? doc.font('Helvetica').fontSize(7.5).heightOfString(`SKU: ${l.product_sku}`, { width: iw }) + 1
      : 0;
    const descH = l.description
      ? doc.font('Helvetica-Oblique').fontSize(7.5).heightOfString(String(l.description), { width: iw }) + 1
      : 0;

    // A print area with a diagram gets one, which is why the row grows
    const areaDiagrams = areas.map(a => areaImages.get(a)).filter(Boolean) as Buffer[];
    const diagramH = areaDiagrams.length ? 42 : 0;

    const listH = Math.max(
      doc.font('Helvetica').fontSize(8.5).heightOfString(bulletText(areas), { width: COLS[1].w - 12 }) + diagramH,
      doc.font('Helvetica').fontSize(8.5).heightOfString(bulletText(types), { width: COLS[2].w - 12 })
    );
    const linkH = productLink ? 18 : 0;
    const rowH = Math.max(48, nameH + specH + skuH + descH + linkH + 14, listH + 14, THUMB + 14);

    if (y + rowH > A4.height - M - 250) {
      doc.addPage();
      y = M;
      tableHead();
    }

    const top = y;
    doc.rect(M, top, CONTENT, rowH).strokeColor(RULE).lineWidth(0.6).stroke();

    // item: the photograph, then the name, spec and SKU beside it
    if (photo) {
      try {
        doc.image(photo, colX(0) + 6, top + 6, {
          fit: [THUMB, rowH - 12], align: 'center', valign: 'center'
        });
      } catch {
        /* undecodable photograph: the text still carries the item */
      }
    }
    const textX = colX(0) + 8 + (THUMB ? THUMB + 8 : 0);

    doc.font('Helvetica-Bold').fontSize(9).fillColor(INK)
      .text(l.product_name, textX, top + 7, { width: iw });
    let ty = top + 7 + nameH;
    if (spec) {
      doc.font('Helvetica').fontSize(7.5).fillColor(INK).text(spec, textX, ty, { width: iw });
      ty += specH;
    }
    if (l.product_sku) {
      const skuText = `SKU: ${l.product_sku}`;
      doc.font('Helvetica').fontSize(7.5).fillColor(MUTED)
        .text(skuText, textX, ty + 1, { width: iw });
      // A long SKU wraps, and a fixed advance put the button through it
      ty += doc.heightOfString(skuText, { width: iw }) + 1;
    }
    if (l.description) {
      const descText = String(l.description);
      doc.font('Helvetica-Oblique').fontSize(7.5).fillColor(MUTED)
        .text(descText, textX, ty + 1, { width: iw });
      ty += doc.heightOfString(descText, { width: iw }) + 1;
    }
    /*
     * A button rather than the bare URL. A supplier address printed in full
     * looks untidy on a customer document and advertises where the blank
     * comes from; the label carries the meaning and the link does the work.
     */
    if (productLink) {
      const CAPTION = 'See actual product';
      const bw = doc.font('Helvetica-Bold').fontSize(7).widthOfString(CAPTION) + 16;
      const bh = 13;
      const bx = textX;
      const by = ty + 2;

      doc.roundedRect(bx, by, Math.min(bw, iw), bh, 6.5)
        .fillColor('#f6ecf6').fill();
      doc.roundedRect(bx, by, Math.min(bw, iw), bh, 6.5)
        .strokeColor(PURPLE).lineWidth(0.6).stroke();
      doc.font('Helvetica-Bold').fontSize(7).fillColor(PURPLE)
        .text(CAPTION, bx, by + 3.6, {
          width: Math.min(bw, iw), align: 'center', link: String(productLink)
        });

      // The whole pill is clickable, not just the glyphs
      doc.link(bx, by, Math.min(bw, iw), bh, String(productLink));
    }

    doc.font('Helvetica').fontSize(8.5).fillColor(INK)
      .text(bulletText(areas), colX(1) + 6, top + 8, { width: COLS[1].w - 12 });

    // The diagram says where the print goes better than the words do
    if (areaDiagrams.length) {
      const areasTextH = doc.font('Helvetica').fontSize(8.5)
        .heightOfString(bulletText(areas), { width: COLS[1].w - 12 });
      let dx = colX(1) + 6;
      const dy = top + 10 + areasTextH;
      for (const diagram of areaDiagrams.slice(0, 3)) {
        try {
          doc.image(diagram, dx, dy, { fit: [36, 36], align: 'center', valign: 'center' });
        } catch {
          /* skip a diagram pdfkit cannot decode */
        }
        dx += 40;
      }
    }

    doc.font('Helvetica').fontSize(8.5).fillColor(INK)
      .text(bulletText(types), colX(2) + 6, top + 8, { width: COLS[2].w - 12 });

    const mid = top + rowH / 2 - 5;
    doc.font('Helvetica').fontSize(9.5).fillColor(INK)
      .text(String(costed.quantity), colX(3) + 6, mid, { width: COLS[3].w - 12, align: 'center' });
    doc.text(money(unitPrice), colX(4) + 6, mid, { width: COLS[4].w - 12, align: 'right' });
    doc.font('Helvetica-Bold')
      .text(money(sellTotal), colX(5) + 6, mid, { width: COLS[5].w - 12, align: 'right' });

    y += rowH;
  });

  y += 14;

  /* --------------------------------------------- notes and the totals */
  const notesW = CONTENT * 0.52;
  const totW = CONTENT * 0.44;
  const totX = M + CONTENT - totW;
  const blockY = y;

  const totalRows: [string, string][] = [['Subtotal (excl. VAT)', money(totals.goodsPrice)]];
  if (totals.shippingPrice > 0) totalRows.push(['Shipping & Packaging', money(totals.shippingPrice)]);
  if (totals.expressPrice > 0) totalRows.push(['Express Handling', money(totals.expressPrice)]);
  if (totals.chargesPrice > 0) totalRows.push(['Other Charges', money(totals.chargesPrice)]);
  if (totals.discount > 0) totalRows.push(['Discount', `−${money(totals.discount)}`]);
  totalRows.push([`VAT (${totals.vatRate}%)`, money(totals.vatTotal)]);

  const totH = 16 + totalRows.length * 16 + 30;
  box(totX, blockY, totW, totH);
  let ty = blockY + 12;
  for (const [k, v] of totalRows) {
    doc.font('Helvetica').fontSize(9.5).fillColor(INK).text(k, totX + 14, ty, { width: totW * 0.6 });
    doc.font('Helvetica').fontSize(9.5).fillColor(INK)
      .text(v, totX + totW - 14 - 90, ty, { width: 90, align: 'right' });
    ty += 16;
  }
  ty += 4;
  doc.moveTo(totX + 14, ty).lineTo(totX + totW - 14, ty).strokeColor(RULE).lineWidth(0.8).stroke();
  ty += 7;
  doc.font('Helvetica-Bold').fontSize(13).fillColor(PURPLE).text('TOTAL', totX + 14, ty);
  doc.font('Helvetica-Bold').fontSize(13).fillColor(PURPLE)
    .text(money(totals.grossTotal), totX + totW - 14 - 110, ty, { width: 110, align: 'right' });

  // Notes sit beside the totals and match their height
  box(M, blockY, notesW, totH);
  label('Notes', M + 14, blockY + 12, notesW - 28);
  const noteText = quote.notes
    ? String(quote.notes)
    : `Thank you for considering ${company.name}.\n\nIf you have any questions or need further information, please do not hesitate to contact us.`;
  doc.font('Helvetica-Oblique').fontSize(9).fillColor(INK)
    .text(noteText, M + 14, blockY + 28, { width: notesW - 28, height: totH - 40 });

  y = blockY + totH + 12;

  /* -------------------------------------------------- four detail boxes */
  const details: [string, string][] = [
    ['Sales Person', quote.sales_rep || '—'],
    ['Customer Reference', quote.customer_reference || '—'],
    ['Shipping Method', quote.shipping_method || '—'],
    ['Number of Cartons', quote.carton_count ? String(quote.carton_count) : '—']
  ];
  const dGap = 8;
  const dW = (CONTENT - dGap * 3) / 4;
  const dH = 38;
  details.forEach(([k, v], i) => {
    const x = M + i * (dW + dGap);
    box(x, y, dW, dH);
    label(k, x + 8, y + 8, dW - 16, PURPLE, 6.5);
    doc.font('Helvetica').fontSize(9).fillColor(INK).text(v, x + 8, y + 20, { width: dW - 16 });
  });
  y += dH + 14;

  /* ------------------------------------------------------------- terms */
  const terms = company.quoteTerms
    ? String(company.quoteTerms).split('\n').map(t => t.trim()).filter(Boolean)
    : DEFAULT_TERMS;

  if (y + 20 + terms.length * 13 < A4.height - M - 40) {
    label('Terms & Conditions', M, y, CONTENT);
    y += 14;
    doc.font('Helvetica').fontSize(9).fillColor(INK);
    for (const t of terms) {
      doc.text(`•  ${t}`, M + 4, y, { width: CONTENT - 8 });
      y += 13;
    }
  }

  /* ------------------------------------------------------------ footer */
  const fy = A4.height - M - 22;
  doc.moveTo(M, fy).lineTo(RIGHT, fy).strokeColor(RULE).lineWidth(0.8).stroke();
  const footBits = [company.phone, company.email, company.website].filter(Boolean) as string[];
  doc.font('Helvetica').fontSize(8.5).fillColor(INK)
    .text(footBits.join('     '), M, fy + 8, { width: CONTENT * 0.75 });
  doc.font('Helvetica-Bold').fontSize(10).fillColor(PURPLE)
    .text('THANK YOU!', RIGHT - 120, fy + 6, { width: 120, align: 'right' });

  return doc;
}
