import React, { useState } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { BOMIngredient } from '../../types';
import { X, FlaskConical, Plus, Trash2, DollarSign } from 'lucide-react';

interface NewBOMModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewBOMModal: React.FC<NewBOMModalProps> = ({ isOpen, onClose }) => {
  const { inventory, addBOM, setActiveView } = useInventory();

  const [name, setName] = useState('');
  const [finishedGoodsSku, setFinishedGoodsSku] = useState('');
  const [description, setDescription] = useState('');
  const [laborCost, setLaborCost] = useState<number>(0.45);
  const [overheadCost, setOverheadCost] = useState<number>(0.12);
  const [targetSellPrice, setTargetSellPrice] = useState<number>(6.50);

  // Initialize with blank mug + packaging box
  const [ingredients, setIngredients] = useState<BOMIngredient[]>([
    {
      itemId: inventory[0]?.id || 'RM-001',
      sku: inventory[0]?.sku || 'RM-MUG-11-WHT',
      itemName: inventory[0]?.name || '11oz Ceramic Blank Mug',
      category: 'raw_material',
      quantityRequired: 1,
      unit: 'pcs',
      unitCost: inventory[0]?.landedCostPerUnit || 0.84,
      scrapRatePercent: 2.5,
    },
    {
      itemId: inventory[7]?.id || 'PKG-001',
      sku: inventory[7]?.sku || 'PKG-BOX-MUG-11',
      itemName: inventory[7]?.name || '11oz Individual Mug Mailer Box',
      category: 'packaging',
      quantityRequired: 1,
      unit: 'pcs',
      unitCost: inventory[7]?.landedCostPerUnit || 0.22,
      scrapRatePercent: 1.0,
    }
  ]);

  if (!isOpen) return null;

  const handleAddIngredient = () => {
    const rawItems = inventory.filter(i => i.category !== 'finished_goods');
    const item = rawItems[0] || inventory[0];
    setIngredients([
      ...ingredients,
      {
        itemId: item.id,
        sku: item.sku,
        itemName: item.name,
        category: item.category,
        quantityRequired: 1,
        unit: item.unit,
        unitCost: item.landedCostPerUnit,
        scrapRatePercent: 2.0,
      }
    ]);
  };

  const handleUpdateIngredient = (index: number, updates: Partial<BOMIngredient>) => {
    const next = [...ingredients];
    next[index] = { ...next[index], ...updates };
    setIngredients(next);
  };

  const handleRemoveIngredient = (index: number) => {
    setIngredients(ingredients.filter((_, i) => i !== index));
  };

  const ingredientCost = ingredients.reduce((sum, ing) => {
    const factor = 1 + (ing.scrapRatePercent / 100);
    return sum + (ing.quantityRequired * ing.unitCost * factor);
  }, 0);

  const totalCost = ingredientCost + laborCost + overheadCost;
  const grossMargin = targetSellPrice > 0 ? ((targetSellPrice - totalCost) / targetSellPrice) * 100 : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !finishedGoodsSku.trim()) return;

    const matchedItem = inventory.find(i => i.sku === finishedGoodsSku.trim().toUpperCase());

    addBOM({
      name: name.trim(),
      finishedGoodsSku: finishedGoodsSku.trim().toUpperCase(),
      finishedGoodsItemId: matchedItem?.id || `FG-${Date.now()}`,
      outputQuantity: 1,
      description,
      laborCostPerUnit: laborCost,
      overheadCostPerUnit: overheadCost,
      targetSellPrice,
      ingredients,
    });

    onClose();
    setActiveView('bom');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl my-8 animate-in fade-in zoom-in duration-150">
        
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
              <FlaskConical className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Create BOM Recipe Formula</h3>
              <p className="text-[11px] text-slate-400">Specify material ratios, scrap allowance, and target margin</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Recipe Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. 15oz Gloss Ceramic Mug Print"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Output Finished Goods SKU *</label>
              <input
                type="text"
                required
                placeholder="e.g. FG-MUG-15-GLS"
                value={finishedGoodsSku}
                onChange={e => setFinishedGoodsSku(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Description / Spec</label>
            <input
              type="text"
              placeholder="e.g. Full-bleed sublimation print formula with heat shrink tunnel finish"
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Ingredient Rows */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-slate-300 font-semibold uppercase tracking-wider text-[11px]">
                Recipe Ingredients & Raw Materials
              </label>
              <button
                type="button"
                onClick={handleAddIngredient}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded-lg text-xs font-bold flex items-center gap-1 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Ingredient</span>
              </button>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {ingredients.map((ing, idx) => (
                <div key={idx} className="bg-slate-800/60 p-3 rounded-lg border border-slate-700 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 text-xs">
                  
                  <div className="flex-1">
                    <select
                      value={ing.itemId}
                      onChange={e => {
                        const it = inventory.find(i => i.id === e.target.value);
                        if (it) {
                          handleUpdateIngredient(idx, {
                            itemId: it.id,
                            sku: it.sku,
                            itemName: it.name,
                            unit: it.unit,
                            unitCost: it.landedCostPerUnit,
                          });
                        }
                      }}
                      className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none"
                    >
                      {inventory.map(item => (
                        <option key={item.id} value={item.id}>
                          [{item.sku}] {item.name} (${item.landedCostPerUnit.toFixed(2)})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center space-x-2">
                    <div className="w-20">
                      <input
                        type="number"
                        step="0.01"
                        min="0.001"
                        value={ing.quantityRequired}
                        onChange={e => handleUpdateIngredient(idx, { quantityRequired: parseFloat(e.target.value) || 0 })}
                        placeholder="Qty"
                        className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 font-mono text-center text-xs text-white"
                      />
                      <span className="text-[10px] text-slate-400 block text-center mt-0.5">{ing.unit}</span>
                    </div>

                    <div className="w-20">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={ing.scrapRatePercent}
                        onChange={e => handleUpdateIngredient(idx, { scrapRatePercent: parseFloat(e.target.value) || 0 })}
                        placeholder="Scrap %"
                        className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 font-mono text-center text-xs text-amber-300"
                      />
                      <span className="text-[10px] text-slate-400 block text-center mt-0.5">% scrap</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveIngredient(idx)}
                      className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-700 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                </div>
              ))}
            </div>
          </div>

          {/* Additional Cost Adders */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Direct Labor / Unit ($)</label>
              <input
                type="number"
                step="0.01"
                value={laborCost}
                onChange={e => setLaborCost(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Machine Overhead ($)</label>
              <input
                type="number"
                step="0.01"
                value={overheadCost}
                onChange={e => setOverheadCost(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Target Selling Price ($)</label>
              <input
                type="number"
                step="0.05"
                value={targetSellPrice}
                onChange={e => setTargetSellPrice(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Economics Summary */}
          <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700 flex items-center justify-between text-xs">
            <div>
              <span className="text-slate-400 block text-[11px]">Total Computed Unit BOM Cost:</span>
              <span className="font-mono font-bold text-rose-400 text-sm">${totalCost.toFixed(2)} / unit</span>
            </div>
            <div className="text-right">
              <span className="text-slate-400 block text-[11px]">Gross Margin at Target Sell:</span>
              <span className="font-mono font-bold text-emerald-400 text-sm">{grossMargin.toFixed(1)}%</span>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition shadow-md shadow-indigo-600/30"
            >
              Save BOM Recipe
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
