import { Router, Request, Response } from 'express';
import { db } from '../db';
import crypto from 'node:crypto';

/**
 * Product catalogue for quoting.
 *
 * A product is a sellable configuration (Mug - White 11oz) with a pricing
 * matrix of decoration type x print area. It points at the blank and
 * packaging it consumes, so a quote prices against real landed cost instead
 * of a figure someone typed in.
 */
export const productsRouter = Router();

/* --------------------------------------------------------------- reference */

productsRouter.get('/reference', (_req: Request, res: Response) => {
  try {
    const categories = db.prepare('SELECT id, name FROM product_categories ORDER BY sort_order').all() as any[];
    const areas = db.prepare(`
      SELECT id, category_id as categoryId, name, image_path as imagePath
      FROM print_areas ORDER BY sort_order
    `).all() as any[];
    const links = db.prepare(`
      SELECT category_id as categoryId, decoration_type_id as decorationTypeId
      FROM category_decoration_types
    `).all() as any[];
    const decorationTypes = db.prepare(
      'SELECT id, name FROM decoration_types WHERE active = 1 ORDER BY sort_order'
    ).all() as any[];

    res.json({
      categories: categories.map(c => ({
        ...c,
        printAreas: areas.filter(a => a.categoryId === c.id),
        // The decorations this category actually offers; empty means all of them
        decorationTypeIds: links.filter(l => l.categoryId === c.id).map(l => l.decorationTypeId)
      })),
      decorationTypes
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/* ---------------------------------------------------------------- products */

const hydrate = (row: any) => {
  const printAreas = db.prepare(`
    SELECT a.id, a.name
    FROM product_print_areas p
    JOIN print_areas a ON a.id = p.print_area_id
    WHERE p.product_id = ?
    ORDER BY a.sort_order
  `).all(row.id);

  const pricing = db.prepare(`
    SELECT pr.id, pr.decoration_type_id as decorationTypeId, d.name as decorationType,
           pr.print_area_id as printAreaId, a.name as printArea,
           pr.setup_cost as setupCost, pr.unit_cost as unitCost,
           pr.min_charge as minCharge, pr.notes, pr.active
    FROM product_pricing pr
    JOIN decoration_types d ON d.id = pr.decoration_type_id
    JOIN print_areas a ON a.id = pr.print_area_id
    WHERE pr.product_id = ?
    ORDER BY d.sort_order, a.sort_order
  `).all(row.id);

  const variants = db.prepare(`
    SELECT id, brand, quality, colour, size,
           base_cost as baseCost, price_adjustment as priceAdjustment, active
    FROM product_variants WHERE product_id = ? ORDER BY brand, quality
  `).all(row.id) as any[];

  const blank = row.blank_item_id
    ? (db.prepare('SELECT sku, name, landed_cost_per_unit as landed, cost_per_unit as cost, current_stock as stock FROM inventory_items WHERE id = ?').get(row.blank_item_id) as any)
    : null;
  const box = row.packaging_item_id
    ? (db.prepare('SELECT sku, landed_cost_per_unit as landed, cost_per_unit as cost FROM inventory_items WHERE id = ?').get(row.packaging_item_id) as any)
    : null;

  // The real cost of the blank + packaging this product consumes
  const stockCost =
    (blank ? blank.landed || blank.cost || 0 : 0) + (box ? box.landed || box.cost || 0 : 0);

  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    description: row.description,
    notes: row.notes,
    categoryId: row.category_id,
    categoryName: row.category_name,
    type: row.type,
    colour: row.colour,
    size: row.size,
    supplierName: row.supplier_name,
    supplierProductLink: row.supplier_product_link,
    imageUrl: row.image_url,
    blankItemId: row.blank_item_id,
    blankSku: blank?.sku || null,
    blankStock: blank?.stock ?? null,
    packagingItemId: row.packaging_item_id,
    packagingSku: box?.sku || null,
    stockCost: Number(stockCost.toFixed(4)),
    active: row.active,
    printAreas,
    pricing,
    variants: variants.map(v => ({ ...v, finalPrice: Number(((v.baseCost || 0) + (v.priceAdjustment || 0)).toFixed(2)) })),
    updatedAt: row.updated_at
  };
};

productsRouter.get('/', (req: Request, res: Response) => {
  try {
    const { search, categoryId } = req.query as Record<string, string>;
    let sql = `
      SELECT p.*, c.name as category_name
      FROM products p LEFT JOIN product_categories c ON c.id = p.category_id
      WHERE 1 = 1
    `;
    const params: any[] = [];
    if (search) {
      sql += ' AND (p.sku LIKE ? OR p.name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    if (categoryId) {
      sql += ' AND p.category_id = ?';
      params.push(categoryId);
    }
    sql += ' ORDER BY p.name ASC';

    res.json((db.prepare(sql).all(...params) as any[]).map(hydrate));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

productsRouter.get('/:id', (req: Request, res: Response) => {
  try {
    const row = db.prepare(`
      SELECT p.*, c.name as category_name
      FROM products p LEFT JOIN product_categories c ON c.id = p.category_id
      WHERE p.id = ?
    `).get(req.params.id) as any;
    if (!row) return res.status(404).json({ error: 'Product not found' });
    res.json(hydrate(row));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** Create or update a product together with its areas, pricing and variants. */
productsRouter.put('/', (req: Request, res: Response) => {
  try {
    const {
      id, sku, name, description, notes, categoryId, type, colour, size,
      supplierName, supplierProductLink, imageUrl,
      blankItemId, packagingItemId,
      printAreaIds = [], pricing = [], variants = []
    } = req.body || {};

    if (!sku || !String(sku).trim()) return res.status(400).json({ error: 'Product SKU is required' });
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Product name is required' });
    if (categoryId && !db.prepare('SELECT 1 FROM product_categories WHERE id = ?').get(categoryId)) {
      return res.status(400).json({ error: 'Unknown category' });
    }
    for (const itemId of [blankItemId, packagingItemId]) {
      if (itemId && !db.prepare('SELECT 1 FROM inventory_items WHERE id = ?').get(itemId)) {
        return res.status(400).json({ error: `Unknown inventory item: ${itemId}` });
      }
    }
    if (supplierProductLink && !/^https?:\/\//i.test(String(supplierProductLink).trim())) {
      return res.status(400).json({ error: 'Supplier product link must start with http:// or https://' });
    }

    const trimmedSku = String(sku).trim().toUpperCase();
    const clash = db.prepare('SELECT id, name FROM products WHERE sku = ? AND id != ?')
      .get(trimmedSku, id || '') as any;
    if (clash) {
      return res.status(409).json({ error: `SKU ${trimmedSku} is already used by "${clash.name}".` });
    }

    for (const [i, p] of (pricing as any[]).entries()) {
      for (const [field, label] of [['setupCost', 'setup cost'], ['unitCost', 'unit cost'], ['minCharge', 'minimum charge']]) {
        const v = Number(p[field] ?? 0);
        if (!Number.isFinite(v) || v < 0) {
          return res.status(400).json({ error: `Pricing row ${i + 1}: ${label} must be zero or more` });
        }
      }
      if (!p.decorationTypeId || !p.printAreaId) {
        return res.status(400).json({ error: `Pricing row ${i + 1}: decoration type and print area are both required` });
      }
    }

    const now = new Date().toISOString();
    const productId = id || `prod-${crypto.randomUUID().slice(0, 8)}`;

    db.exec('BEGIN');
    try {
      db.prepare(`
        INSERT INTO products (
          id, sku, name, description, notes, category_id, type, colour, size,
          supplier_name, supplier_product_link, image_url,
          blank_item_id, packaging_item_id, active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          sku = excluded.sku, name = excluded.name, description = excluded.description,
          notes = excluded.notes, category_id = excluded.category_id, type = excluded.type,
          colour = excluded.colour, size = excluded.size,
          supplier_name = excluded.supplier_name,
          supplier_product_link = excluded.supplier_product_link,
          image_url = excluded.image_url,
          blank_item_id = excluded.blank_item_id,
          packaging_item_id = excluded.packaging_item_id,
          updated_at = excluded.updated_at
      `).run(
        productId, trimmedSku, String(name).trim(), description || null, notes || null,
        categoryId || null, type || null, colour || null, size || null,
        supplierName || null, supplierProductLink || null, imageUrl || null,
        blankItemId || null, packagingItemId || null, now, now
      );

      // These are edited as a whole set, so replace rather than diff
      db.prepare('DELETE FROM product_print_areas WHERE product_id = ?').run(productId);
      const insArea = db.prepare('INSERT OR IGNORE INTO product_print_areas (product_id, print_area_id) VALUES (?, ?)');
      for (const areaId of printAreaIds) insArea.run(productId, areaId);

      db.prepare('DELETE FROM product_pricing WHERE product_id = ?').run(productId);
      const insPrice = db.prepare(`
        INSERT INTO product_pricing (id, product_id, decoration_type_id, print_area_id, setup_cost, unit_cost, min_charge, notes, active, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const p of pricing) {
        insPrice.run(
          `pp-${crypto.randomUUID().slice(0, 8)}`, productId,
          p.decorationTypeId, p.printAreaId,
          Number(p.setupCost) || 0, Number(p.unitCost) || 0, Number(p.minCharge) || 0,
          p.notes || null, p.active === false ? 0 : 1, now
        );
      }

      db.prepare('DELETE FROM product_variants WHERE product_id = ?').run(productId);
      const insVar = db.prepare(`
        INSERT INTO product_variants (id, product_id, brand, quality, colour, size, base_cost, price_adjustment, active, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const v of variants) {
        insVar.run(
          `pv-${crypto.randomUUID().slice(0, 8)}`, productId,
          v.brand || null, v.quality || null, v.colour || null, v.size || null,
          Number(v.baseCost) || 0, Number(v.priceAdjustment) || 0,
          v.active === false ? 0 : 1, now
        );
      }

      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }

    res.json({ success: true, id: productId, message: `${trimmedSku} saved` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

productsRouter.delete('/:id', (req: Request, res: Response) => {
  try {
    const row = db.prepare('SELECT sku FROM products WHERE id = ?').get(req.params.id) as any;
    if (!row) return res.status(404).json({ error: 'Product not found' });

    db.exec('BEGIN');
    try {
      db.prepare('DELETE FROM product_print_areas WHERE product_id = ?').run(req.params.id);
      db.prepare('DELETE FROM product_pricing WHERE product_id = ?').run(req.params.id);
      db.prepare('DELETE FROM product_variants WHERE product_id = ?').run(req.params.id);
      db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    res.json({ success: true, message: `${row.sku} deleted` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Read a supplier page's OpenGraph image.
 *
 * Deliberately not a scraper: it reads the og:image / twitter:image meta tag
 * most retail sites publish for link previews. That is a stable, documented
 * convention, unlike guessing at a supplier's HTML, which breaks whenever
 * they redesign. Where it finds nothing, the operator pastes an image URL.
 */
productsRouter.post('/fetch-image', async (req: Request, res: Response) => {
  try {
    const { url } = req.body || {};
    if (!url || !/^https?:\/\//i.test(String(url))) {
      return res.status(400).json({ error: 'A http(s) URL is required' });
    }

    // Never let a supplied URL reach the local network
    let target: URL;
    try { target = new URL(String(url)); } catch { return res.status(400).json({ error: 'That URL is not valid' }); }
    const host = target.hostname.toLowerCase();
    if (
      host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') ||
      /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      host === '::1' || host === '[::1]'
    ) {
      return res.status(400).json({ error: 'That address is not allowed' });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    let html = '';
    try {
      const r = await fetch(target.toString(), {
        signal: controller.signal,
        headers: { 'User-Agent': 'PrintBerryIQ/1.0 (+product image lookup)', Accept: 'text/html' }
      });
      if (!r.ok) return res.status(400).json({ error: `Supplier page returned ${r.status}` });
      html = (await r.text()).slice(0, 400_000);
    } catch (e: any) {
      return res.status(400).json({ error: e.name === 'AbortError' ? 'Supplier page timed out' : 'Could not reach that page' });
    } finally {
      clearTimeout(timeout);
    }

    const pick = (prop: string) => {
      const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i');
      const alt = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, 'i');
      return html.match(re)?.[1] || html.match(alt)?.[1] || null;
    };

    const raw = pick('og:image') || pick('twitter:image') || pick('og:image:secure_url');
    if (!raw) {
      return res.status(404).json({
        error: 'No preview image published on that page. Paste an image URL instead.'
      });
    }

    const imageUrl = new URL(raw, target).toString();
    const title = pick('og:title') || html.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim() || null;

    res.json({ success: true, imageUrl, title, message: 'Found a product image' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
