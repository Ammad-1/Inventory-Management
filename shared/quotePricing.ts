/**
 * Quote pricing — the single definition of the arithmetic.
 *
 * Imported by both the server (which stores the result) and the quote
 * builder (which previews it), so the figure the sales rep sees is the
 * figure that gets saved. Do not reimplement any of this elsewhere.
 *
 * A quote has two sides that must not be confused:
 *
 *   COST  — what the job costs us. Blank, packaging, decoration, setup,
 *           freight. Net of VAT, because supplier VAT is reclaimable.
 *   PRICE — what we charge the customer. Entered directly, because that
 *           is how a price is decided: you know you are charging £8 a
 *           tee, not that you are charging cost plus 31.4%.
 *
 * Markup is a convenience for filling the price in, not the definition of
 * it. Margin is then reported from the two sides, which is the honest way
 * round: price is chosen, margin is the consequence.
 *
 * Two rules the owner's original layout got wrong, kept fixed here:
 *
 * 1. VAT is charged on the selling price and never marked up. VAT we pay
 *    suppliers is reclaimable input tax, not a cost.
 * 2. "30% margin" there meant a 30% markup. Cost x 1.30 leaves a 23.1%
 *    margin. Both figures are returned so nobody has to guess which.
 */

export interface QuoteLineInput {
  quantity: number;

  /* ---- cost side, used for margin ---- */
  /** Per unit, from the linked inventory item at the time the line was added. */
  blankCost: number;
  packagingCost: number;
  /** Per unit, summed across the decorations chosen for this line. */
  decorationUnitCost: number;
  /** Charged once for the line, however many units. */
  setupCost: number;
  /** The line cannot be quoted below this, however small the run. */
  minCharge?: number;

  /* ---- price side, what the customer pays ---- */
  /**
   * Selling price per unit, excluding VAT. When set, this is the price:
   * markup is not applied on top of it.
   */
  unitPrice?: number | null;
  /** One-off charge for the line, excluding VAT — origination, setup, artwork. */
  setupPrice?: number | null;
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

  /** What the customer is charged for this line, excluding VAT. */
  lineprice: number;
  /** lineprice / quantity, for display. */
  effectiveUnitPrice: number;
  /** True when the price was entered rather than derived from markup. */
  pricedManually: boolean;
  /** Profit on this line alone. */
  lineProfit: number;
  lineMarginPct: number;
}

/** Anything else being charged: artwork, samples, carriage surcharge. */
export interface QuoteChargeInput {
  description?: string;
  /** Excluding VAT. */
  amount: number;
  /** What it costs us, if anything. Leave at zero for pure margin. */
  cost?: number;
}

export interface QuoteTotalsInput {
  lines: QuoteLineInput[];

  /** What freight costs us. */
  shippingCost: number;
  expressFee: number;
  /** What we charge for them. Falls back to the cost plus markup when unset. */
  shippingPrice?: number | null;
  expressPrice?: number | null;

  charges?: QuoteChargeInput[];

  /** Percent. Only fills in prices that were not entered directly. */
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
  chargesCost: number;
  /** Everything the job costs us, net of reclaimable VAT. */
  totalCost: number;

  /** What the customer is charged for the goods. */
  goodsPrice: number;
  shippingPrice: number;
  expressPrice: number;
  chargesPrice: number;

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
  /** The markup the chosen prices actually represent. */
  effectiveMarkupPct: number;
  /** True when every price came from markup rather than being entered. */
  allPricesDerived: boolean;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const safe = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? n : 0);
const given = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= 0;

export function costLine(line: QuoteLineInput): Omit<QuoteLineCosts, 'lineprice'> & { lineCost: number } {
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
    minChargeApplied,
    lineprice: 0, effectiveUnitPrice: 0, pricedManually: false,
    lineProfit: 0, lineMarginPct: 0
  } as any;
}

