import React, { createContext, useContext, useState, useEffect } from 'react';
import { 
  InventoryItem, 
  BillOfMaterials, 
  ProductionOrder, 
  PurchaseOrder, 
  SalesOrder, 
  StockMovement, 
  Supplier, 
  ForecastRecommendation,
  ProductionStatus,
  MovementType,
  ActiveView
} from '../types';
import { 
  INITIAL_INVENTORY, 
  INITIAL_BOM, 
  INITIAL_PRODUCTION_ORDERS, 
  INITIAL_PURCHASE_ORDERS, 
  INITIAL_SALES_ORDERS, 
  INITIAL_STOCK_MOVEMENTS, 
  INITIAL_SUPPLIERS 
} from '../data/initialData';

interface InventoryContextType {
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
  inventory: InventoryItem[];
  boms: BillOfMaterials[];
  productionOrders: ProductionOrder[];
  purchaseOrders: PurchaseOrder[];
  salesOrders: SalesOrder[];
  stockMovements: StockMovement[];
  suppliers: Supplier[];
  
  // Item operations
  addItem: (itemData: Omit<InventoryItem, 'id' | 'updatedAt' | 'lastRestockedAt'>) => InventoryItem;
  updateItem: (id: string, updates: Partial<InventoryItem>) => void;
  deleteItem: (id: string) => void;
  adjustStock: (itemId: string, qtyDelta: number, reason: string, movementType?: MovementType, referenceId?: string) => void;

  // BOM operations
  addBOM: (bomData: Omit<BillOfMaterials, 'id' | 'updatedAt'>) => BillOfMaterials;
  updateBOM: (id: string, updates: Partial<BillOfMaterials>) => void;
  deleteBOM: (id: string) => void;

  // Production Operations
  createProductionOrder: (data: {
    bomId: string;
    targetQuantity: number;
    machineLine: string;
    operatorName: string;
    dueDate: string;
    customerName?: string;
    notes?: string;
  }) => ProductionOrder;
  updateProductionStatus: (orderId: string, status: ProductionStatus, completedQty?: number, scrapQty?: number) => void;
  completeProductionOrder: (orderId: string, finalCompletedQty: number, finalScrapQty: number) => void;

  // Purchase Order Operations
  createPurchaseOrder: (poData: Omit<PurchaseOrder, 'id'>) => PurchaseOrder;
  updatePOStatus: (poId: string, status: PurchaseOrder['status']) => void;
  receivePurchaseOrder: (poId: string) => void;

  // Sales Orders Operations
  createSalesOrder: (orderData: Omit<SalesOrder, 'id' | 'createdAt' | 'stockDeducted'>) => SalesOrder;
  approveSalesOrder: (orderId: string) => void;
  dispatchSalesOrder: (orderId: string) => void;
  syncXeroInvoice: (orderId: string) => void;

  // Forecasting
  forecasts: ForecastRecommendation[];
  quickReorderFromForecast: (forecast: ForecastRecommendation) => void;

  // Reset
  resetToDefaultData: () => void;
}

const InventoryContext = createContext<InventoryContextType | undefined>(undefined);

const STORAGE_KEYS = {
  INVENTORY: 'smartprint_inventory_v1',
  BOM: 'smartprint_bom_v1',
  PRODUCTION: 'smartprint_production_v1',
  PURCHASE_ORDERS: 'smartprint_po_v1',
  SALES_ORDERS: 'smartprint_so_v1',
  MOVEMENTS: 'smartprint_movements_v1',
  SUPPLIERS: 'smartprint_suppliers_v1',
};

