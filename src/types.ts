export type ActiveView = 
  | 'dashboard'
  | 'inventory'
  | 'shipments'
  | 'xero'
  | 'ecommerce'
  | 'bom'
  | 'products'
  | 'quotes'
  | 'movements';

export type ItemCategory = 'blank' | 'packaging' | 'consumable' | 'finished_goods';

export interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  category: ItemCategory;
  unit: string;
  currentStock: number;
  reservedStock: number;
  minSafetyStock: number;
  reorderPoint: number;
  leadTimeDays: number;
  fobCostUSD?: number;
  costPerUnit: number; // Standard / FOB cost GBP
  landedCostPerUnit: number; // True landed cost GBP
  cbmPerUnit?: number;
  weightKgPerUnit?: number;
  location: string;
  supplierName: string;
  barcode?: string;
  dailyBurnRate?: number;
  lastRestockedAt?: string;
  updatedAt: string;
}

export interface RecipeBOM {
  id: string;
  name: string;
  code: string;
  blankItemId: string;
  blankSku?: string;
  blankName?: string;
  blankLandedCost?: number;
  blankCurrentStock?: number;
  packagingItemId?: string;
  packagingSku?: string;
  packagingName?: string;
  packagingCost?: number;
  packagingCurrentStock?: number;
  consumablesCost: number;
  scrapRatePercent: number;
  targetSellPrice: number;
  totalEstimatedUnitCost?: number;
  profitMarginGBP?: number;
  profitMarginPercent?: number;
  notes?: string;
  updatedAt: string;
}

export interface ShipmentItem {
  itemId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPriceUSD: number;
  totalFOBUSD: number;
  cbmTotal: number;
  weightKgTotal: number;
  allocatedFreightAndFeesGBP?: number;
  totalLandedGBP?: number;
  unitLandedGBP?: number;
}

export interface InboundShipment {
  id: string;
  shipmentRef: string;
  containerNumber: string;
  supplierName: string;
  departureDate: string;
  etaDate: string;
  status: 'ordered' | 'on_water' | 'customs_clearance' | 'received_warehouse' | 'cancelled';
  currencyRateUSDGBP: number;
  seaFreightUSD: number;
  ukCustomsDutyGBP: number;
  ukPortHandlingGBP: number;
  ukInlandHaulageGBP: number;
  unloadingLaborGBP: number;
  costAllocationMethod: 'cbm' | 'weight' | 'value';
  totalFobUSD: number;
  totalLandedGBP: number;
  items: ShipmentItem[];
  receivedAt?: string | null;
  createdAt: string;
}

export interface XeroInvoiceLine {
  description: string;
  quantity: number;
  unitPrice: number;
  matchedRecipeId?: string | null;
  matchedBlankId?: string | null;
  matchedBlankSku?: string | null;
  matchedBlankName?: string | null;
  matchedBlankStock?: number;
  matchedBoxId?: string | null;
  matchedBoxSku?: string | null;
  matchedBoxName?: string | null;
  matchedBoxStock?: number;
  matchConfidence: 'exact_sku' | 'keyword_high' | 'keyword_low' | 'manual' | 'none';
  matchReason?: string;
  /** Operator marked this line as freight/setup/artwork - it never deducts. */
  nonStock?: boolean;
  /** Operator set the match by hand; re-sync must not overwrite it. */
  manualMatch?: boolean;
  estimatedLandedCost?: number;
  grossProfit?: number;
  deducted?: boolean;
}

export interface XeroInvoice {
  id: string;
  invoiceNumber: string;
  customerName: string;
  invoiceDate: string;
  dueDate: string;
  totalAmount: number;
  /** Revenue excluding VAT. Margin is always computed against this. */
  subTotal?: number;
  totalTax?: number;
  netRevenue?: number;
  currency: string;
  status: string;
  lineItemsJson?: string;
  lines: XeroInvoiceLine[];
  stockDeducted: number; // 0 = pending, 1 = deducted
  deductedAt?: string | null;
  totalLandedCost?: number;
  trueGrossProfit?: number;
  marginPercent?: number;
  createdAt: string;
}

export type MovementType = 
  | 'purchase_received' 
  | 'xero_sale_deduct' 
  | 'ecommerce_sale'
  | 'manual_adjust' 
  | 'scrap_defect' 
  | 'stocktake';

export type EcommercePlatform = 'shopify' | 'amazon' | 'ebay' | 'tiktok';

export interface EcommerceOrderItem {
  productTitle: string;
  skuSold: string;
  quantity: number;
  unitPrice: number;
  matchedBlankId?: string;
  matchedBlankSku?: string;
  matchedBlankName?: string;
  matchedBoxId?: string;
  matchedBoxSku?: string;
  matchedBoxName?: string;
  estimatedLandedCost?: number;
  grossProfit?: number;
}