export function calculateQuote(input: QuoteTotalsInput): QuoteTotals {
  const markupPct = Math.max(0, safe(input.markupPct));
  const factor = 1 + markupPct / 100;

  const lines: QuoteLineCosts[] = input.lines.map(l => {
    const costed = costLine(l) as any as QuoteLineCosts;

    // An entered price is the price. Markup only fills the gap where none
    // was given, so the two never compound.
    const pricedManually = given(l.unitPrice) || given(l.setupPrice);
    const lineprice = pricedManually
      ? round2(safe(l.unitPrice) * costed.quantity + safe(l.setupPrice))
      : round2(costed.lineCost * factor);

    const lineProfit = round2(lineprice - costed.lineCost);
    return {
      ...costed,
      lineprice,
      effectiveUnitPrice: costed.quantity ? round2(lineprice / costed.quantity) : lineprice,
      pricedManually,
      lineProfit,
      lineMarginPct: lineprice > 0 ? round2((lineProfit / lineprice) * 100) : 0
    };
  });

  const goodsCost = lines.reduce((s, l) => s + l.lineCost, 0);
  const goodsPrice = lines.reduce((s, l) => s + l.lineprice, 0);

  const shippingCost = safe(input.shippingCost);
  const expressFee = safe(input.expressFee);
  // Freight is charged at what we say, or at cost plus markup if unstated
  const shippingPrice = given(input.shippingPrice) ? input.shippingPrice : shippingCost * factor;
  const expressPrice = given(input.expressPrice) ? input.expressPrice : expressFee * factor;

  const charges = input.charges || [];
  const chargesPrice = charges.reduce((s, c) => s + safe(c.amount), 0);
  const chargesCost = charges.reduce((s, c) => s + safe(c.cost), 0);

  const totalCost = goodsCost + shippingCost + expressFee + chargesCost;
  const discount = Math.max(0, safe(input.discount));

  // Round the net BEFORE deriving anything from it. An invoice adds up the
  // figures it prints, so VAT is charged on the net the customer is shown
  // and the gross is those two printed figures added together.
  const netRounded = round2(Math.max(0, goodsPrice + shippingPrice + expressPrice + chargesPrice - discount));
  const vatRate = Math.max(0, safe(input.vatRate));
  const vatRounded = round2(netRounded * (vatRate / 100));
  const costRounded = round2(totalCost);
  const profit = round2(netRounded - costRounded);

  return {
    lines,
    goodsCost: round2(goodsCost),
    shippingCost: round2(shippingCost),
    expressFee: round2(expressFee),
    chargesCost: round2(chargesCost),
    totalCost: costRounded,

    goodsPrice: round2(goodsPrice),
    shippingPrice: round2(shippingPrice),
    expressPrice: round2(expressPrice),
    chargesPrice: round2(chargesPrice),

    markupPct,
    discount: round2(discount),
    netTotal: netRounded,
    vatRate,
    vatTotal: vatRounded,
    grossTotal: round2(netRounded + vatRounded),
    profit,
    // Margin is profit over what we sell for, not over what we paid
    marginPct: netRounded > 0 ? round2((profit / netRounded) * 100) : 0,
    effectiveMarkupPct: costRounded > 0 ? round2((profit / costRounded) * 100) : 0,
    allPricesDerived: lines.every(l => !l.pricedManually)
  };
}

/** Markup -> the margin it actually produces. 30% markup is a 23.1% margin. */
export const markupToMargin = (markupPct: number) =>
  round2((markupPct / (100 + markupPct)) * 100);

/** Margin -> the markup needed to reach it. A 30% margin needs 42.9% markup. */
export const marginToMarkup = (marginPct: number) =>
  marginPct >= 100 ? 0 : round2((marginPct / (100 - marginPct)) * 100);

/** The price that reaches a target margin on a known cost. */
export const priceForMargin = (cost: number, marginPct: number) =>
  marginPct >= 100 ? 0 : round2(cost / (1 - marginPct / 100));
