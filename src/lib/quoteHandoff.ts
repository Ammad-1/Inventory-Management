/**
 * Handing a product from the product page to the quote builder.
 *
 * "Create Quote" there means "quote this product", so the product has to
 * survive the view change. An event alone will not do it: the Quotes view
 * has not mounted yet when the button is pressed, so it would miss the
 * event. The request is parked here and collected on mount instead.
 */

let pendingProductId: string | null = null;

export const QUOTE_HANDOFF_EVENT = 'printberry:create-quote';

/** Ask for a new quote starting from this product, then switch views. */
export function requestQuoteForProduct(productId: string) {
  pendingProductId = productId;
  window.dispatchEvent(new CustomEvent(QUOTE_HANDOFF_EVENT));
}

/** Collected once by the Quotes view; a refresh must not reopen the builder. */
export function takePendingQuoteProduct(): string | null {
  const id = pendingProductId;
  pendingProductId = null;
  return id;
}