export interface EcommerceOrder {
  id: string;
  orderNumber: string;
  platform: EcommercePlatform;
  customerName: string;
  orderDate: string;
  totalAmount: number;
  currency: string;
  status: 'paid' | 'fulfilled' | 'cancelled';
  items: EcommerceOrderItem[];
  stockDeducted: number; // 0 or 1
  deductedAt?: string | null;
  totalLandedCost?: number;
  grossProfit?: number;
  marginPercent?: number;
  createdAt: string;
  storeName?: string;
  externalOrderId?: string;
  orderStatus?: string;
  subTotal?: number;
  totalTax?: number;
  shippingAmount?: number;
}

export interface EcommerceChannelInfo {
  id: EcommercePlatform;
  name: string;
  connected: boolean;
  storeIdentifier: string;
  webhookUrl: string;
  ordersToday: number;
  revenueTodayGBP: number;
  lastOrderAt?: string;
}

export type DefectReason = 
  | 'heat_press_breakage'
  | 'print_misaligned'
  | 'chipped_in_transit'
  | 'ink_smear'
  | 'handling_scratch'
  | 'other';

export interface StockMovement {
  id: string;
  itemId: string;
  sku: string;
  itemName: string;
  movementType: MovementType;
  quantityDelta: number;
  resultingStock: number;
  unitCost: number;
  referenceId?: string;
  defectReason?: string;
  operatorName?: string;
  notes?: string;
  createdAt: string;
}

export interface XeroStatus {
  connected: boolean;
  mode: string;
  organisationName: string;
  apiCallsToday: number;
  dailyCallLimit: number;
  rateLimitRemaining: number;
  isFreeTier: boolean;
  lastSyncTimestamp: string;
  tenantId?: string | null;
  hasCredentials?: boolean;
  clientId?: string | null;
}

export interface XeroOAuthStatus {
  hasCredentials: boolean;
  clientId: string;
  redirectUri?: string;
  connected: boolean;
  tenantName: string;
  tenantId: string;
  connectedAt: string | null;
  tokenExpiresAt: string | null;
}

export interface ValuationPoint {
  label: string;
  date: string;
  valuation: number;
}

export interface ValuationHistory {
  points: ValuationPoint[];
  movementCount: number;
  hasHistory: boolean;
  /** Month-over-month change, or null when there is no baseline to compare against. */
  changePercent: number | null;
}

export type XeroSyncMode = 'recent' | 'date' | 'range' | 'all';

export interface XeroSyncOptions {
  mode: XeroSyncMode;
  /** Used when mode is 'recent' - how many of the newest invoices to fetch. */
  limit?: number;
  /** Used when mode is 'date' - a single YYYY-MM-DD day. */
  date?: string;
  /** Used when mode is 'range' - inclusive YYYY-MM-DD bounds. */
  fromDate?: string;
  toDate?: string;
}

export interface XeroLineEdit {
  index: number;
  blankItemId?: string | null;
  packagingItemId?: string | null;
  quantity?: number;
  unitPrice?: number;
  nonStock?: boolean;
}

export interface XeroContact { contactId: string; name: string; email?: string | null; defaultAccountCode?: string | null; }
export interface XeroAccount { accountId: string; code: string; name: string; type?: string | null; taxType?: string | null; }
export interface XeroTaxRate { taxType: string; name: string; rate: number; }

export interface XeroReference {
  contacts: XeroContact[];
  accounts: XeroAccount[];
  taxRates: XeroTaxRate[];
  lastSyncedAt: string | null;
}

export interface XeroInvoiceSettings {
  descriptionTemplate: string;
  shippingTemplate: string;
  defaultAccountCode: string | null;
  defaultTaxType: string | null;
  defaultDueDays: number;
  lineAmountTypes: 'Exclusive' | 'Inclusive' | 'NoTax';
}

export type XeroPushLineKind = 'product' | 'shipping' | 'custom';

export interface XeroPushLine {
  kind: XeroPushLineKind;
  description?: string;
  poNumber?: string;
  orderNumber?: string;
  salesRep?: string;
  productDescription?: string;
  carrier?: string;
  trackingNumber?: string;
  quantity: number;
  unitPrice: number;
  accountCode?: string;
  taxType?: string;
  blankItemId?: string | null;
  packagingItemId?: string | null;
}

export interface XeroPushPayload {
  contactId: string;
  reference?: string;
  invoiceDate?: string;
  dueDate?: string;
  status: 'DRAFT' | 'AUTHORISED';
  lineAmountTypes?: string;
  deductStock?: boolean;
  lines: XeroPushLine[];
}

export interface XeroPushResult {
  success: boolean;
  message: string;
  invoiceNumber?: string;
  xeroInvoiceId?: string;
  total?: number;
  status?: string;
}

export type ImportMode = 'catalogue' | 'stocktake';

export interface ImportRow {
  rowNumber: number;
  values: Record<string, any>;
  errors: string[];
  warnings: string[];
  action: 'create' | 'update' | 'skip';
  existingId?: string;
}

export interface ImportPreview {
  mode: ImportMode;
  filename: string;
  sheetNames: string[];
  sheetUsed: string | null;
  headers: string[];
  recognisedFields: string[];
  ignoredColumns: string[];
  totalRows: number;
  toCreate: number;
  toUpdate: number;
  toSkip: number;
  withWarnings: number;
  rows: ImportRow[];
}

