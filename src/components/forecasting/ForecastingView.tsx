import React from 'react';
import { useInventory } from '../../context/InventoryContext';
import { 
  Sparkles, 
  AlertTriangle, 
  Calendar, 
  Ship, 
  TrendingUp, 
  ArrowRight, 
  CheckCircle2, 
  ShieldAlert, 
  Clock, 
  Calculator,
  Plus
} from 'lucide-react';

export const ForecastingView: React.FC = () => {
  const { forecasts, quickReorderFromForecast, setActiveView } = useInventory();

  const criticalCount = forecasts.filter(f => f.urgency === 'critical').length;
  const warningCount = forecasts.filter(f => f.urgency === 'warning').length;
  const totalReorderCapital = forecasts
    .filter(f => f.urgency === 'critical' || f.urgency === 'warning')
    .reduce((sum, f) => sum + f.projectedCost, 0);

  return (
    <div id="forecasting-view-container" className="space-y-6 pb-12">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-rose-400" />
            AI Demand Forecasting & Predictive Reordering
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time burn rate velocity analysis, lead-time demand buffers, and container capacity sizing recommendations
          </p>
        </div>

        <div className="flex items-center space-x-2 text-xs">
          <div className="px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-300 border border-rose-500/30 font-bold">
            {criticalCount} Critical Stockouts
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/30 font-bold">
            {warningCount} Approaching
          </div>
        </div>
      </div>

      {/* Intelligence Formula Card */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-500/30 rounded-xl p-5 text-xs">
        <div className="flex items-center space-x-2 text-indigo-300 font-bold text-sm uppercase tracking-wider mb-2">
          <Calculator className="w-4 h-4" />
          <span>Predictive Replenishment Equation</span>
        </div>
        <p className="text-slate-300 leading-relaxed max-w-4xl">
          Because blank ceramic drinkware requires <strong>38–45 days of ocean container transit</strong> from China, reorders cannot be triggered when stock hits zero. The engine continuously solves:
          <span className="block my-2 px-3 py-2 bg-slate-900/80 rounded-lg border border-slate-800 font-mono text-cyan-300 text-xs">
            Reorder Deadline = Stockout Date − Supplier Ocean Lead Time (45 Days) − Safety Buffer (14 Days)
          </span>
          Container capacity sizing automatically aligns with 40ft High Cube specifications (1,000 master cartons / 36,000 units) to minimize freight cost per unit.
        </p>
      </div>

      {/* Forecast Recommendations Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-800/70 border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4">Item SKU / Name</th>
                <th className="py-3 px-4 text-center">Urgency</th>
                <th className="py-3 px-4 text-right">Daily Burn</th>
                <th className="py-3 px-4 text-right">Supply Left</th>
                <th className="py-3 px-4 text-center">Lead Time</th>
                <th className="py-3 px-4">Must Reorder By</th>
                <th className="py-3 px-4">Container / Batch Sizing</th>
                <th className="py-3 px-4 text-right">Est. Capital</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {forecasts.map(f => {
                const isCritical = f.urgency === 'critical';
                const isWarning = f.urgency === 'warning';

                return (
                  <tr key={f.itemId} className={`hover:bg-slate-800/40 transition ${isCritical ? 'bg-rose-950/20' : ''}`}>
                    
                    {/* Item SKU & Name */}
                    <td className="py-3.5 px-4 align-middle max-w-[240px]">
                      <div className="font-mono text-xs font-bold text-cyan-300">{f.sku}</div>
                      <div className="font-medium text-white truncate mt-0.5">{f.name}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">Supplier: {f.primarySupplier}</div>
                    </td>

                    {/* Urgency Badge */}
                    <td className="py-3.5 px-4 align-middle text-center whitespace-nowrap">
                      {isCritical ? (
                        <span className="px-2.5 py-1 text-[11px] font-bold rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse flex items-center gap-1 justify-center">
                          <ShieldAlert className="w-3.5 h-3.5" />
                          <span>Critical</span>
                        </span>
                      ) : isWarning ? (
                        <span className="px-2.5 py-1 text-[11px] font-bold rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1 justify-center">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Reorder Soon</span>
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 text-[11px] font-semibold rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 justify-center">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Stable</span>
                        </span>
                      )}
                    </td>

                    {/* Daily Burn */}
                    <td className="py-3.5 px-4 align-middle text-right font-mono text-slate-300 whitespace-nowrap">
                      {f.dailyBurnRate} units/day
                    </td>

                    {/* Supply Left */}
                    <td className="py-3.5 px-4 align-middle text-right whitespace-nowrap">
                      <div className={`font-mono text-sm font-bold ${isCritical ? 'text-rose-400' : isWarning ? 'text-amber-400' : 'text-slate-200'}`}>
                        {f.daysOfSupplyRemaining} Days
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {f.currentStock.toLocaleString()} units left
                      </div>
                    </td>

                    {/* Ocean Lead Time */}
                    <td className="py-3.5 px-4 align-middle text-center font-mono text-slate-300 whitespace-nowrap">
                      {f.leadTimeDays} Days
                    </td>

                    {/* Must Reorder By */}
                    <td className="py-3.5 px-4 align-middle whitespace-nowrap">
                      <div className={`font-bold ${isCritical ? 'text-rose-300 underline' : 'text-slate-200'}`}>
                        {f.mustOrderByDate}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Stockout on {f.stockoutDate}
                      </div>
                    </td>

                    {/* Recommended Sizing */}
                    <td className="py-3.5 px-4 align-middle max-w-[220px]">
                      <div className="font-mono font-bold text-white">
                        {f.recommendedOrderQuantity.toLocaleString()} Units
                      </div>
                      <div className="text-[10px] text-cyan-400 truncate mt-0.5">
                        {f.recommendedContainerType}
                      </div>
                    </td>

                    {/* Estimated Capital */}
                    <td className="py-3.5 px-4 align-middle text-right font-mono font-bold text-emerald-400 whitespace-nowrap">
                      ${f.projectedCost.toLocaleString(undefined, { minimumFractionDigits: 0 })}
                    </td>

                    {/* Action */}
                    <td className="py-3.5 px-4 align-middle text-right whitespace-nowrap">
                      <button
                        onClick={() => quickReorderFromForecast(f)}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg transition shadow-sm flex items-center gap-1.5 ml-auto ${
                          isCritical
                            ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30'
                            : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                        }`}
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Auto-PO</span>
                      </button>
                    </td>

                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