export const InventoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeView, setActiveView] = useState<ActiveView>('dashboard');

  const [inventory, setInventory] = useState<InventoryItem[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.INVENTORY);
    return saved ? JSON.parse(saved) : INITIAL_INVENTORY;
  });

  const [boms, setBoms] = useState<BillOfMaterials[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.BOM);
    return saved ? JSON.parse(saved) : INITIAL_BOM;
  });

  const [productionOrders, setProductionOrders] = useState<ProductionOrder[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.PRODUCTION);
    return saved ? JSON.parse(saved) : INITIAL_PRODUCTION_ORDERS;
  });

  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.PURCHASE_ORDERS);
    return saved ? JSON.parse(saved) : INITIAL_PURCHASE_ORDERS;
  });

  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.SALES_ORDERS);
    return saved ? JSON.parse(saved) : INITIAL_SALES_ORDERS;
  });

  const [stockMovements, setStockMovements] = useState<StockMovement[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.MOVEMENTS);
    return saved ? JSON.parse(saved) : INITIAL_STOCK_MOVEMENTS;
  });

  const [suppliers] = useState<Supplier[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.SUPPLIERS);
    return saved ? JSON.parse(saved) : INITIAL_SUPPLIERS;
  });

  // Sync state changes to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.INVENTORY, JSON.stringify(inventory));
  }, [inventory]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.BOM, JSON.stringify(boms));
  }, [boms]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.PRODUCTION, JSON.stringify(productionOrders));
  }, [productionOrders]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.PURCHASE_ORDERS, JSON.stringify(purchaseOrders));
  }, [purchaseOrders]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SALES_ORDERS, JSON.stringify(salesOrders));
  }, [salesOrders]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.MOVEMENTS, JSON.stringify(stockMovements));
  }, [stockMovements]);

  const logStockMovement = (
    item: InventoryItem, 
    qtyDelta: number, 
    balanceAfter: number, 
    movementType: MovementType, 
    reason: string, 
    referenceId: string = 'MANUAL'
  ) => {
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const newMovement: StockMovement = {
      id: `MOV-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: now,
      itemId: item.id,
      sku: item.sku,
      itemName: item.name,
      movementType,
      quantityChange: qtyDelta,
      previousStock: item.currentStock,
      balanceAfter,
      referenceId,
      reason,
      performedBy: 'Operations Manager',
    };
    setStockMovements(prev => [newMovement, ...prev]);
  };

  const addItem = (itemData: Omit<InventoryItem, 'id' | 'updatedAt' | 'lastRestockedAt'>): InventoryItem => {
    const now = new Date().toISOString().split('T')[0];
    const newItem: InventoryItem = {
      ...itemData,
      id: `ITEM-${Date.now()}`,
      lastRestockedAt: now,
      updatedAt: now,
    };
    setInventory(prev => [newItem, ...prev]);
    logStockMovement(newItem, newItem.currentStock, newItem.currentStock, 'manual_adjustment', 'Initial stock created for new catalog item', newItem.sku);
    return newItem;
  };

  const updateItem = (id: string, updates: Partial<InventoryItem>) => {
    const now = new Date().toISOString().split('T')[0];
    setInventory(prev => prev.map(item => {
      if (item.id === id) {
        return { ...item, ...updates, updatedAt: now };
      }
      return item;
    }));
  };

  const deleteItem = (id: string) => {
    setInventory(prev => prev.filter(item => item.id !== id));
  };

  const adjustStock = (
    itemId: string, 
    qtyDelta: number, 
    reason: string, 
    movementType: MovementType = 'manual_adjustment', 
    referenceId: string = 'AUDIT-MANUAL'
  ) => {
    const targetItem = inventory.find(i => i.id === itemId);
    if (!targetItem) return;

    const newStock = Math.max(0, targetItem.currentStock + qtyDelta);
    const now = new Date().toISOString().split('T')[0];

    updateItem(itemId, {
      currentStock: newStock,
      updatedAt: now,
      ...(qtyDelta > 0 ? { lastRestockedAt: now } : {})
    });

    logStockMovement(targetItem, qtyDelta, newStock, movementType, reason, referenceId);
  };

  const addBOM = (bomData: Omit<BillOfMaterials, 'id' | 'updatedAt'>): BillOfMaterials => {
    const now = new Date().toISOString().split('T')[0];
    const newBOM: BillOfMaterials = {
      ...bomData,
      id: `BOM-${Date.now()}`,
      updatedAt: now,
    };
    setBoms(prev => [newBOM, ...prev]);
    return newBOM;
  };

  const updateBOM = (id: string, updates: Partial<BillOfMaterials>) => {
    const now = new Date().toISOString().split('T')[0];
    setBoms(prev => prev.map(b => b.id === id ? { ...b, ...updates, updatedAt: now } : b));
  };

  const deleteBOM = (id: string) => {
    setBoms(prev => prev.filter(b => b.id !== id));
  };

  const createProductionOrder = (data: {
    bomId: string;
    targetQuantity: number;
    machineLine: string;
    operatorName: string;
    dueDate: string;
    customerName?: string;
    notes?: string;
  }): ProductionOrder => {
    const bom = boms.find(b => b.id === data.bomId);
    if (!bom) throw new Error('BOM not found');

    const finishedGoodsItem = inventory.find(i => i.id === bom.finishedGoodsItemId);
    const today = new Date().toISOString().split('T')[0];
    const jobNum = `JOB-2026-${Math.floor(100 + Math.random() * 900)}`;

    const allocations = bom.ingredients.map(ing => {
      const scrapFactor = 1 + (ing.scrapRatePercent / 100);
      const required = Math.ceil(ing.quantityRequired * data.targetQuantity * scrapFactor);
      return {
        itemId: ing.itemId,
        itemName: ing.itemName,
        unit: ing.unit,
        requiredTotal: required,
        allocatedTotal: required,
        actualUsed: 0,
        actualScrap: 0,
      };
    });

    // Reserve stock on raw materials
    allocations.forEach(alloc => {
      const item = inventory.find(i => i.id === alloc.itemId);
      if (item) {
        updateItem(item.id, {
          reservedStock: item.reservedStock + alloc.allocatedTotal
        });
      }
    });

    const newJob: ProductionOrder = {
      id: jobNum,
      orderNumber: jobNum,
      customerName: data.customerName || 'Stock Replenishment Run',
      bomId: bom.id,
      bomName: bom.name,
      finishedGoodsItemId: bom.finishedGoodsItemId,
      finishedGoodsName: finishedGoodsItem?.name || bom.name,
      targetQuantity: data.targetQuantity,
      completedQuantity: 0,
      scrapQuantity: 0,
      status: 'scheduled',
      machineLine: data.machineLine,
      operatorName: data.operatorName,
      scheduledDate: today,
      dueDate: data.dueDate,
      notes: data.notes,
      materialAllocations: allocations,
    };

    setProductionOrders(prev => [newJob, ...prev]);
    return newJob;
  };

  const updateProductionStatus = (
    orderId: string, 
    status: ProductionStatus, 
    completedQty?: number, 
    scrapQty?: number
  ) => {
    setProductionOrders(prev => prev.map(job => {
      if (job.id === orderId) {
        return {
          ...job,
          status,
          ...(completedQty !== undefined ? { completedQuantity: completedQty } : {}),
          ...(scrapQty !== undefined ? { scrapQuantity: scrapQty } : {}),
        };
      }
      return job;
    }));
  };

  const completeProductionOrder = (orderId: string, finalCompletedQty: number, finalScrapQty: number) => {
    const job = productionOrders.find(j => j.id === orderId);
    if (!job) return;

    const today = new Date().toISOString().split('T')[0];

    // Deduct allocated raw materials from actual stock and release reservation
    job.materialAllocations.forEach(alloc => {
      const item = inventory.find(i => i.id === alloc.itemId);
      if (item) {
        const consumed = Math.ceil(alloc.requiredTotal * (finalCompletedQty / job.targetQuantity));
        const scrapPart = Math.ceil(alloc.requiredTotal * (finalScrapQty / job.targetQuantity));
        const totalUsed = consumed + scrapPart;

        adjustStock(
          item.id, 
          -totalUsed, 
          `Production batch completed for ${job.orderNumber} (${job.finishedGoodsName})`, 
          'production_consume', 
          job.orderNumber
        );

        // Also release the reservation
        updateItem(item.id, {
          reservedStock: Math.max(0, item.reservedStock - alloc.allocatedTotal)
        });
      }
    });

    // Increment finished goods stock
    const fgItem = inventory.find(i => i.id === job.finishedGoodsItemId);
    if (fgItem) {
      adjustStock(
        fgItem.id, 
        finalCompletedQty, 
        `Completed production job output from ${job.orderNumber} (Scrap logged: ${finalScrapQty} units)`, 
        'production_finish', 
        job.orderNumber
      );
    }

    // Update job status to completed
    setProductionOrders(prev => prev.map(j => {
      if (j.id === orderId) {
        return {
          ...j,
          status: 'completed',
          completedQuantity: finalCompletedQty,
          scrapQuantity: finalScrapQty,
          completedDate: today,
        };
      }
      return j;
    }));
  };

  const createPurchaseOrder = (poData: Omit<PurchaseOrder, 'id'>): PurchaseOrder => {
    const newPO: PurchaseOrder = {
      ...poData,
      id: poData.poNumber || `PO-${Date.now()}`,
    };
    setPurchaseOrders(prev => [newPO, ...prev]);
    return newPO;
  };

  const updatePOStatus = (poId: string, status: PurchaseOrder['status']) => {
    setPurchaseOrders(prev => prev.map(po => {
      if (po.id === poId) {
        return { ...po, status };
      }
      return po;
    }));
  };

  const receivePurchaseOrder = (poId: string) => {
    const po = purchaseOrders.find(p => p.id === poId);
    if (!po || po.status === 'received') return;

    const today = new Date().toISOString().split('T')[0];

    // Put away items into stock and update landed cost
    po.lines.forEach(line => {
      const item = inventory.find(i => i.id === line.itemId || i.sku === line.sku);
      if (item) {
        // Calculate weighted average landed cost if needed, or update to latest batch landed cost
        const prevValue = item.currentStock * item.landedCostPerUnit;
        const incomingValue = line.quantityOrdered * line.landedUnitCost;
        const totalUnits = item.currentStock + line.quantityOrdered;
        const newWeightedLandedCost = totalUnits > 0 ? (prevValue + incomingValue) / totalUnits : line.landedUnitCost;

        adjustStock(
          item.id,
          line.quantityOrdered,
          `Received shipment container ${po.containerNumber || po.poNumber} from ${po.supplierName}`,
          'po_receipt',
          po.poNumber
        );

        updateItem(item.id, {
          landedCostPerUnit: parseFloat(newWeightedLandedCost.toFixed(3)),
          lastRestockedAt: today,
        });
      }
    });

    // Mark PO received
    setPurchaseOrders(prev => prev.map(p => {
      if (p.id === poId) {
        return {
          ...p,
          status: 'received',
          receivedDate: today,
          transitDaysElapsed: p.transitDaysTotal,
        };
      }
      return p;
    }));
  };

  const createSalesOrder = (orderData: Omit<SalesOrder, 'id' | 'createdAt' | 'stockDeducted'>): SalesOrder => {
    const now = new Date().toISOString().split('T')[0];
    const newSO: SalesOrder = {
      ...orderData,
      id: orderData.orderNumber || `SO-${Date.now()}`,
      createdAt: now,
      stockDeducted: false,
    };
    setSalesOrders(prev => [newSO, ...prev]);
    return newSO;
  };

  const approveSalesOrder = (orderId: string) => {
    const so = salesOrders.find(s => s.id === orderId);
    if (!so) return;

    // Deduct or reserve finished goods
    so.items.forEach(item => {
      const invItem = inventory.find(i => i.id === item.itemId || i.sku === item.sku);
      if (invItem) {
        updateItem(invItem.id, {
          reservedStock: invItem.reservedStock + item.quantity,
        });
      }
    });

    setSalesOrders(prev => prev.map(s => {
      if (s.id === orderId) {
        return {
          ...s,
          status: 'approved',
          stockDeducted: true,
          xeroSyncStatus: 'synced',
          xeroInvoiceId: s.xeroInvoiceId || `INV-XERO-${Math.floor(10000 + Math.random() * 90000)}`,
        };
      }
      return s;
    }));
  };

  const dispatchSalesOrder = (orderId: string) => {
    const so = salesOrders.find(s => s.id === orderId);
    if (!so) return;

    // Deduct physical stock
    so.items.forEach(item => {
      const invItem = inventory.find(i => i.id === item.itemId || i.sku === item.sku);
      if (invItem) {
        adjustStock(
          invItem.id,
          -item.quantity,
          `Fulfillment dispatch for customer order ${so.orderNumber} (${so.customerName})`,
          'order_dispatch',
          so.orderNumber
        );
        updateItem(invItem.id, {
          reservedStock: Math.max(0, invItem.reservedStock - item.quantity)
        });
      }
    });

    setSalesOrders(prev => prev.map(s => s.id === orderId ? { ...s, status: 'dispatched' } : s));
  };

  const syncXeroInvoice = (orderId: string) => {
    setSalesOrders(prev => prev.map(s => {
      if (s.id === orderId) {
        return {
          ...s,
          xeroSyncStatus: 'synced',
          xeroInvoiceId: s.xeroInvoiceId || `INV-XERO-${Math.floor(10000 + Math.random() * 90000)}`,
        };
      }
      return s;
    }));
  };

  // Generate real-time forecasts for every item
  const forecasts: ForecastRecommendation[] = inventory.map(item => {
    const burn = item.dailyBurnRate || 10;
    const available = Math.max(0, item.currentStock - item.reservedStock);
    const daysRemaining = Math.floor(available / burn);
    
    const now = new Date();
    const stockoutDateObj = new Date(now.getTime() + daysRemaining * 24 * 60 * 60 * 1000);
    const stockoutDate = stockoutDateObj.toISOString().split('T')[0];

    // Must order leadTimeDays before stockout
    const orderDeadlineDays = daysRemaining - item.leadTimeDays;
    const orderDeadlineObj = new Date(now.getTime() + orderDeadlineDays * 24 * 60 * 60 * 1000);
    const mustOrderByDate = orderDeadlineObj.toISOString().split('T')[0];

    let urgency: 'critical' | 'warning' | 'healthy' = 'healthy';
    if (orderDeadlineDays <= 5) {
      urgency = 'critical';
    } else if (orderDeadlineDays <= 20) {
      urgency = 'warning';
    }

    // Recommended order quantity: standard reorder lot or container size
    let recommendedQty = 0;
    let containerType = 'LTL Pallet Batch';

    if (item.category === 'raw_material' && item.sku.includes('MUG')) {
      // 40ft HQ fits ~36,000 mugs (1000 cartons x 36)
      recommendedQty = 36000;
      containerType = '40ft High Cube Container (1,000 Master Cartons)';
    } else if (item.category === 'raw_material' && (item.sku.includes('TUMB') || item.sku.includes('GLSS'))) {
      recommendedQty = 6000;
      containerType = '20ft Standard Container (250 Cartons)';
    } else if (item.category === 'consumable') {
      recommendedQty = Math.max(item.reorderPoint, Math.ceil(burn * 60)); // 60 days buffer
      containerType = 'Palletized Chemical Freight';
    } else {
      recommendedQty = Math.max(500, Math.ceil(burn * 30));
      containerType = 'Standard Truckload Delivery';
    }

    const projectedCost = parseFloat((recommendedQty * item.costPerUnit).toFixed(2));

    return {
      itemId: item.id,
      sku: item.sku,
      name: item.name,
      category: item.category,
      currentStock: item.currentStock,
      dailyBurnRate: burn,
      daysOfSupplyRemaining: daysRemaining,
      leadTimeDays: item.leadTimeDays,
      reorderPoint: item.reorderPoint,
      stockoutDate,
      mustOrderByDate,
      recommendedOrderQuantity: recommendedQty,
      recommendedContainerType: containerType,
      urgency,
      projectedCost,
      primarySupplier: item.supplierName,
    };
  }).sort((a, b) => {
    // Sort critical first
    const score = (u: string) => u === 'critical' ? 0 : u === 'warning' ? 1 : 2;
    return score(a.urgency) - score(b.urgency) || a.daysOfSupplyRemaining - b.daysOfSupplyRemaining;
  });

  const quickReorderFromForecast = (forecast: ForecastRecommendation) => {
    const poNum = `PO-AUTO-${Math.floor(1000 + Math.random() * 9000)}`;
    const today = new Date().toISOString().split('T')[0];
    const deliveryDateObj = new Date(Date.now() + forecast.leadTimeDays * 24 * 60 * 60 * 1000);
    const expectedDelivery = deliveryDateObj.toISOString().split('T')[0];

    const invItem = inventory.find(i => i.id === forecast.itemId);
    const fobPrice = invItem ? invItem.costPerUnit : 1.0;
    const estFreight = parseFloat((forecast.projectedCost * 0.18).toFixed(2));
    const estDuty = parseFloat((forecast.projectedCost * 0.08).toFixed(2));
    const totalLanded = parseFloat((forecast.projectedCost + estFreight + estDuty + 650).toFixed(2));
    const landedPerUnit = parseFloat((totalLanded / forecast.recommendedOrderQuantity).toFixed(3));

    const newPO: PurchaseOrder = {
      id: poNum,
      poNumber: poNum,
      supplierId: invItem?.supplierId || 'SUP-001',
      supplierName: forecast.primarySupplier,
      supplierCountry: 'China',
      status: 'ordered',
      orderDate: today,
      expectedDeliveryDate: expectedDelivery,
      shippingMethod: forecast.recommendedContainerType,
      transitDaysTotal: forecast.leadTimeDays,
      transitDaysElapsed: 1,
      lines: [
        {
          itemId: forecast.itemId,
          sku: forecast.sku,
          name: forecast.name,
          quantityOrdered: forecast.recommendedOrderQuantity,
          unitFobPrice: fobPrice,
          allocatedFreight: parseFloat((estFreight / forecast.recommendedOrderQuantity).toFixed(3)),
          allocatedDuty: parseFloat((estDuty / forecast.recommendedOrderQuantity).toFixed(3)),
          landedUnitCost: landedPerUnit,
          totalCost: totalLanded,
        }
      ],
      costBreakdown: {
        fobTotal: forecast.projectedCost,
        oceanFreight: estFreight,
        tariffsDuty: estDuty,
        portDrayage: 650.00,
        totalLandedCost: totalLanded,
      },
      notes: `Automated predictive replenishment order generated from SmartPrint IQ AI Forecasting. Triggered due to ${forecast.daysOfSupplyRemaining} days of stock remaining.`,
    };

    setPurchaseOrders(prev => [newPO, ...prev]);
    setActiveView('shipments');
  };

  const resetToDefaultData = () => {
    localStorage.removeItem(STORAGE_KEYS.INVENTORY);
    localStorage.removeItem(STORAGE_KEYS.BOM);
    localStorage.removeItem(STORAGE_KEYS.PRODUCTION);
    localStorage.removeItem(STORAGE_KEYS.PURCHASE_ORDERS);
    localStorage.removeItem(STORAGE_KEYS.SALES_ORDERS);
    localStorage.removeItem(STORAGE_KEYS.MOVEMENTS);

    setInventory(INITIAL_INVENTORY);
    setBoms(INITIAL_BOM);
    setProductionOrders(INITIAL_PRODUCTION_ORDERS);
    setPurchaseOrders(INITIAL_PURCHASE_ORDERS);
    setSalesOrders(INITIAL_SALES_ORDERS);
    setStockMovements(INITIAL_STOCK_MOVEMENTS);
  };

  return (
    <InventoryContext.Provider
      value={{
        activeView,
        setActiveView,
        inventory,
        boms,
        productionOrders,
        purchaseOrders,
        salesOrders,
        stockMovements,
        suppliers,
        addItem,
        updateItem,
        deleteItem,
        adjustStock,
        addBOM,
        updateBOM,
        deleteBOM,
        createProductionOrder,
        updateProductionStatus,
        completeProductionOrder,
        createPurchaseOrder,
        updatePOStatus,
        receivePurchaseOrder,
        createSalesOrder,
        approveSalesOrder,
        dispatchSalesOrder,
        syncXeroInvoice,
        forecasts,
        quickReorderFromForecast,
        resetToDefaultData,
      }}
    >
      {children}
    </InventoryContext.Provider>
  );
};

export const useInventory = () => {
  const context = useContext(InventoryContext);
  if (!context) {
    throw new Error('useInventory must be used within an InventoryProvider');
  }
  return context;
};
