/**
 * Quote pricing — the single definition of the arithmetic.
 *
 * Imported by both the server (which stores the result) and the quote
 * builder (which previews it), so the figure the sales rep sees is the
 * figure that gets saved. Do not reimplement any of this elsewhere.
 *
 * Two rules matter, and the owner's original layout got both wrong:
 *
 * 1. Markup is applied to NET cost only. The earlier layout added 20% VAT
 *    to its own costs and then marked that up too. VAT on what we buy is
 *    reclaimable input tax, not a cost, so marking it up charges the
 *    customer a margin on money HMRC gives back.
 *
 * 2. "30% margin" in that layout was a 30% MARKUP. Cost x 1.30 leaves a
 *    23.1% margin, not 30%. Both figures are returned here so the quote
 *    can show them side by side and nobody has to guess which is meant.
 */

export interface QuoteLineInput {
  quantity: number;
  /** Per unit, from the linked inventory item at the time the line was added. */
  blankCost: number;
  packagingCost: number;
  /** Per unit, summed across the decorations chosen for this line. */
  decorationUnitCost: number;
  /** Charged once for the line, however many units. */
  setupCost: number;
  /** The line cannot be quoted below this, however small the run. */
  minCharge?: number;
}

export interface QuoteLineCosts {
  quantity: number;
  /** Blank + packaging + decoration, per unit. Excludes setup. */
  unitCost: number;
  setupCost: number;
  /** unitCost x quantity + setup, before any minimum is applied. */
  rawCost: number;
  /** What the line actually costs once the minimum charge is honoured. */
  lineCost: number;
  minChargeApplied: boolean;
}

export interface QuoteTotalsInput {
  lines: QuoteLineInput[];
  shippingCost: number;
  expressFee: number;
  /** Percent, e.g. 30 for a 30% markup on cost. */
  markupPct: number;
  /** Percent, e.g. 20. VAT is charged on the selling price, not on cost. */
  vatRate: number;
  /** Optional discount on the net selling price, in pounds. */
  discount?: number;
}

export interface QuoteTotals {
  lines: QuoteLineCosts[];
  /** Cost of the goods alone. */
  goodsCost: number;
  shippingCost: number;
  expressFee: number;
  /** Everything the job costs us, net of reclaimable VAT. */
  totalCost: number;
  markupPct: number;
  discount: number;
  /** What the customer pays before VAT. */
  netTotal: number;
  vatRate: number;
  vatTotal: number;
  /** What the customer actually pays. */
  grossTotal: number;
  profit: number;
  /** profit / netTotal. The honest figure. */
  marginPct: number;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const safe = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? n : 0);

export function costLine(line: QuoteLineInput): QuoteLineCosts {
  const quantity = Math.max(0, Math.floor(safe(line.quantity)));
  const unitCost = safe(line.blankCost) + safe(line.packagingCost) + safe(line.decorationUnitCost);
  const setupCost = safe(line.setupCost);
  const rawCost = unitCost * quantity + setupCost;
  const minCharge = safe(line.minCharge);

  // A short run still has to clear the minimum, or the setup eats the job
  const minChargeApplied = quantity > 0 && minCharge > 0 && rawCost < minCharge;

  return {
    quantity,
    unitCost: round2(unitCost),
    setupCost: round2(setupCost),
    rawCost: round2(rawCost),
    lineCost: round2(minChargeApplied ? minCharge : rawCost),
    minChargeApplied
  };
}

export function calculateQuote(input: QuoteTotalsInput): QuoteTotals {
  const lines = input.lines.map(costLine);

  const goodsCost = lines.reduce((sum, l) => sum + l.lineCost, 0);
  const shippingCost = safe(input.shippingCost);
  const expressFee = safe(input.expressFee);

  // Shipping and express are real costs of the job, so they carry markup
  // like anything else. The breakdown shows them separately so that is visible.
  const totalCost = goodsCost + shippingCost + expressFee;

  const markupPct = Math.max(0, safe(input.markupPct));
  const discount = Math.max(0, safe(input.discount));

  const beforeDiscount = totalCost * (1 + markupPct / 100);
  const netTotal = Math.max(0, beforeDiscount - discount);

  // Round the net BEFORE deriving anything from it. An invoice adds up the
  // figures it prints, so VAT has to be charged on the net the customer is
  // shown and the gross has to be those two printed figures added together.
  // Rounding each independently off the unrounded net leaves the quote a
  // penny adrift from the invoice it turns into.
  const vatRate = Math.max(0, safe(input.vatRate));
  const netRounded = round2(netTotal);
  const vatRounded = round2(netRounded * (vatRate / 100));
  const costRounded = round2(totalCost);
  const profit = round2(netRounded - costRounded);

  return {
    lines,
    goodsCost: round2(goodsCost),
    shippingCost: round2(shippingCost),
    expressFee: round2(expressFee),
    totalCost: costRounded,
    markupPct,
    discount: round2(discount),
    netTotal: netRounded,
    vatRate,
    vatTotal: vatRounded,
    grossTotal: round2(netRounded + vatRounded),
    profit,
    // Margin is profit over what we sell for, not over what we paid
    marginPct: netRounded > 0 ? round2((profit / netRounded) * 100) : 0
  };
}

/** Markup -> the margin it actually produces. 30% markup is a 23.1% margin. */
export const markupToMargin = (markupPct: number) =>
  round2((markupPct / (100 + markupPct)) * 100);

/** Margin -> the markup needed to reach it. A 30% margin needs 42.9% markup. */
export const marginToMarkup = (marginPct: number) =>
  marginPct >= 100 ? 0 : round2((marginPct / (100 - marginPct)) * 100);
