import { Router, Request, Response } from 'express';
import { db } from '../db';
import crypto from 'node:crypto';

export const bomRouter = Router();

// GET all recipes (BOMs)
bomRouter.get('/', (req: Request, res: Response) => {
  try {
    const stmt = db.prepare(`
      SELECT 
        r.id,
        r.name,
        r.code,
        r.blank_item_id as blankItemId,
        b.sku as blankSku,
        b.name as blankName,
        b.landed_cost_per_unit as blankLandedCost,
        b.current_stock as blankCurrentStock,
        r.packaging_item_id as packagingItemId,
        p.sku as packagingSku,
        p.name as packagingName,
        p.cost_per_unit as packagingCost,
        p.current_stock as packagingCurrentStock,
        r.consumables_cost as consumablesCost,
        r.scrap_rate_percent as scrapRatePercent,
        r.target_sell_price as targetSellPrice,
        r.notes,
        r.updated_at as updatedAt
      FROM recipes r
      LEFT JOIN inventory_items b ON r.blank_item_id = b.id
      LEFT JOIN inventory_items p ON r.packaging_item_id = p.id
      ORDER BY r.name ASC
    `);
    const rows = stmt.all() as any[];

    const boms = rows.map(r => {
      const blankCost = r.blankLandedCost || 0;
      const packCost = r.packagingCost || 0;
      const directCost = blankCost + packCost + (r.consumablesCost || 0);
      const scrapBufferCost = directCost * ((r.scrapRatePercent || 0) / 100);
      const totalEstimatedUnitCost = directCost + scrapBufferCost;
      const profitMarginGBP = (r.targetSellPrice || 0) - totalEstimatedUnitCost;
      const profitMarginPercent = r.targetSellPrice > 0 ? (profitMarginGBP / r.targetSellPrice) * 100 : 0;

      return {
        ...r,
        totalEstimatedUnitCost: Number(totalEstimatedUnitCost.toFixed(2)),
        profitMarginGBP: Number(profitMarginGBP.toFixed(2)),
        profitMarginPercent: Number(profitMarginPercent.toFixed(1))
      };
    });

    res.json(boms);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST create recipe
bomRouter.post('/', (req: Request, res: Response) => {
  try {
    const {
      name, code, blankItemId, packagingItemId,
      consumablesCost = 0.05, scrapRatePercent = 2.5,
      targetSellPrice = 0, notes
    } = req.body;

    const id = `bom-${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO recipes (
        id, name, code, blank_item_id, packaging_item_id,
        consumables_cost, scrap_rate_percent, target_sell_price, notes, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id, name, code, blankItemId, packagingItemId || null,
      consumablesCost, scrapRatePercent, targetSellPrice, notes || null, now
    );

    res.status(201).json({ id, message: 'Recipe created' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// PUT update recipe
bomRouter.put('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      name, code, blankItemId, packagingItemId,
      consumablesCost, scrapRatePercent, targetSellPrice, notes
    } = req.body;

    const now = new Date().toISOString();

    const stmt = db.prepare(`
      UPDATE recipes SET
        name = COALESCE(?, name),
        code = COALESCE(?, code),
        blank_item_id = COALESCE(?, blank_item_id),
        packaging_item_id = COALESCE(?, packaging_item_id),
        consumables_cost = COALESCE(?, consumables_cost),
        scrap_rate_percent = COALESCE(?, scrap_rate_percent),
        target_sell_price = COALESCE(?, target_sell_price),
        notes = COALESCE(?, notes),
        updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      name, code, blankItemId, packagingItemId,
      consumablesCost, scrapRatePercent, targetSellPrice, notes,
      now, id
    );

    res.json({ message: 'Recipe updated' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE recipe
bomRouter.delete('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    db.prepare('DELETE FROM recipes WHERE id = ?').run(id);
    res.json({ message: 'Recipe deleted' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});
