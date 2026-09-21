import React, { useState } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { BillOfMaterials, BOMIngredient } from '../../types';
import { 
  FlaskConical, 
  Layers, 
  Plus, 
  Calculator, 
  CheckCircle2, 
  AlertCircle, 
  Printer, 
  DollarSign, 
  Percent,
  Trash2,
  Edit3
} from 'lucide-react';

interface BOMViewProps {
  onOpenCreateBOM: () => void;
  onLaunchJobFromBOM: (bomId: string, quantity: number) => void;
}

export const BOMView: React.FC<BOMViewProps> = ({
  onOpenCreateBOM,
  onLaunchJobFromBOM
}) => {
  const { boms, inventory, deleteBOM } = useInventory();
  const [selectedBOMId, setSelectedBOMId] = useState<string>(boms[0]?.id || '');
  const [batchQuantity, setBatchQuantity] = useState<number>(2500);

  const selectedBOM = boms.find(b => b.id === selectedBOMId) || boms[0];

  // Calculate live ingredient costs and unit total
  const ingredientCost = selectedBOM?.ingredients.reduce((sum, ing) => {
    const scrapFactor = 1 + (ing.scrapRatePercent / 100);
    return sum + (ing.quantityRequired * ing.unitCost * scrapFactor);
  }, 0) || 0;

  const totalUnitCost = ingredientCost + (selectedBOM?.laborCostPerUnit || 0) + (selectedBOM?.overheadCostPerUnit || 0);
  const targetSell = selectedBOM?.targetSellPrice || 1;
  const grossProfitPerUnit = Math.max(0, targetSell - totalUnitCost);
  const marginPercent = targetSell > 0 ? (grossProfitPerUnit / targetSell) * 100 : 0;

  // Batch calculations
  const batchCost = totalUnitCost * batchQuantity;
  const batchRevenue = targetSell * batchQuantity;
  const batchGrossProfit = batchRevenue - batchCost;

  return (
    <div id="bom-studio-container" className="space-y-6 pb-12">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-indigo-400" />
            Bill of Materials (BOM) & Recipe Studio
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure multi-level print formulas, raw material ratios, press scrap allowances, and true unit cost margins
          </p>
        </div>

        <button
          onClick={onOpenCreateBOM}
          className="px-4 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition shadow-md shadow-indigo-600/30 flex items-center gap-1.5 self-start sm:self-center"
        >
          <Plus className="w-4 h-4" />
          <span>New Recipe</span>
        </button>
      </div>

      {/* Recipe Selection Tabs */}
      <div className="flex items-center space-x-2 overflow-x-auto pb-1">
        {boms.map(bom => (
          <button
            key={bom.id}
            onClick={() => setSelectedBOMId(bom.id)}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold whitespace-nowrap transition flex items-center gap-2 border ${
              selectedBOM?.id === bom.id
                ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/20'
                : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>{bom.name}</span>
          </button>
        ))}
      </div>

      {selectedBOM && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left Column (2 spans): BOM Ingredients & Financial Breakdown */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* BOM Specs Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-800 gap-2">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-mono font-bold text-indigo-400">{selectedBOM.id}</span>
                    <span className="px-2 py-0.5 text-[10px] font-mono bg-slate-800 text-slate-300 rounded border border-slate-700">
                      Output SKU: {selectedBOM.finishedGoodsSku}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-white mt-1">{selectedBOM.name}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">{selectedBOM.description}</p>
                </div>

                <div className="flex items-center space-x-2 self-end sm:self-center">
                  <button
                    onClick={() => {
                      if (window.confirm(`Delete recipe "${selectedBOM.name}"?`)) {
                        deleteBOM(selectedBOM.id);
                      }
                    }}
                    className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition"
                    title="Delete Recipe"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Ingredients Table */}
              <div className="mt-4">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2.5">
                  Ingredient Breakdown & Scrap Allowance
                </h4>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-800/60 border-y border-slate-800 text-slate-400 text-[11px]">
                      <tr>
                        <th className="py-2.5 px-3">Item / Raw Material</th>
                        <th className="py-2.5 px-3">Required Qty</th>
                        <th className="py-2.5 px-3">Unit Landed Cost</th>
                        <th className="py-2.5 px-3">Scrap Rate %</th>
                        <th className="py-2.5 px-3 text-right">Line Total / Unit</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {selectedBOM.ingredients.map((ing, idx) => {
                        const scrapFactor = 1 + (ing.scrapRatePercent / 100);
                        const effectiveLineCost = ing.quantityRequired * ing.unitCost * scrapFactor;
                        const invItem = inventory.find(i => i.id === ing.itemId || i.sku === ing.sku);

                        return (
                          <tr key={idx} className="hover:bg-slate-800/30 transition">
                            <td className="py-2.5 px-3">
                              <div className="font-semibold text-white">{ing.itemName}</div>
                              <div className="font-mono text-[10px] text-slate-400">{ing.sku}</div>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-200">
                              {ing.quantityRequired} {ing.unit}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-slate-300">
                              ${ing.unitCost.toFixed(ing.unit === 'ml' ? 3 : 2)}
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                                +{ing.scrapRatePercent}%
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-100">
                              ${effectiveLineCost.toFixed(3)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Additional Cost Adder rows */}
                <div className="mt-4 pt-3 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
                    <span className="text-slate-400 block text-[11px]">Direct Shop Labor</span>
                    <span className="font-mono font-bold text-white text-sm">
                      ${selectedBOM.laborCostPerUnit.toFixed(2)} / unit
                    </span>
                  </div>
                  <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
                    <span className="text-slate-400 block text-[11px]">Machine Overhead & Power</span>
                    <span className="font-mono font-bold text-white text-sm">
                      ${selectedBOM.overheadCostPerUnit.toFixed(2)} / unit
                    </span>
                  </div>
                  <div className="bg-indigo-950/40 p-3 rounded-lg border border-indigo-500/30">
                    <span className="text-indigo-300 block text-[11px] font-semibold">Total Unit BOM Cost</span>
                    <span className="font-mono font-bold text-indigo-200 text-sm">
                      ${totalUnitCost.toFixed(2)} / unit
                    </span>
                  </div>
                </div>

              </div>
            </div>

            {/* Profitability & Margin Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">
                Unit Economics & Gross Margin
              </h4>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/60">
                  <span className="text-[11px] text-slate-400 block">Target Sell Price</span>
                  <span className="text-lg font-bold text-white mt-0.5 block">
                    ${targetSell.toFixed(2)}
                  </span>
                </div>
                <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/60">
                  <span className="text-[11px] text-slate-400 block">Total BOM Cost</span>
                  <span className="text-lg font-bold text-rose-400 mt-0.5 block">
                    ${totalUnitCost.toFixed(2)}
                  </span>
                </div>
                <div className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/60">
                  <span className="text-[11px] text-slate-400 block">Gross Profit</span>
                  <span className="text-lg font-bold text-emerald-400 mt-0.5 block">
                    ${grossProfitPerUnit.toFixed(2)}
                  </span>
                </div>
                <div className="bg-emerald-500/10 p-3 rounded-lg border border-emerald-500/30">
                  <span className="text-[11px] text-emerald-300 block font-semibold">Gross Margin</span>
                  <span className="text-lg font-bold text-emerald-300 mt-0.5 block">
                    {marginPercent.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>

          </div>

          {/* Right Column: Live Batch Requirement Explosion Calculator */}
          <div className="space-y-6">
            
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <div className="flex items-center space-x-2 pb-3 border-b border-slate-800">
                <Calculator className="w-5 h-5 text-cyan-400" />
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                  Batch Material Explosion
                </h3>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Simulate a production batch to verify material inventory availability and calculate exact scrap volume.
              </p>

              {/* Batch Size Input */}
              <div className="mt-4">
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Target Batch Quantity (pcs)
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="number"
                    min="1"
                    step="50"
                    value={batchQuantity}
                    onChange={e => setBatchQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono font-bold text-white focus:outline-none focus:border-cyan-500"
                  />
                  <div className="flex space-x-1">
                    {[500, 1000, 2500, 5000].map(qty => (
                      <button
                        key={qty}
                        onClick={() => setBatchQuantity(qty)}
                        className={`px-2 py-1.5 text-[10px] font-bold rounded ${
                          batchQuantity === qty ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        {qty}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Material Availability Check */}
              <div className="mt-5 space-y-3">
                <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Required Stock Allocation:
                </h4>

                {selectedBOM.ingredients.map((ing, idx) => {
                  const scrapFactor = 1 + (ing.scrapRatePercent / 100);
                  const totalRequired = Math.ceil(ing.quantityRequired * batchQuantity * scrapFactor);
                  const baseRequired = ing.quantityRequired * batchQuantity;
                  const scrapAllowanceUnits = totalRequired - baseRequired;

                  const invItem = inventory.find(i => i.id === ing.itemId || i.sku === ing.sku);
                  const onHand = invItem ? invItem.currentStock - invItem.reservedStock : 0;
                  const isSufficient = onHand >= totalRequired;

                  return (
                    <div key={idx} className="bg-slate-800/60 border border-slate-700/60 rounded-lg p-3 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-white">{ing.itemName}</span>
                        {isSufficient ? (
                          <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> In Stock
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-rose-400 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> Shortfall ({Math.abs(onHand - totalRequired).toLocaleString()})
                          </span>
                        )}
                      </div>

                      <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400">
                        <span>
                          Required: <strong className="text-cyan-300 font-mono">{totalRequired.toLocaleString()} {ing.unit}</strong>
                          {scrapAllowanceUnits > 0 && (
                            <span className="text-amber-400/90 text-[10px]"> (incl. {scrapAllowanceUnits} scrap)</span>
                          )}
                        </span>
                        <span>Available: <strong className="text-slate-200 font-mono">{onHand.toLocaleString()}</strong></span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Batch Financial Summary */}
              <div className="mt-5 pt-4 border-t border-slate-800 space-y-2 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Batch Production Cost:</span>
                  <strong className="text-white font-mono">${batchCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Projected Revenue:</span>
                  <strong className="text-cyan-300 font-mono">${batchRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
                </div>
                <div className="flex justify-between text-slate-300 font-semibold pt-1 border-t border-slate-800">
                  <span>Projected Gross Profit:</span>
                  <strong className="text-emerald-400 font-mono">${batchGrossProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
                </div>
              </div>

              {/* Launch Button */}
              <button
                onClick={() => onLaunchJobFromBOM(selectedBOM.id, batchQuantity)}
                className="w-full mt-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-lg transition shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2"
              >
                <Printer className="w-4 h-4" />
                <span>Launch {batchQuantity.toLocaleString()} Unit Production Batch</span>
              </button>

            </div>

          </div>

        </div>
      )}

    </div>
  );
};
