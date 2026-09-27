import { Router, Request, Response } from 'express';
import { db } from '../db';
import crypto from 'node:crypto';

export const shipmentsRouter = Router();

// Helper to calculate landed costs
export function calculateShipmentLandedCosts(payload: {
  currencyRateUSDGBP: number;
  seaFreightUSD: number;
  ukCustomsDutyGBP: number;
  ukPortHandlingGBP: number;
  ukInlandHaulageGBP: number;
  unloadingLaborGBP: number;
  costAllocationMethod: 'cbm' | 'weight' | 'value';
  items: Array<{
    itemId: string;
    sku: string;
    name: string;
    quantity: number;
    unitPriceUSD: number;
    cbmTotal: number;
    weightKgTotal: number;
  }>;
}) {
  const rate = payload.currencyRateUSDGBP || 1.28;
  const freightGBP = (payload.seaFreightUSD || 0) / rate;
  const totalFeesGBP = freightGBP + 
    (payload.ukCustomsDutyGBP || 0) + 
    (payload.ukPortHandlingGBP || 0) + 
    (payload.ukInlandHaulageGBP || 0) + 
    (payload.unloadingLaborGBP || 0);

  const totalCBM = payload.items.reduce((sum, it) => sum + (it.cbmTotal || 0), 0) || 1;
  const totalWeight = payload.items.reduce((sum, it) => sum + (it.weightKgTotal || 0), 0) || 1;
  const totalFobUSD = payload.items.reduce((sum, it) => sum + (it.unitPriceUSD * it.quantity), 0) || 1;

  let totalLandedGBP = 0;

  const computedItems = payload.items.map(it => {
    const itemFobUSD = it.unitPriceUSD * it.quantity;
    const itemFobGBP = itemFobUSD / rate;

    let shareRatio = 0;
    if (payload.costAllocationMethod === 'weight') {
      shareRatio = (it.weightKgTotal || 0) / totalWeight;
    } else if (payload.costAllocationMethod === 'value') {
      shareRatio = itemFobUSD / totalFobUSD;
    } else {
      // Default: CBM (volume-based)
      shareRatio = (it.cbmTotal || 0) / totalCBM;
    }

    const allocatedFeesGBP = totalFeesGBP * shareRatio;
    const itemLandedTotalGBP = itemFobGBP + allocatedFeesGBP;
    const itemUnitLandedGBP = it.quantity > 0 ? itemLandedTotalGBP / it.quantity : 0;

    totalLandedGBP += itemLandedTotalGBP;

    return {
      ...it,
      totalFOBUSD: Number(itemFobUSD.toFixed(2)),
      allocatedFreightAndFeesGBP: Number(allocatedFeesGBP.toFixed(2)),
      totalLandedGBP: Number(itemLandedTotalGBP.toFixed(2)),
      unitLandedGBP: Number(itemUnitLandedGBP.toFixed(4)),
    };
  });

  return {
    rate,
    totalFobUSD: Number(totalFobUSD.toFixed(2)),
    totalFeesGBP: Number(totalFeesGBP.toFixed(2)),
    totalLandedGBP: Number(totalLandedGBP.toFixed(2)),
    items: computedItems
  };
}

