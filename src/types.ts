export type ActiveView = 
  | 'dashboard'
  | 'inventory'
  | 'bom'
  | 'production'
  | 'shipments'
  | 'orders'
  | 'forecasting'
  | 'audit_log'
  | 'reference_architecture';

export type ItemCategory = 'raw_material' | 'consumable' | 'packaging' | 'finished_goods';

export interface Supplier {
  id: string;
  name: string;
  country: string;
  leadTimeDays: number;
  contactEmail: string;
  currency: string;
  reliabilityScore: number;
  paymentTerms: string;
}

export interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  category: ItemCategory;
  unit: string;
  currentStock: number;
  reservedStock: number;
  minSafetyStock: number;
  maxStock: number;
  reorderPoint: number;
  leadTimeDays: number;
  costPerUnit: number; // Standard / FOB cost
  landedCostPerUnit: number; // True landed cost
  location: string;
  supplierId: string;
  supplierName: string;
  barcode: string;
  dailyBurnRate: number; // units consumed or sold per day
  description?: string;
  lastRestockedAt: string;
  updatedAt: string;
}

export interface BOMIngredient {
  itemId: string;
  itemName: string;
  sku: string;
  category: ItemCategory;
  quantityRequired: number;
  unit: string;
  unitCost: number;
  scrapRatePercent: number; // e.g. 2.5% defect/scrap
  allowSubstitute?: boolean;
}

export interface BillOfMaterials {
  id: string;
  name: string;
  finishedGoodsSku: string;
  finishedGoodsItemId: string;
  description: string;
  outputQuantity: number; // e.g. 1
  ingredients: BOMIngredient[];
  laborCostPerUnit: number;
  overheadCostPerUnit: number;
  targetSellPrice: number;
  notes?: string;
  updatedAt: string;
}

export type ProductionStatus = 'scheduled' | 'in_progress' | 'quality_check' | 'completed' | 'cancelled';

export interface ProductionOrder {
  id: string;
  orderNumber: string; // e.g. 'JOB-2026-104'
  customerName?: string;
  bomId: string;
  bomName: string;
  finishedGoodsItemId: string;
  finishedGoodsName: string;
  targetQuantity: number;
  completedQuantity: number;
  scrapQuantity: number;
  status: ProductionStatus;
  machineLine: string; // e.g. 'Station A - 4-Head Pneumatic Press'
  operatorName: string;
  scheduledDate: string;
  dueDate: string;
  completedDate?: string;
  notes?: string;
  materialAllocations: {
    itemId: string;
    itemName: string;
    unit: string;
    requiredTotal: number;
    allocatedTotal: number;
    actualUsed: number;
    actualScrap: number;
  }[];
}

export type POStatus = 'draft' | 'ordered' | 'in_transit' | 'customs_clearance' | 'received' | 'cancelled';

export interface POLineItem {
  itemId: string;
  sku: string;
  name: string;
  quantityOrdered: number;
  quantityReceived?: number;
  unitFobPrice: number;
  allocatedFreight: number;
  allocatedDuty: number;
  landedUnitCost: number;
  totalCost: number;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string; // e.g. 'PO-CN-8902'
  supplierId: string;
  supplierName: string;
  supplierCountry: string;
  status: POStatus;
  orderDate: string;
  expectedDeliveryDate: string;
  receivedDate?: string;
  shippingMethod: string; // e.g. 'Ocean Container 40ft HQ'
  containerNumber?: string;
  vesselName?: string;
  originPort?: string;
  destinationPort?: string;
  transitDaysTotal: number;
  transitDaysElapsed: number;
  lines: POLineItem[];
  costBreakdown: {
    fobTotal: number;
    oceanFreight: number;
    tariffsDuty: number;
    portDrayage: number;
    totalLandedCost: number;
  };
  notes?: string;
}

export type OrderStatus = 'draft' | 'approved' | 'in_production' | 'dispatched' | 'paid';

export interface SalesOrderItem {
  itemId: string;
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  estimatedUnitCost: number;
  estimatedMargin: number;
}

export interface SalesOrder {
  id: string;
  orderNumber: string; // e.g. 'SO-XERO-10492'
  customerName: string;
  customerEmail: string;
  status: OrderStatus;
  xeroSyncStatus: 'synced' | 'pending' | 'error';
  xeroInvoiceId?: string;
  items: SalesOrderItem[];
  subtotal: number;
  tax: number;
  total: number;
  estimatedCOGS: number;
  estimatedGrossProfit: number;
  estimatedGrossMarginPercent: number;
  stockDeducted: boolean;
  createdAt: string;
  dueAt: string;
  notes?: string;
}

export type MovementType = 
  | 'po_receipt'
  | 'production_consume'
  | 'production_finish'
  | 'scrap_waste'
  | 'order_dispatch'
  | 'manual_adjustment'
  | 'cycle_count';

export interface StockMovement {
  id: string;
  timestamp: string;
  itemId: string;
  sku: string;
  itemName: string;
  movementType: MovementType;
  quantityChange: number; // positive or negative
  previousStock: number;
  balanceAfter: number;
  referenceId: string; // e.g. 'PO-CN-8902', 'JOB-2026-104', 'SO-10492'
  reason: string;
  performedBy: string;
}

export interface ForecastRecommendation {
  itemId: string;
  sku: string;
  name: string;
  category: ItemCategory;
  currentStock: number;
  dailyBurnRate: number;
  daysOfSupplyRemaining: number;
  leadTimeDays: number;
  reorderPoint: number;
  stockoutDate: string;
  mustOrderByDate: string;
  recommendedOrderQuantity: number;
  recommendedContainerType: string;
  urgency: 'critical' | 'warning' | 'healthy';
  projectedCost: number;
  primarySupplier: string;
}
