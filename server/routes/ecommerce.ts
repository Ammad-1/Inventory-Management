import { Router, Request, Response } from 'express';
import { db } from '../db';
import crypto from 'node:crypto';

export const ecommerceRouter = Router();

// GET all connected / simulated channels
ecommerceRouter.get('/channels', (req: Request, res: Response) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    
    // Calculate stats per platform from db
    const statsStmt = db.prepare(`
      SELECT 
        platform,
        COUNT(*) as order_count,
        COALESCE(SUM(total_amount), 0) as total_rev
      FROM ecommerce_orders
      WHERE date(created_at) = date('now')
      GROUP BY platform
    `);
    const stats = statsStmt.all() as { platform: string; order_count: number; total_rev: number }[];
    const statsMap: Record<string, { count: number; rev: number }> = {};
    stats.forEach(s => {
      statsMap[s.platform] = { count: s.order_count, rev: s.total_rev };
    });

    // Recent orders timestamp
    const lastOrderStmt = db.prepare(`
      SELECT platform, created_at FROM ecommerce_orders ORDER BY created_at DESC
    `);
    const allRecent = lastOrderStmt.all() as { platform: string; created_at: string }[];
    const lastOrderMap: Record<string, string> = {};
    allRecent.forEach(r => {
      if (!lastOrderMap[r.platform]) {
        lastOrderMap[r.platform] = r.created_at;
      }
    });

    // Only Shopify is a real integration. The others are declared as
    // not-connected rather than dressed up with invented order counts.
    const shopifyRow = db.prepare("SELECT shop_domain, shop_name FROM shopify_settings WHERE id = 'primary'").get() as any;
    const shopifyConnected = !!(shopifyRow?.shop_domain);

    const channels = [
      {
        id: 'shopify',
        name: shopifyRow?.shop_name ? `Shopify — ${shopifyRow.shop_name}` : 'Shopify',
        connected: shopifyConnected,
        storeIdentifier: shopifyRow?.shop_domain || 'Not connected',
        webhookUrl: '/api/shopify/webhook',
        ordersToday: statsMap['shopify']?.count || 0,
        revenueTodayGBP: Number((statsMap['shopify']?.rev || 0).toFixed(2)),
        lastOrderAt: lastOrderMap['shopify'] || undefined
      },
      {
        id: 'amazon',
        name: 'Amazon UK Marketplace',
        connected: false,
        storeIdentifier: 'Not connected — SP-API integration not built',
        webhookUrl: '/api/ecommerce/webhook/amazon',
        ordersToday: statsMap['amazon']?.count || 0,
        revenueTodayGBP: Number((statsMap['amazon']?.rev || 0).toFixed(2)),
        lastOrderAt: lastOrderMap['amazon'] || undefined
      },
      {
        id: 'ebay',
        name: 'eBay UK Store',
        connected: false,
        storeIdentifier: 'Not connected — Notification API integration not built',
        webhookUrl: '/api/ecommerce/webhook/ebay',
        ordersToday: statsMap['ebay']?.count || 0,
        revenueTodayGBP: Number((statsMap['ebay']?.rev || 0).toFixed(2)),
        lastOrderAt: lastOrderMap['ebay'] || undefined
      },
      {
        id: 'tiktok',
        name: 'TikTok Shop UK',
        connected: false,
        storeIdentifier: 'Not connected — Partner API integration not built',
        webhookUrl: '/api/ecommerce/webhook/tiktok',
        ordersToday: statsMap['tiktok']?.count || 0,
        revenueTodayGBP: Number((statsMap['tiktok']?.rev || 0).toFixed(2)),
        lastOrderAt: lastOrderMap['tiktok'] || undefined
      }
    ];

    res.json(channels);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET all eCommerce orders
ecommerceRouter.get('/orders', (req: Request, res: Response) => {
  try {
    const ordersStmt = db.prepare('SELECT * FROM ecommerce_orders ORDER BY created_at DESC LIMIT 100');
    const rows = ordersStmt.all() as any[];

    const orders = rows.map(r => {
      let items = [];
      try {
        items = typeof r.items_json === 'string' ? JSON.parse(r.items_json) : (r.items_json || []);
      } catch (e) {
        items = [];
      }

      return {
        id: r.id,
        orderNumber: r.order_number,
        platform: r.platform,
        storeName: r.store_name,
        externalOrderId: r.external_order_id,
        orderStatus: r.order_status,
        subTotal: r.sub_total,
        totalTax: r.total_tax,
        shippingAmount: r.shipping_amount,
        customerName: r.customer_name,
        orderDate: r.order_date,
        totalAmount: r.total_amount,
        currency: r.currency || 'GBP',
        status: r.status,
        items,
        stockDeducted: r.stock_deducted,
        deductedAt: r.deducted_at,
        totalLandedCost: r.total_landed_cost,
        grossProfit: r.gross_profit,
        marginPercent: r.margin_percent,
        createdAt: r.created_at
      };
    });

    res.json(orders);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Helper to determine BOM components for common eCommerce products
function explodeEcommerceBOM(skuOrTitle: string): {
  blankItemId: string;
  blankSku: string;
  blankName: string;
  boxItemId: string;
  boxSku: string;
  boxName: string;
} {
  const lower = skuOrTitle.toLowerCase();

  // Mugs
  if (lower.includes('black') && lower.includes('mug')) {
    return {
      blankItemId: 'item-002',
      blankSku: 'BLANK-MUG-11-BLK',
      blankName: '11oz Cambridge Ceramic Mug - Matte Black',
      boxItemId: 'item-007',
      boxSku: 'BOX-MUG-SMASH-1',
      boxName: '1-Pack White Smashproof Corrugated Box'
    };
  }
  if (lower.includes('mug') || lower.includes('ceramic') || lower.includes('cambridge')) {
    return {
      blankItemId: 'item-001',
      blankSku: 'BLANK-MUG-11-WHT',
      blankName: '11oz Durham/Cambridge Ceramic Mug',
      boxItemId: 'item-007',
      boxSku: 'BOX-MUG-SMASH-1',
      boxName: '1-Pack White Smashproof Corrugated Box'
    };
  }

  // Tote bags
  if (lower.includes('tote') || lower.includes('bag') || lower.includes('canvas')) {
    return {
      blankItemId: 'item-004',
      blankSku: 'BLANK-TOTE-CANV',
      blankName: '100% Cotton Canvas Tote Bag 140gsm',
      boxItemId: 'item-009',
      boxSku: 'PKG-POLY-MAILER',
      boxName: 'Heavy Duty Grey Poly Mailer Bags 10x14"'
    };
  }

  // Bottles
  if (lower.includes('bottle') || lower.includes('water')) {
    return {
      blankItemId: 'item-006',
      blankSku: 'BLANK-BOT-500-SIL',
      blankName: '500ml Insulated Water Bottle - Silver',
      boxItemId: 'item-009',
      boxSku: 'PKG-POLY-MAILER',
      boxName: 'Heavy Duty Grey Poly Mailer Bags 10x14"'
    };
  }

  // Default fallback to 11oz white mug
  return {
    blankItemId: 'item-001',
    blankSku: 'BLANK-MUG-11-WHT',
    blankName: '11oz Durham/Cambridge Ceramic Mug',
    boxItemId: 'item-007',
    boxSku: 'BOX-MUG-SMASH-1',
    boxName: '1-Pack White Smashproof Corrugated Box'
  };
}

// POST simulate an eCommerce store order and deduct stock
ecommerceRouter.post('/simulate', (req: Request, res: Response) => {
  try {
    const { platform = 'shopify', customerName, productType, quantity = 1, unitPrice } = req.body;
    
    // Choose product preset
    let title = 'Personalized 11oz Cambridge Ceramic Mug (Custom Photo)';
    let defaultPrice = 8.99;
    let skuSold = 'PRT-MUG-11-WHT';

    if (productType === 'black_mug') {
      title = 'Matte Black 11oz Ceramic Mug (Gold Monogram)';
      defaultPrice = 9.99;
      skuSold = 'PRT-MUG-11-BLK';
    } else if (productType === 'tote_bag') {
      title = 'Custom Printed Natural Cotton Canvas Tote Bag';
      defaultPrice = 7.50;
      skuSold = 'PRT-TOTE-NAT';
    } else if (productType === 'water_bottle') {
      title = 'Laser Engraved 500ml Insulated Water Bottle - Silver';
      defaultPrice = 14.50;
      skuSold = 'PRT-BOT-500-SIL';
    } else if (req.body.productTitle) {
      title = req.body.productTitle;
      skuSold = req.body.skuSold || 'PRT-CUSTOM-01';
    }

    const price = Number(unitPrice || defaultPrice);
    const qty = Math.max(1, parseInt(quantity, 10) || 1);
    const totalRevenue = Number((price * qty).toFixed(2));

    // Explode BOM
    const bom = explodeEcommerceBOM(title);

    // Fetch Blank & Box details
    const blank = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(bom.blankItemId) as any;
    const box = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(bom.boxItemId) as any;

    if (!blank) {
      return res.status(404).json({ error: `Blank item ${bom.blankItemId} not found in inventory` });
    }
    if (!box) {
      return res.status(404).json({ error: `Packaging item ${bom.boxItemId} not found in inventory` });
    }

    // Check stock
    if (blank.current_stock < qty) {
      return res.status(400).json({ 
        error: `Insufficient stock for ${blank.name}. Available: ${blank.current_stock}, Requested: ${qty}` 
      });
    }

    // Generate Order Number
    const prefix = platform === 'shopify' ? '#SPF' : platform === 'amazon' ? '#AMZ' : platform === 'ebay' ? '#EBAY' : '#ORD';
    const randNum = Math.floor(10000 + Math.random() * 90000);
    const orderNumber = `${prefix}-${randNum}`;
    const orderId = `ecom-${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    const blankLanded = Number(blank.landed_cost_per_unit || blank.cost_per_unit || 0.75);
    const boxCost = Number(box.landed_cost_per_unit || box.cost_per_unit || 0.18);
    const singleUnitLandedCost = Number((blankLanded + boxCost).toFixed(2));
    const totalOrderLandedCost = Number((singleUnitLandedCost * qty).toFixed(2));
    const grossProfit = Number((totalRevenue - totalOrderLandedCost).toFixed(2));
    const marginPercent = Number(((grossProfit / totalRevenue) * 100).toFixed(1));

    const itemDetails = [
      {
        productTitle: title,
        skuSold,
        quantity: qty,
        unitPrice: price,
        matchedBlankId: blank.id,
        matchedBlankSku: blank.sku,
        matchedBlankName: blank.name,
        matchedBoxId: box.id,
        matchedBoxSku: box.sku,
        matchedBoxName: box.name,
        estimatedLandedCost: totalOrderLandedCost,
        grossProfit
      }
    ];

    // Execute atomic deduction in transaction
    db.exec('BEGIN');
    try {
      // 1. Deduct Blank
      const newBlankStock = blank.current_stock - qty;
      db.prepare('UPDATE inventory_items SET current_stock = ?, updated_at = ? WHERE id = ?')
        .run(newBlankStock, now, blank.id);

      db.prepare(`
        INSERT INTO stock_movements (
          id, item_id, sku, item_name, movement_type, quantity_delta, resulting_stock,
          unit_cost, reference_id, operator_name, notes, created_at
        ) VALUES (?, ?, ?, ?, 'ecommerce_sale', ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `mov-${crypto.randomUUID().slice(0, 8)}`,
        blank.id,
        blank.sku,
        blank.name,
        -qty,
        newBlankStock,
        blankLanded,
        orderNumber,
        `${platform.toUpperCase()} Automation`,
        `eCommerce sale on ${platform.toUpperCase()} (${orderNumber}): Deducted ${qty}x ${blank.name}`,
        now
      );

      // 2. Deduct Packaging Box
      const newBoxStock = Math.max(0, box.current_stock - qty);
      db.prepare('UPDATE inventory_items SET current_stock = ?, updated_at = ? WHERE id = ?')
        .run(newBoxStock, now, box.id);

      db.prepare(`
        INSERT INTO stock_movements (
          id, item_id, sku, item_name, movement_type, quantity_delta, resulting_stock,
          unit_cost, reference_id, operator_name, notes, created_at
        ) VALUES (?, ?, ?, ?, 'ecommerce_sale', ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `mov-${crypto.randomUUID().slice(0, 8)}`,
        box.id,
        box.sku,
        box.name,
        -qty,
        newBoxStock,
        boxCost,
        orderNumber,
        `${platform.toUpperCase()} Automation`,
        `Packaging box deducted for eCommerce order ${orderNumber}`,
        now
      );

      // 3. Save order to ecommerce_orders
      db.prepare(`
        INSERT INTO ecommerce_orders (
          id, order_number, platform, customer_name, order_date, total_amount, currency,
          status, items_json, stock_deducted, deducted_at, total_landed_cost, gross_profit, margin_percent, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'GBP', 'paid', ?, 1, ?, ?, ?, ?, ?)
      `).run(
        orderId,
        orderNumber,
        platform,
        customerName || 'Test Customer',
        now.slice(0, 10),
        totalRevenue,
        JSON.stringify(itemDetails),
        now,
        totalOrderLandedCost,
        grossProfit,
        marginPercent,
        now
      );

      db.exec('COMMIT');
    } catch (txErr) {
      db.exec('ROLLBACK');
      throw txErr;
    }

    res.status(201).json({
      success: true,
      orderNumber,
      platform,
      totalAmount: totalRevenue,
      totalLandedCost: totalOrderLandedCost,
      grossProfit,
      marginPercent,
      deductions: [
        {
          item: blank.name,
          sku: blank.sku,
          quantityDeducted: qty,
          remainingStock: blank.current_stock - qty
        },
        {
          item: box.name,
          sku: box.sku,
          quantityDeducted: qty,
          remainingStock: Math.max(0, box.current_stock - qty)
        }
      ],
      message: `Successfully simulated ${platform.toUpperCase()} order ${orderNumber}! Deducted ${qty}x blanks and ${qty}x packaging boxes.`
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Inbound webhook receiver for live or simulated platform webhooks
ecommerceRouter.post('/webhook/:channel', (req: Request, res: Response) => {
  try {
    const { channel } = req.params;
    const rawSignature = req.headers['x-shopify-hmac-sha256'] || req.headers['x-amz-signature'] || req.headers['x-ebay-signature'];
    const payload = req.body;

    console.log(`[eCommerce Webhook] Inbound from ${channel}:`, {
      hasSignature: !!rawSignature,
      payloadSummary: payload?.id || payload?.order_number || 'generic_event'
    });

    // In a live integration, verify HMAC using channel secret:
    // const hmac = crypto.createHmac('sha256', SECRET).update(req.rawBody).digest('base64');
    // if (hmac !== rawSignature) return res.status(401).send('Invalid signature');

    res.status(200).json({
      status: 'acknowledged',
      channel,
      processedAt: new Date().toISOString()
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE an eCommerce order (cleanup test order)
ecommerceRouter.delete('/orders/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    db.prepare('DELETE FROM ecommerce_orders WHERE id = ?').run(id);
    res.json({ success: true, message: 'eCommerce order deleted' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