/* ---------------------------------------------------------------------
 * Quoting catalogue
 *
 * A Product is a sellable configuration (Mug - White 11oz), not a blank.
 * blankItemId points at the InventoryItem it consumes, so a quote prices
 * against real landed cost rather than a typed-in guess.
 * ------------------------------------------------------------------- */

export interface PrintArea {
  id: string;
  categoryId: string;
  name: string;
  /** Photograph shown in the print-area diagram. */
  imagePath?: string | null;
}

export interface ProductCategory {
  id: string;
  name: string;
  printAreas: PrintArea[];
  /** Decorations this category offers. Empty means every type. */
  decorationTypeIds: string[];
}

export interface DecorationType {
  id: string;
  name: string;
}

export type ProductOptionKind = 'colour' | 'size' | 'type' | 'supplier' | 'brand' | 'quality';

/** A pick-list value. categoryId null means it applies to every category. */
export interface ProductOption {
  id: string;
  kind: ProductOptionKind;
  value: string;
  categoryId: string | null;
}

export interface ProductReference {
  categories: ProductCategory[];
  decorationTypes: DecorationType[];
  options: ProductOption[];
}

/** One cell of the decoration x print-area pricing matrix. */
export interface ProductPricing {
  id?: string;
  decorationTypeId: string;
  decorationType?: string;
  printAreaId: string;
  printArea?: string;
  setupCost: number;
  unitCost: number;
  minCharge: number;
  notes?: string | null;
  active?: number;
}

export interface ProductVariant {
  id?: string;
  brand?: string | null;
  quality?: string | null;
  colour?: string | null;
  size?: string | null;
  baseCost: number;
  priceAdjustment: number;
  finalPrice?: number;
  active?: number;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  description?: string | null;
  notes?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  type?: string | null;
  colour?: string | null;
  size?: string | null;
  supplierName?: string | null;
  supplierProductLink?: string | null;
  imageUrl?: string | null;
  blankItemId?: string | null;
  blankSku?: string | null;
  blankStock?: number | null;
  packagingItemId?: string | null;
  packagingSku?: string | null;
  /** Landed cost of the blank plus its packaging. */
  stockCost: number;
  active: number;
  printAreas: { id: string; name: string }[];
  pricing: ProductPricing[];
  variants: ProductVariant[];
  updatedAt: string;
}

/* ---------------------------------------------------------------------
 * Quotes
 *
 * Every money figure here is computed by the server from
 * shared/quotePricing.ts. The builder previews with the same module so
 * the number on screen is the number that gets stored.
 * ------------------------------------------------------------------- */

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'expired';

export interface QuoteLineDecoration {
  id?: string;
  decorationTypeId?: string | null;
  decorationName: string;
  printAreaId?: string | null;
  printAreaName: string;
  /** Charged once for the line. */
  setupCost: number;
  /** Charged per unit. */
  unitCost: number;
}

export interface QuoteLine {
  id?: string;
  productId?: string | null;
  productSku?: string | null;
  productName: string;
  imageUrl?: string | null;
  description?: string | null;
  quantity: number;
  /** Snapshotted from the linked stock item when the line was added. */
  blankCost: number;
  packagingCost: number;
  decorationUnitCost?: number;
  setupCost?: number;
  minCharge: number;
  unitCost?: number;
  lineCost?: number;
  minChargeApplied?: boolean;
  decorations: QuoteLineDecoration[];
}

export interface Quote {
  id: string;
  quoteNumber: string;
  status: QuoteStatus;
  contactId?: string | null;
  customerName: string;
  customerEmail?: string | null;
  customerReference?: string | null;
  salesRep?: string | null;
  quoteDate: string;
  validUntil?: string | null;
  leadTime?: string | null;
  billingAddress?: string | null;
  deliveryAddress?: string | null;
  deliverySameAsBilling: boolean;
  cartonCount: number;
  shippingMethod?: string | null;
  shippingCost: number;
  expressFee: number;
  shippingNotes?: string | null;
  /** Applied to net cost only. VAT is never marked up. */
  markupPct: number;
  vatRate: number;
  discount: number;
  notes?: string | null;
  goodsCost: number;
  totalCost: number;
  /** What the customer pays before VAT. */
  netTotal: number;
  vatTotal: number;
  /** What the customer actually pays. */
  grossTotal: number;
  profit: number;
  marginPct: number;
  xeroInvoiceId?: string | null;
  xeroInvoiceNumber?: string | null;
  createdAt: string;
  updatedAt: string;
  sentAt?: string | null;
  decidedAt?: string | null;
  lines: QuoteLine[];
}

export interface QuoteReference {
  customers: { contactId: string; name: string; email: string | null }[];
  salesReps: { id: string; name: string; email: string | null }[];
  shippingMethods: string[];
  vatRates: { rate: number; label: string }[];
  /** Each preset carries the margin it actually produces. */
  markupPresets: { markupPct: number; marginPct: number }[];
  marginToMarkup: { marginPct: number; markupPct: number }[];
}
