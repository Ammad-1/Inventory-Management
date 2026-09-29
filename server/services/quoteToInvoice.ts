import { db } from '../db';
import { calculateQuote } from '../../shared/quotePricing';

/**
 * Turns an accepted quote into Xero invoice lines.
 *
 * A quote stores what a job COSTS us plus one markup for the whole quote.
 * An invoice needs what each line SELLS for. That conversion has to be
 * exact: if the lines do not add up to the quote's net total, the customer
 * gets billed a different figure from the one they agreed to.
 *
 * So the markup is spread across lines in proportion to their cost, the
 * result is rounded the way Xero rounds it, and any penny left over by
 * that rounding becomes an explicit adjustment line rather than a silent
 * discrepancy.
 */

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10000) / 10000;

export interface InvoiceLineDraft {
  description: string;
  quantity: number;
  unitAmount: number;
  /** What Xero will compute for this line: round2(quantity x unitAmount). */
  lineAmount: number;
  blankItemId: string | null;
  packagingItemId: string | null;
  /** Shipping and adjustments consume no stock. */
  nonStock: boolean;
}

export interface ConversionResult {
  lines: InvoiceLineDraft[];
  /** Sum of the line amounts, which is what Xero will show as SubTotal. */
  netTotal: number;
  /** The quote's own net total, for comparison. */
  quoteNetTotal: number;
  /** Non-zero only if rounding forced an adjustment line. */
  roundingAdjustment: number;
}

export function buildInvoiceLines(quote: any, quoteLines: any[]): ConversionResult {
  // Recompute rather than trust the stored totals: this is the figure the
  // customer will actually be billed, so it is worth deriving again.
  const totals = calculateQuote({
    lines: quoteLines.map(l => ({
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
  const lines: InvoiceLineDraft[] = [];

  quoteLines.forEach((l, i) => {
    const costed = totals.lines[i];
    const sellTotal = costed.lineCost * markupFactor;
    const quantity = costed.quantity || 1;

    // 4dp is what Xero accepts for a unit amount; the line amount it
    // computes from that is what we have to reconcile against.
    const unitAmount = round4(sellTotal / quantity);

    const decorations = db.prepare(`
      SELECT decoration_name, print_area_name FROM quote_line_decorations WHERE quote_line_id = ?
    `).all(l.id) as any[];

    const decoText = decorations.length
      ? decorations.map(d => `${d.decoration_name} (${d.print_area_name})`).join(', ')
      : 'No decoration';

    const parts = [l.product_name];
    if (l.product_sku) parts.push(`[${l.product_sku}]`);
    parts.push('-', decoText);
    if (costed.setupCost > 0) parts.push(`- includes ${money(costed.setupCost * markupFactor)} setup`);
    if (costed.minChargeApplied) parts.push('- minimum charge applied');
    if (l.description) parts.push(`- ${l.description}`);

    lines.push({
      description: parts.join(' ').slice(0, 4000),
      quantity,
      unitAmount,
      lineAmount: round2(quantity * unitAmount),
      blankItemId: null,
      packagingItemId: null,
      nonStock: false
    });
  });

  // Shipping and express carry the same markup, as they do in the quote
  if (totals.shippingCost > 0) {
    const amount = round2(totals.shippingCost * markupFactor);
    lines.push({
      description: [quote.shipping_method || 'Delivery',
        quote.carton_count ? `- ${quote.carton_count} carton${quote.carton_count === 1 ? '' : 's'}` : '',
        quote.shipping_notes ? `- ${quote.shipping_notes}` : ''].filter(Boolean).join(' ').slice(0, 4000),
      quantity: 1,
      unitAmount: amount,
      lineAmount: amount,
      blankItemId: null,
      packagingItemId: null,
      nonStock: true
    });
  }
  if (totals.expressFee > 0) {
    const amount = round2(totals.expressFee * markupFactor);
    lines.push({
      description: 'Express handling',
      quantity: 1, unitAmount: amount, lineAmount: amount,
      blankItemId: null, packagingItemId: null, nonStock: true
    });
  }

  // A discount belongs on the invoice as its own line, so the customer can
  // see what they were given rather than wondering at a lower unit price
  if (totals.discount > 0) {
    lines.push({
      description: 'Discount',
      quantity: 1,
      unitAmount: -totals.discount,
      lineAmount: -totals.discount,
      blankItemId: null, packagingItemId: null, nonStock: true
    });
  }

  const linesNet = round2(lines.reduce((s, l) => s + l.lineAmount, 0));
  const roundingAdjustment = round2(totals.netTotal - linesNet);

  // Spreading a markup over several lines can leave a penny adrift. Show it
  // rather than let the invoice total disagree with the accepted quote.
  if (Math.abs(roundingAdjustment) >= 0.01) {
    lines.push({
      description: 'Rounding adjustment',
      quantity: 1,
      unitAmount: roundingAdjustment,
      lineAmount: roundingAdjustment,
      blankItemId: null, packagingItemId: null, nonStock: true
    });
  }

  return {
    lines,
    netTotal: round2(lines.reduce((s, l) => s + l.lineAmount, 0)),
    quoteNetTotal: totals.netTotal,
    roundingAdjustment: Math.abs(roundingAdjustment) >= 0.01 ? roundingAdjustment : 0
  };
}

/** Resolve the stock each line consumes, for the optional deduction. */
export function resolveStockForLines(quoteLines: any[], drafts: InvoiceLineDraft[]) {
  quoteLines.forEach((l, i) => {
    if (!drafts[i] || drafts[i].nonStock || !l.product_id) return;
    const product = db.prepare(
      'SELECT blank_item_id, packaging_item_id FROM products WHERE id = ?'
    ).get(l.product_id) as any;
    if (!product) return;
    drafts[i].blankItemId = product.blank_item_id || null;
    drafts[i].packagingItemId = product.packaging_item_id || null;
  });
  return drafts;
}

const money = (n: number) => `£${n.toFixed(2)}`;
