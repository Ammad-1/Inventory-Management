import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';

const dbPath = path.resolve(process.cwd(), 'smartprint.db');
export const db = new DatabaseSync(dbPath);

// Enable WAL mode for better concurrency and performance
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

export function initDatabase() {
  // 1. Inventory items table
  db.exec(`
    CREATE TABLE IF NOT EXISTS inventory_items (
      id TEXT PRIMARY KEY,
      sku TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('blank', 'packaging', 'consumable')),
      unit TEXT NOT NULL DEFAULT 'pcs',
      current_stock INTEGER NOT NULL DEFAULT 0,
      reserved_stock INTEGER NOT NULL DEFAULT 0,
      min_safety_stock INTEGER NOT NULL DEFAULT 0,
      reorder_point INTEGER NOT NULL DEFAULT 0,
      lead_time_days INTEGER NOT NULL DEFAULT 30,
      fob_cost_usd REAL NOT NULL DEFAULT 0,
      cost_per_unit REAL NOT NULL DEFAULT 0,
      landed_cost_per_unit REAL NOT NULL DEFAULT 0,
      cbm_per_unit REAL NOT NULL DEFAULT 0,
      weight_kg_per_unit REAL NOT NULL DEFAULT 0,
      location TEXT NOT NULL DEFAULT 'Warehouse',
      supplier_name TEXT NOT NULL DEFAULT 'Local Supplier',
      barcode TEXT,
      daily_burn_rate REAL NOT NULL DEFAULT 0,
      last_restocked_at TEXT,
      updated_at TEXT NOT NULL
    );
  `);

  // 2. BOM Recipes table
  db.exec(`
    CREATE TABLE IF NOT EXISTS recipes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      blank_item_id TEXT NOT NULL,
      packaging_item_id TEXT,
      consumables_cost REAL NOT NULL DEFAULT 0.05,
      scrap_rate_percent REAL NOT NULL DEFAULT 2.5,
      target_sell_price REAL NOT NULL DEFAULT 0,
      notes TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (blank_item_id) REFERENCES inventory_items(id)
    );
  `);

  // 3. Inbound Shipments table
  db.exec(`
    CREATE TABLE IF NOT EXISTS shipments (
      id TEXT PRIMARY KEY,
      shipment_ref TEXT UNIQUE NOT NULL,
      container_number TEXT NOT NULL,
      supplier_name TEXT NOT NULL,
      departure_date TEXT,
      eta_date TEXT,
      status TEXT NOT NULL CHECK(status IN ('ordered', 'on_water', 'customs_clearance', 'received_warehouse', 'cancelled')),
      currency_rate_usd_gbp REAL NOT NULL DEFAULT 1.28,
      sea_freight_usd REAL NOT NULL DEFAULT 0,
      uk_customs_duty_gbp REAL NOT NULL DEFAULT 0,
      uk_port_handling_gbp REAL NOT NULL DEFAULT 0,
      uk_inland_haulage_gbp REAL NOT NULL DEFAULT 0,
      unloading_labor_gbp REAL NOT NULL DEFAULT 0,
      cost_allocation_method TEXT NOT NULL DEFAULT 'cbm' CHECK(cost_allocation_method IN ('cbm', 'weight', 'value')),
      total_fob_usd REAL NOT NULL DEFAULT 0,
      total_landed_gbp REAL NOT NULL DEFAULT 0,
      items_json TEXT NOT NULL, -- JSON array of items and their allocated costs
      received_at TEXT,
      created_at TEXT NOT NULL
    );
  `);

  // 4. Xero Invoices table
  // `type` is constrained to ACCREC so an ACCPAY supplier bill cannot be
  // stored here at all. This table drives stock deduction, and deducting
  // stock for a bill we received would be wrong in both directions.
  db.exec(`
    CREATE TABLE IF NOT EXISTS xero_invoices (
      id TEXT PRIMARY KEY,
      invoice_number TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL DEFAULT 'ACCREC' CHECK(type = 'ACCREC'),
      customer_name TEXT NOT NULL,
      invoice_date TEXT NOT NULL,
      due_date TEXT,
      total_amount REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'GBP',
      status TEXT NOT NULL DEFAULT 'AUTHORISED',
      line_items_json TEXT NOT NULL, -- JSON array of lines, matched items, and quantities
      stock_deducted INTEGER NOT NULL DEFAULT 0, -- 0 = pending, 1 = deducted
      deducted_at TEXT,
      created_at TEXT NOT NULL
    );
  `);

  // Add the ACCREC-only `type` column to pre-existing xero_invoices tables.
  // SQLite cannot add a CHECK constraint via ALTER, so the table is rebuilt.
  try {
    const cols = db.prepare("PRAGMA table_info(xero_invoices)").all() as any[];
    if (cols.length > 0 && !cols.some(c => c.name === 'type')) {
      db.exec(`
        PRAGMA foreign_keys = OFF;
        ALTER TABLE xero_invoices RENAME TO xero_invoices_old;
        CREATE TABLE xero_invoices (
          id TEXT PRIMARY KEY,
          invoice_number TEXT UNIQUE NOT NULL,
          type TEXT NOT NULL DEFAULT 'ACCREC' CHECK(type = 'ACCREC'),
          customer_name TEXT NOT NULL,
          invoice_date TEXT NOT NULL,
          due_date TEXT,
          total_amount REAL NOT NULL DEFAULT 0,
          currency TEXT NOT NULL DEFAULT 'GBP',
          status TEXT NOT NULL DEFAULT 'AUTHORISED',
          line_items_json TEXT NOT NULL,
          stock_deducted INTEGER NOT NULL DEFAULT 0,
          deducted_at TEXT,
          created_at TEXT NOT NULL
        );
        INSERT INTO xero_invoices (
          id, invoice_number, type, customer_name, invoice_date, due_date,
          total_amount, currency, status, line_items_json, stock_deducted,
          deducted_at, created_at
        )
        SELECT
          id, invoice_number, 'ACCREC', customer_name, invoice_date, due_date,
          total_amount, currency, status, line_items_json, stock_deducted,
          deducted_at, created_at
        FROM xero_invoices_old;
        DROP TABLE xero_invoices_old;
        PRAGMA foreign_keys = ON;
      `);
      console.log('[Database] Added ACCREC-only type column to xero_invoices');
    }
  } catch (err) {
    console.error('[Database] xero_invoices type migration failed:', err);
  }

  // 4b. Reference data mirrored from Xero so invoice building is offline-fast.
  // Refreshed on demand; never edited locally.
  db.exec(`
    CREATE TABLE IF NOT EXISTS xero_contacts (
      contact_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      is_customer INTEGER NOT NULL DEFAULT 1,
      default_account_code TEXT,
      tax_number TEXT,
      updated_at TEXT NOT NULL
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS xero_accounts (
      account_id TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      type TEXT,
      tax_type TEXT,
      class TEXT,
      status TEXT,
      updated_at TEXT NOT NULL
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS xero_tax_rates (
      tax_type TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      rate REAL NOT NULL DEFAULT 0,
      status TEXT,
      can_apply_to_revenue INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );
  `);

  // 4c. How an invoice line description is composed from the order fields.
  // Stored as a token template so the wording can change without a deploy.
  db.exec(`
    CREATE TABLE IF NOT EXISTS invoice_settings (
      id TEXT PRIMARY KEY,
      description_template TEXT NOT NULL,
      shipping_template TEXT NOT NULL,
      default_account_code TEXT,
      default_tax_type TEXT,
      default_due_days INTEGER NOT NULL DEFAULT 30,
      line_amount_types TEXT NOT NULL DEFAULT 'Exclusive',
      updated_at TEXT NOT NULL
    );
  `);

  // Seed the template from the wording already used on PrintBerry invoices
  const settingsCount = db.prepare('SELECT COUNT(*) as count FROM invoice_settings').get() as { count: number };
  if (settingsCount.count === 0) {
    db.prepare(`
      INSERT INTO invoice_settings (
        id, description_template, shipping_template, default_account_code,
        default_tax_type, default_due_days, line_amount_types, updated_at
      ) VALUES ('primary', ?, ?, null, null, 30, 'Exclusive', ?)
    `).run(
      'PO : {poNumber} (PO Order {orderNumber}) Sales Rep: {salesRep} {productDescription}',
      'Shipped with {carrier} - {trackingNumber}',
      new Date().toISOString()
    );
  }

  // Invoices and orders must carry the tax split. Margin computed against a
  // VAT-inclusive total overstates both profit and margin: on a 3,000 invoice
  // at 20% VAT, 500 of that is HMRC's, not revenue.
  for (const [table, cols] of [
    ['xero_invoices', ['sub_total', 'total_tax']],
    ['ecommerce_orders', ['sub_total', 'total_tax']]
  ] as [string, string[]][]) {
    try {
      const have = new Set((db.prepare(`PRAGMA table_info(${table})`).all() as any[]).map(c => c.name));
      for (const col of cols) {
        if (!have.has(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} REAL;`);
      }
    } catch (err) {
      console.warn(`[Database] ${table} tax column check note:`, err);
    }
  }

  // 5. Learned Mapping Rules for freeform Xero invoice text
  db.exec(`
    CREATE TABLE IF NOT EXISTS xero_mappings (
      id TEXT PRIMARY KEY,
      keyword_phrase TEXT UNIQUE NOT NULL,
      recipe_id TEXT,
      blank_item_id TEXT,
      packaging_item_id TEXT,
      confidence TEXT NOT NULL DEFAULT 'manual',
      created_at TEXT NOT NULL
    );
  `);

  // 6. E-Commerce Orders table (Shopify, Amazon, eBay, TikTok)
  db.exec(`
    CREATE TABLE IF NOT EXISTS ecommerce_orders (
      id TEXT PRIMARY KEY,
      order_number TEXT UNIQUE NOT NULL,
      platform TEXT NOT NULL CHECK(platform IN ('shopify', 'amazon', 'ebay', 'tiktok')),
      customer_name TEXT NOT NULL,
      order_date TEXT NOT NULL,
      total_amount REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'GBP',
      status TEXT NOT NULL DEFAULT 'paid',
      items_json TEXT NOT NULL,
      stock_deducted INTEGER NOT NULL DEFAULT 1,
      deducted_at TEXT,
      total_landed_cost REAL NOT NULL DEFAULT 0,
      gross_profit REAL NOT NULL DEFAULT 0,
      margin_percent REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);

  // 6b. Shopify connection + SKU mapping
  db.exec(`
    CREATE TABLE IF NOT EXISTS shopify_settings (
      id TEXT PRIMARY KEY,
      shop_domain TEXT,
      -- Dev Dashboard app credentials. Admin-created custom apps (permanent
      -- shpat_ tokens) can no longer be created, so we exchange these for a
      -- 24-hour token. The secret also keys webhook HMAC verification.
      client_id TEXT,
      client_secret TEXT,
      access_token TEXT,
      token_expires_at TEXT,
      api_version TEXT NOT NULL DEFAULT '2026-07',
      auto_deduct INTEGER NOT NULL DEFAULT 0,
      webhook_ids TEXT,
      shop_name TEXT,
      connected_at TEXT,
      last_synced_at TEXT,
      updated_at TEXT
    );
  `);

  // Add the Dev Dashboard credential columns to an earlier shopify_settings
  try {
    const cols = db.prepare("PRAGMA table_info(shopify_settings)").all() as any[];
    const have = new Set(cols.map(c => c.name));
    for (const [col, ddl] of [
      ['client_id', 'ALTER TABLE shopify_settings ADD COLUMN client_id TEXT;'],
      ['client_secret', 'ALTER TABLE shopify_settings ADD COLUMN client_secret TEXT;'],
      ['token_expires_at', 'ALTER TABLE shopify_settings ADD COLUMN token_expires_at TEXT;']
    ] as [string, string][]) {
      if (!have.has(col)) db.exec(ddl);
    }
  } catch (err) {
    console.warn('[Database] shopify_settings column check note:', err);
  }

  // Maps a SKU sold on Shopify to the blank + packaging it consumes.
  // Needed because a storefront SKU (PRT-MUG-11-WHT) is a finished product,
  // not the blank it is printed on (BLANK-MUG-11-WHT).
  db.exec(`
    CREATE TABLE IF NOT EXISTS shopify_sku_map (
      shopify_sku TEXT PRIMARY KEY,
      blank_item_id TEXT,
      packaging_item_id TEXT,
      units_per_sale INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // 7. Stock movements (Immutable audit ledger)
  db.exec(`
    CREATE TABLE IF NOT EXISTS stock_movements (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL,
      sku TEXT NOT NULL,
      item_name TEXT NOT NULL,
      movement_type TEXT NOT NULL CHECK(movement_type IN ('purchase_received', 'xero_sale_deduct', 'ecommerce_sale', 'manual_adjust', 'scrap_defect', 'stocktake')),
      quantity_delta INTEGER NOT NULL,
      resulting_stock INTEGER NOT NULL,
      unit_cost REAL NOT NULL DEFAULT 0,
      reference_id TEXT,
      defect_reason TEXT,
      operator_name TEXT,
      notes TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (item_id) REFERENCES inventory_items(id)
    );
  `);

  // Migrate stock_movements if it exists with older CHECK constraint
  try {
    const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='stock_movements'").get() as { sql: string } | undefined;
    if (tableInfo && !tableInfo.sql.includes('ecommerce_sale')) {
      db.exec(`
        PRAGMA foreign_keys = OFF;
        ALTER TABLE stock_movements RENAME TO stock_movements_old;
        CREATE TABLE stock_movements (
          id TEXT PRIMARY KEY,
          item_id TEXT NOT NULL,
          sku TEXT NOT NULL,
          item_name TEXT NOT NULL,
          movement_type TEXT NOT NULL CHECK(movement_type IN ('purchase_received', 'xero_sale_deduct', 'ecommerce_sale', 'manual_adjust', 'scrap_defect', 'stocktake')),
          quantity_delta INTEGER NOT NULL,
          resulting_stock INTEGER NOT NULL,
          unit_cost REAL NOT NULL DEFAULT 0,
          reference_id TEXT,
          defect_reason TEXT,
          operator_name TEXT,
          notes TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY (item_id) REFERENCES inventory_items(id)
        );
        INSERT INTO stock_movements SELECT * FROM stock_movements_old;
        DROP TABLE stock_movements_old;
        PRAGMA foreign_keys = ON;
      `);
      console.log('[Database] Migrated stock_movements table to support ecommerce_sale');
    }
  } catch (err) {
    console.warn('[Database] stock_movements migration note:', err);
  }

  // 9. Xero OAuth 2.0 Credentials and Access Tokens
  db.exec(`
    CREATE TABLE IF NOT EXISTS xero_oauth_settings (
      id TEXT PRIMARY KEY,
      client_id TEXT,
      client_secret TEXT,
      redirect_uri TEXT DEFAULT 'http://localhost:5000/api/xero/callback',
      access_token TEXT,
      refresh_token TEXT,
      token_expires_at TEXT,
      tenant_id TEXT,
      tenant_name TEXT,
      connected_at TEXT,
      updated_at TEXT
    );
  `);

  try {
    const cols = db.prepare("PRAGMA table_info(xero_oauth_settings)").all() as any[];
    if (!cols.some(c => c.name === 'redirect_uri')) {
      db.exec("ALTER TABLE xero_oauth_settings ADD COLUMN redirect_uri TEXT DEFAULT 'http://localhost:5000/api/xero/callback';");
    }
  } catch (err) {
    console.warn('[Database] redirect_uri column check note:', err);
  }

  // Check if inventory has records; if not, seed base item templates with 0 stock
  const countStmt = db.prepare('SELECT COUNT(*) as count FROM inventory_items');
  const countRow = countStmt.get() as { count: number };

  if (countRow.count === 0) {
    seedInitialData();
  }
}

export function cleanDatabaseForProduction() {
  db.exec('BEGIN');
  try {
    db.exec('DELETE FROM xero_invoices;');
    db.exec('DELETE FROM ecommerce_orders;');
    db.exec('DELETE FROM stock_movements;');
    db.exec('DELETE FROM shipments;');
    db.exec("UPDATE inventory_items SET current_stock = 0, reserved_stock = 0, updated_at = datetime('now');");
    db.exec('COMMIT');
    console.log('[Database] Production Clean Slate: all dummy invoices, orders, shipments, and movements wiped. Stock reset to 0.');
    return true;
  } catch (err) {
    db.exec('ROLLBACK');
    console.error('[Database] Error wiping dummy data:', err);
    return false;
  }
}

function seedInitialData() {
  const now = new Date().toISOString();

  // Insert Inventory templates with 0 initial physical stock
  const insertItem = db.prepare(`
    INSERT INTO inventory_items (
      id, sku, name, category, unit, current_stock, reserved_stock,
      min_safety_stock, reorder_point, lead_time_days, fob_cost_usd,
      cost_per_unit, landed_cost_per_unit, cbm_per_unit, weight_kg_per_unit,
      location, supplier_name, barcode, daily_burn_rate, last_restocked_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const initialItems = [
    // Blanks (starting at 0 physical stock)
    ['item-001', 'BLANK-MUG-11-WHT', '11oz Durham/Cambridge Ceramic Mug - Gloss White', 'blank', 'pcs', 0, 0, 3000, 5000, 45, 0.44, 0.35, 0.58, 0.0016, 0.35, 'Warehouse Bay 1 - Aisle A', 'Zibo High-Tech Ceramics (China)', '506019283001', 0, null, now],
    ['item-002', 'BLANK-MUG-11-BLK', '11oz Ceramic Mug - Gloss Black Interior/Exterior', 'blank', 'pcs', 0, 0, 1000, 1500, 45, 0.52, 0.41, 0.69, 0.0016, 0.35, 'Warehouse Bay 1 - Aisle B', 'Zibo High-Tech Ceramics (China)', '506019283002', 0, null, now],
    ['item-003', 'BLANK-MUG-15-WHT', '15oz Jumbo Ceramic Mug - Gloss White', 'blank', 'pcs', 0, 0, 600, 1000, 45, 0.62, 0.49, 0.82, 0.0022, 0.48, 'Warehouse Bay 1 - Aisle C', 'Zibo High-Tech Ceramics (China)', '506019283003', 0, null, now],
    ['item-004', 'BAG-TOTE-CANVAS-NAT', 'Natural Cotton Canvas Tote Bag (5oz Eco)', 'blank', 'pcs', 0, 0, 1500, 2500, 35, 0.78, 0.61, 0.92, 0.0004, 0.09, 'Warehouse Bay 2 - Shelf 1', 'Zhejiang Textile Co. (China)', '506019283004', 0, null, now],
    ['item-005', 'BAG-TOTE-CANVAS-BLK', 'Heavyweight Canvas Shopper 10oz - Black', 'blank', 'pcs', 0, 0, 500, 800, 35, 1.40, 1.10, 1.65, 0.0006, 0.18, 'Warehouse Bay 2 - Shelf 2', 'Zhejiang Textile Co. (China)', '506019283005', 0, null, now],
    ['item-006', 'BTL-ALU-500-SLV', '500ml Aluminium Sports Bottle with Carabiner', 'blank', 'pcs', 0, 0, 800, 1200, 40, 1.15, 0.90, 1.42, 0.0012, 0.12, 'Warehouse Bay 2 - Shelf 3', 'Ningbo Drinkware Ltd (China)', '506019283006', 0, null, now],
    
    // Packaging (UK local purchasing)
    ['item-007', 'BOX-MUG-SMASH-1', '1-Pack White Smashproof Corrugated Mug Mailer', 'packaging', 'pcs', 0, 0, 2500, 4000, 3, 0, 0.24, 0.24, 0.0018, 0.06, 'Packing Bay 1', 'UK Packaging Direct', '506019283007', 0, null, now],
    ['item-008', 'BOX-MUG-CARTON-36', 'Master Outer Carton (Holds 36 Mugs with Egg Divider)', 'packaging', 'carton', 0, 0, 80, 120, 4, 0, 1.85, 1.85, 0.065, 0.85, 'Packing Bay 2', 'UK Packaging Direct', '506019283008', 0, null, now],
    ['item-009', 'BOX-POLY-MAILER-MED', 'Grey 100% Recycled Poly Mailer Bag 10x14 inch', 'packaging', 'pcs', 0, 0, 1000, 2000, 2, 0, 0.08, 0.08, 0.0001, 0.015, 'Packing Bay 3', 'UK Packaging Direct', '506019283009', 0, null, now],
    
    // Consumables
    ['item-010', 'INK-SUB-BLK-1L', 'Sublimation Ink Bottle - Black (1 Litre)', 'consumable', 'bottle', 0, 0, 4, 6, 2, 0, 28.50, 28.50, 0.0015, 1.10, 'Ink Store Cabinet A', 'Sawgrass UK Distribution', '506019283010', 0, null, now],
    ['item-011', 'PPR-SUB-A4-100', 'High Release Sublimation Paper Pack A4 (100 Sheets)', 'consumable', 'pack', 0, 0, 10, 20, 2, 0, 12.00, 12.00, 0.001, 0.80, 'Ink Store Cabinet B', 'UK Consumables Ltd', '506019283011', 0, null, now],
  ];

  for (const item of initialItems) {
    insertItem.run(...item);
  }

  // Insert Recipes (BOM)
  const insertRecipe = db.prepare(`
    INSERT INTO recipes (
      id, name, code, blank_item_id, packaging_item_id,
      consumables_cost, scrap_rate_percent, target_sell_price, notes, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const initialRecipes = [
    ['bom-001', 'Printed 11oz Cambridge Mug (Single Box)', 'RECIPE-MUG-11-SGL', 'item-001', 'item-007', 0.05, 2.5, 3.60, '1x Blank 11oz White Mug + 1x Smashproof Mailer Box + Sublimation Print Allowance', now],
    ['bom-002', 'Printed Natural Cotton Canvas Tote Bag', 'RECIPE-TOTE-NAT', 'item-004', 'item-009', 0.10, 2.0, 4.95, '1x Blank Natural Tote + 1x Recycled Poly Mailer + Screen/DTF Ink Allowance', now],
    ['bom-003', 'Printed 500ml Aluminium Sports Bottle', 'RECIPE-BTL-500', 'item-006', 'item-009', 0.08, 1.5, 6.50, '1x Blank 500ml Silver Bottle + 1x Mailer Box/Bag + Laser/Sublimation Allowance', now],
    ['bom-004', 'Printed 11oz Black Mug (Single Box)', 'RECIPE-MUG-11-BLK', 'item-002', 'item-007', 0.06, 2.5, 4.20, '1x Blank 11oz Black Mug + 1x Smashproof Mailer Box', now],
  ];

  for (const recipe of initialRecipes) {
    insertRecipe.run(...recipe);
  }

  // Insert Mappings for Xero Free-Text parsing
  const insertMapping = db.prepare(`
    INSERT INTO xero_mappings (id, keyword_phrase, recipe_id, blank_item_id, packaging_item_id, confidence, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const initialMappings = [
    ['map-001', '11oz white cambridge', 'bom-001', 'item-001', 'item-007', 'exact', now],
    ['map-002', 'white cambridge mug', 'bom-001', 'item-001', 'item-007', 'keyword_high', now],
    ['map-003', '11oz durham mug', 'bom-001', 'item-001', 'item-007', 'keyword_high', now],
    ['map-004', 'natural canvas tote', 'bom-002', 'item-004', 'item-009', 'exact', now],
    ['map-005', 'cotton tote bag', 'bom-002', 'item-004', 'item-009', 'keyword_high', now],
    ['map-006', 'aluminium sports bottle', 'bom-003', 'item-006', 'item-009', 'exact', now],
    ['map-007', 'black cambridge mug', 'bom-004', 'item-002', 'item-007', 'keyword_high', now],
  ];

  for (const mapping of initialMappings) {
    insertMapping.run(...mapping);
  }
}
