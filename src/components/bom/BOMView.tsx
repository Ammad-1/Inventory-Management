import React, { useState } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { RecipeBOM } from '../../types';
import { 
  Layers, 
  TrendingUp, 
  Package, 
  Boxes, 
  Calculator, 
  Sparkles,
  Percent,
  CheckCircle2,
  AlertTriangle,
  ArrowRight
} from 'lucide-react';

export const BOMView: React.FC = () => {
  const { recipes, inventory } = useInventory();
  const [selectedRecipeId, setSelectedRecipeId] = useState<string>(recipes[0]?.id || '');
  const [testRunQuantity, setTestRunQuantity] = useState<number | string>(500);

  const activeRecipe = recipes.find(r => r.id === selectedRecipeId) || recipes[0];

  if (!activeRecipe && recipes.length > 0) return null;

  const blankItem = inventory.find(i => i.id === activeRecipe?.blankItemId);
  const packagingItem = inventory.find(i => i.id === activeRecipe?.packagingItemId);

  const blankLanded = blankItem?.landedCostPerUnit || blankItem?.costPerUnit || 0;
  const packagingCost = packagingItem?.costPerUnit || 0;
  const consumables = activeRecipe?.consumablesCost || 0.05;
  const scrapRate = (activeRecipe?.scrapRatePercent || 2.5) / 100;

  const rawUnitCost = blankLanded + packagingCost + consumables;
  const scrapBufferCost = rawUnitCost * scrapRate;
  const trueUnitCost = rawUnitCost + scrapBufferCost;

  const sellPrice = activeRecipe?.targetSellPrice || 3.50;
  const unitGrossProfit = sellPrice - trueUnitCost;
  const unitMarginPercent = sellPrice > 0 ? (unitGrossProfit / sellPrice) * 100 : 0;

  // Batch simulation
  const numQty = typeof testRunQuantity === 'string' ? (parseInt(testRunQuantity) || 0) : testRunQuantity;
  const runTotalRevenue = numQty * sellPrice;
  const runTotalCost = numQty * trueUnitCost;
  const runTotalProfit = runTotalRevenue - runTotalCost;
  const estimatedScrappedUnits = Math.round(numQty * scrapRate);

  return (
    <div className="space-y-6 pb-12">
      
      {/* Top Banner Card */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
        <div className="flex items-center space-x-2.5 mb-1.5">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
            <Layers className="w-4 h-4" />
          </div>
          <h2 className="text-xl font-extrabold text-slate-900 font-heading">
            Print Recipes (BOM) & Real Margin Analysis
          </h2>
        </div>
        <p className="text-xs text-slate-500 max-w-2xl font-medium">
          Itemized Bill of Materials breaking down finished printed products into blank drinkware, individual packaging, sublimation inks, and heat-press defect allowance (+2.5%) for true unit profitability.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Recipes List */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 px-1">
            Available Recipes ({recipes.length})
          </div>

          <div className="space-y-2.5">
            {recipes.map(recipe => {
              const isSelected = recipe.id === (activeRecipe?.id || selectedRecipeId);
              return (
                <div
                  key={recipe.id}
                  onClick={() => setSelectedRecipeId(recipe.id)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    isSelected 
                      ? 'bg-indigo-50 text-indigo-900 shadow-sm border-indigo-200' 
                      : 'bg-slate-50/70 border-slate-200/80 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs">{recipe.name}</span>
                    <span className={`text-[10px] font-mono px-2 py-0.5 rounded-md font-bold ${
                      isSelected ? 'bg-indigo-600 text-white' : 'bg-white text-indigo-700 border border-slate-200'
                    }`}>
                      {recipe.code}
                    </span>
                  </div>

                  <div className={`text-[11px] mt-1 line-clamp-1 ${isSelected ? 'text-indigo-700/80' : 'text-slate-400'}`}>
                    {recipe.notes || '1x Blank + 1x Packaging'}
                  </div>

                  <div className={`flex items-center justify-between mt-2.5 pt-2 border-t text-[11px] ${
                    isSelected ? 'border-indigo-200/60' : 'border-slate-200/80'
                  }`}>
                    <span className={isSelected ? 'text-indigo-800' : 'text-slate-500'}>
                      Sale Price: <strong className={isSelected ? 'text-indigo-900' : 'text-slate-900'}>£{recipe.targetSellPrice?.toFixed(2)}</strong>
                    </span>
                    <span className="text-emerald-600 font-bold">
                      ~{recipe.profitMarginPercent || 65}% Margin
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Recipe Details & Profit Simulator */}
        {activeRecipe && (
          <div className="lg:col-span-2 space-y-6">
            
            {/* Active Recipe Header Card */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900 font-heading">{activeRecipe.name}</h3>
                  <p className="text-xs text-slate-500 mt-0.5">{activeRecipe.notes}</p>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-slate-400 font-semibold uppercase">Target Sale Price</div>
                  <div className="text-2xl font-extrabold text-indigo-600 font-heading">£{sellPrice.toFixed(2)}</div>
                </div>
              </div>

              {/* Recipe Ingredients */}
              <div className="space-y-2.5">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Recipe Bill of Materials:
                </div>

                {/* Blank Item */}
                <div className="bg-slate-50/70 p-3.5 rounded-xl border border-slate-200/80 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-bold text-slate-900">1x {blankItem ? blankItem.name : 'Blank Mug'}</div>
                    <div className="text-[11px] text-slate-500 font-mono">SKU: {blankItem?.sku} &bull; In stock: {blankItem?.currentStock} {blankItem?.unit}</div>
                  </div>
                  <div className="text-right font-mono">
                    <div className="text-slate-400 text-[10px]">China Landed Cost</div>
                    <div className="font-extrabold text-slate-900">£{blankLanded.toFixed(2)}</div>
                  </div>
                </div>

                {/* Packaging */}
                <div className="bg-slate-50/70 p-3.5 rounded-xl border border-slate-200/80 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-bold text-slate-900">1x {packagingItem ? packagingItem.name : 'Single Mug Mailer Box'}</div>
                    <div className="text-[11px] text-slate-500 font-mono">SKU: {packagingItem?.sku} &bull; In stock: {packagingItem?.currentStock} {packagingItem?.unit}</div>
                  </div>
                  <div className="text-right font-mono">
                    <div className="text-slate-400 text-[10px]">Packaging Cost</div>
                    <div className="font-extrabold text-slate-900">£{packagingCost.toFixed(2)}</div>
                  </div>
                </div>

                {/* Consumables */}
                <div className="bg-slate-50/70 p-3.5 rounded-xl border border-slate-200/80 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-bold text-slate-900">Sublimation Inks & Transfer Paper</div>
                    <div className="text-[11px] text-slate-500">Printing consumables allowance per unit</div>
                  </div>
                  <div className="text-right font-mono">
                    <div className="text-slate-400 text-[10px]">Consumables Fee</div>
                    <div className="font-extrabold text-slate-900">£{consumables.toFixed(2)}</div>
                  </div>
                </div>

                {/* Scrap Buffer */}
                <div className="bg-rose-50/80 p-3.5 rounded-xl border border-rose-200/80 flex items-center justify-between text-xs">
                  <div>
                    <div className="font-bold text-rose-800">Press Scrap & Defect Reserve (+{activeRecipe.scrapRatePercent}%)</div>
                    <div className="text-[11px] text-rose-600 font-medium">Financial buffer for cracked mugs and heat press misprints</div>
                  </div>
                  <div className="text-right font-mono">
                    <div className="text-rose-600 text-[10px]">Scrap Buffer</div>
                    <div className="font-extrabold text-rose-700">+£{scrapBufferCost.toFixed(2)}</div>
                  </div>
                </div>
              </div>

              {/* 3 Unit Cost Results */}
              <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
                <div className="bg-slate-50/70 p-3 rounded-xl border border-slate-200/80">
                  <div className="text-[10px] text-slate-400 font-semibold uppercase">True Landed Cost / Unit</div>
                  <div className="text-xl font-extrabold text-slate-900 mt-0.5 font-heading">£{trueUnitCost.toFixed(2)}</div>
                </div>

                <div className="bg-slate-50/70 p-3 rounded-xl border border-slate-200/80">
                  <div className="text-[10px] text-slate-400 font-semibold uppercase">Gross Profit / Unit</div>
                  <div className="text-xl font-extrabold text-emerald-600 mt-0.5 font-heading">£{unitGrossProfit.toFixed(2)}</div>
                </div>

                <div className="bg-emerald-50/80 p-3 rounded-xl border border-emerald-200/80">
                  <div className="text-[10px] text-emerald-800 font-bold uppercase">Real Gross Margin</div>
                  <div className="text-xl font-extrabold text-emerald-700 mt-0.5 font-heading">{unitMarginPercent.toFixed(1)}%</div>
                </div>
              </div>
            </div>

            {/* Batch Profitability Simulator Card */}
            <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold text-slate-900 font-heading">Client Order Profitability Simulator</h4>
                  <p className="text-xs text-slate-500 font-medium">Calculate customer quote revenue, landed material costs, and expected press scrap</p>
                </div>

                <div className="flex items-center space-x-2">
                  <label className="text-xs text-slate-500 font-medium">Batch Size:</label>
                  <input
                    type="number"
                    min="1"
                    step="50"
                    value={testRunQuantity}
                    onChange={(e) => setTestRunQuantity(e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-24 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 text-xs text-slate-900 font-bold text-center focus:outline-hidden focus:border-indigo-500"
                  />
                  <span className="text-xs text-slate-500 font-medium">pcs</span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-xs">
                <div className="bg-slate-50/70 p-3 rounded-xl border border-slate-200/80">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Client Invoiced Total</div>
                  <div className="font-extrabold text-slate-900 text-sm mt-0.5 font-mono">£{runTotalRevenue.toFixed(2)}</div>
                </div>

                <div className="bg-slate-50/70 p-3 rounded-xl border border-slate-200/80">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">True Material Cost</div>
                  <div className="font-extrabold text-amber-600 text-sm mt-0.5 font-mono">£{runTotalCost.toFixed(2)}</div>
                </div>

                <div className="bg-rose-50/80 p-3 rounded-xl border border-rose-200/80">
                  <div className="text-[10px] text-rose-800 uppercase font-semibold">Expected Press Scrap</div>
                  <div className="font-extrabold text-rose-700 text-sm mt-0.5 font-mono">~{estimatedScrappedUnits} pcs</div>
                </div>

                <div className="bg-emerald-50/80 p-3 rounded-xl border border-emerald-200/80">
                  <div className="text-[10px] text-emerald-800 uppercase font-bold">Real Gross Profit</div>
                  <div className="font-extrabold text-emerald-700 text-sm mt-0.5 font-mono">£{runTotalProfit.toFixed(2)}</div>
                </div>
              </div>
            </div>

          </div>
        )}
      </div>

    </div>
  );
};