// GET all shipments
shipmentsRouter.get('/', (req: Request, res: Response) => {
  try {
    const stmt = db.prepare(`
      SELECT 
        id,
        shipment_ref as shipmentRef,
        container_number as containerNumber,
        supplier_name as supplierName,
        departure_date as departureDate,
        eta_date as etaDate,
        status,
        currency_rate_usd_gbp as currencyRateUSDGBP,
        sea_freight_usd as seaFreightUSD,
        uk_customs_duty_gbp as ukCustomsDutyGBP,
        uk_port_handling_gbp as ukPortHandlingGBP,
        uk_inland_haulage_gbp as ukInlandHaulageGBP,
        unloading_labor_gbp as unloadingLaborGBP,
        cost_allocation_method as costAllocationMethod,
        total_fob_usd as totalFobUSD,
        total_landed_gbp as totalLandedGBP,
        items_json as itemsJson,
        received_at as receivedAt,
        created_at as createdAt
      FROM shipments
      ORDER BY created_at DESC
    `);
    const rows = stmt.all() as any[];
    const parsed = rows.map(r => ({
      ...r,
      items: JSON.parse(r.itemsJson || '[]')
    }));
    res.json(parsed);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST create or calculate shipment
shipmentsRouter.post('/', (req: Request, res: Response) => {
  try {
    const {
      shipmentRef, containerNumber, supplierName, departureDate, etaDate,
      status = 'on_water', currencyRateUSDGBP = 1.28, seaFreightUSD = 0,
      ukCustomsDutyGBP = 0, ukPortHandlingGBP = 0, ukInlandHaulageGBP = 0,
      unloadingLaborGBP = 0, costAllocationMethod = 'cbm', items = []
    } = req.body;

    const calc = calculateShipmentLandedCosts({
      currencyRateUSDGBP,
      seaFreightUSD,
      ukCustomsDutyGBP,
      ukPortHandlingGBP,
      ukInlandHaulageGBP,
      unloadingLaborGBP,
      costAllocationMethod,
      items
    });

    const id = `shp-${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO shipments (
        id, shipment_ref, container_number, supplier_name, departure_date, eta_date,
        status, currency_rate_usd_gbp, sea_freight_usd, uk_customs_duty_gbp,
        uk_port_handling_gbp, uk_inland_haulage_gbp, unloading_labor_gbp,
        cost_allocation_method, total_fob_usd, total_landed_gbp, items_json,
        received_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      shipmentRef || `SHP-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
      containerNumber || 'TBD',
      supplierName || 'China Supplier',
      departureDate,
      etaDate,
      status,
      currencyRateUSDGBP,
      seaFreightUSD,
      ukCustomsDutyGBP,
      ukPortHandlingGBP,
      ukInlandHaulageGBP,
      unloadingLaborGBP,
      costAllocationMethod,
      calc.totalFobUSD,
      calc.totalLandedGBP,
      JSON.stringify(calc.items),
      null,
      now
    );

    res.status(201).json({ id, message: 'Shipment created and landed cost calculated', calc });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST receive shipment into warehouse (increases inventory stock & updates landed cost)
shipmentsRouter.post('/:id/receive', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const stmt = db.prepare('SELECT * FROM shipments WHERE id = ?');
    const shipment = stmt.get(id) as any;

    if (!shipment) {
      return res.status(404).json({ error: 'Shipment not found' });
    }

    if (shipment.status === 'received_warehouse') {
      return res.status(400).json({ error: 'Shipment has already been received into warehouse' });
    }

    const items = JSON.parse(shipment.items_json || '[]');
    const now = new Date().toISOString();

    for (const item of items) {
      const getItem = db.prepare('SELECT * FROM inventory_items WHERE id = ? OR sku = ?');
      const invItem = getItem.get(item.itemId || '', item.sku || '') as any;

      if (invItem) {
        const oldStock = invItem.current_stock;
        const addStock = item.quantity;
        const newStock = oldStock + addStock;

        // Calculate Weighted Average Cost (WAC)
        const oldValuation = oldStock * (invItem.landed_cost_per_unit || invItem.cost_per_unit || 0);
        const newValuation = item.totalLandedGBP || (addStock * (item.unitLandedGBP || 0));
        const newLandedWAC = newStock > 0 ? (oldValuation + newValuation) / newStock : item.unitLandedGBP;

        // Update inventory record
        db.prepare(`
          UPDATE inventory_items SET
            current_stock = ?,
            landed_cost_per_unit = ?,
            cost_per_unit = ?,
            last_restocked_at = ?,
            updated_at = ?
          WHERE id = ?
        `).run(
          newStock,
          Number(newLandedWAC.toFixed(4)),
          Number((item.unitPriceUSD / shipment.currency_rate_usd_gbp).toFixed(4)),
          now,
          now,
          invItem.id
        );

        // Record stock movement
        db.prepare(`
          INSERT INTO stock_movements (
            id, item_id, sku, item_name, movement_type, quantity_delta,
            resulting_stock, unit_cost, reference_id, operator_name, notes, created_at
          ) VALUES (?, ?, ?, ?, 'purchase_received', ?, ?, ?, ?, 'Warehouse Goods In', ?, ?)
        `).run(
          `mov-${crypto.randomUUID().slice(0, 8)}`,
          invItem.id,
          invItem.sku,
          invItem.name,
          addStock,
          newStock,
          Number(item.unitLandedGBP.toFixed(4)),
          shipment.shipment_ref,
          `Received from Container ${shipment.container_number} (${item.quantity} units @ £${item.unitLandedGBP.toFixed(2)} landed cost)`,
          now
        );
      }
    }

    // Mark shipment as received
    db.prepare('UPDATE shipments SET status = ?, received_at = ? WHERE id = ?')
      .run('received_warehouse', now, id);

    res.json({
      success: true,
      message: `Shipment ${shipment.shipment_ref} received into warehouse. Inventory stock and landed cost updated!`
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
