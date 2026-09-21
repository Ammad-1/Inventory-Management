import React from 'react';
import { useInventory } from '../../context/InventoryContext';
import { 
  DollarSign, 
  Ship, 
  Printer, 
  AlertTriangle, 
  TrendingUp, 
  ArrowRight, 
  CheckCircle2, 
  Clock, 
  Plus, 
  Sparkles,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  ChevronRight
} from 'lucide-react';

interface DashboardViewProps {
  onOpenNewPO: () => void;
  onOpenNewJob: () => void;
  onOpenAdjustStock: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onOpenNewPO,
  onOpenNewJob,
  onOpenAdjustStock
}) => {
  const { 
    inventory, 
    boms, 
    productionOrders, 
    purchaseOrders, 
    salesOrders, 
    stockMovements, 
    forecasts,
    quickReorderFromForecast,
    receivePurchaseOrder,
    setActiveView 
  } = useInventory();

  // Metrics
  const totalValuation = inventory.reduce((sum, item) => sum + (item.currentStock * item.landedCostPerUnit), 0);
  const rawMaterialsValuation = inventory
    .filter(i => i.category === 'raw_material')
    .reduce((sum, item) => sum + (item.currentStock * item.landedCostPerUnit), 0);
  const finishedGoodsValuation = inventory
    .filter(i => i.category === 'finished_goods')
    .reduce((sum, item) => sum + (item.currentStock * item.landedCostPerUnit), 0);

  const inTransitPOs = purchaseOrders.filter(p => p.status === 'in_transit' || p.status === 'customs_clearance');
  const inTransitUnits = inTransitPOs.reduce((sum, po) => sum + po.lines.reduce((lsum, l) => lsum + l.quantityOrdered, 0), 0);
  const inTransitCapital = inTransitPOs.reduce((sum, po) => sum + po.costBreakdown.totalLandedCost, 0);

  const activeJobs = productionOrders.filter(j => j.status === 'in_progress' || j.status === 'quality_check');
  const activeWipUnits = activeJobs.reduce((sum, j) => sum + j.targetQuantity, 0);

  const criticalForecasts = forecasts.filter(f => f.urgency === 'critical');
  const mostCritical = criticalForecasts.length > 0 ? criticalForecasts[0] : null;

  return (
    <div id="dashboard-view-container" className="space-y-6 pb-12">
      
      {/* Critical Reorder Alert Banner */}
      {mostCritical && (
        <div id="critical-alert-banner" className="bg-gradient-to-r from-rose-950/80 via-slate-900 to-rose-950/80 border border-rose-500/40 rounded-xl p-4 sm:p-5 shadow-lg shadow-rose-950/40">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start space-x-3">
              <div className="w-10 h-10 rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center shrink-0 mt-0.5">
                <AlertTriangle className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider bg-rose-500/20 text-rose-300 rounded border border-rose-500/40">
                    High Stockout Risk
                  </span>
                  <span className="text-xs text-slate-400">
                    Lead Time: <strong className="text-slate-200">{mostCritical.leadTimeDays} days (Ocean Freight)</strong>
                  </span>
                </div>
                <h3 className="text-base font-bold text-white mt-1">
                  {mostCritical.name} ({mostCritical.sku})
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  Only <span className="text-rose-400 font-semibold">{mostCritical.daysOfSupplyRemaining} days of supply</span> remaining ({mostCritical.currentStock.toLocaleString()} units). Reorder deadline was <span className="underline decoration-rose-500 font-medium">{mostCritical.mustOrderByDate}</span> to avoid printing line shutdown!
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3 self-end sm:self-center shrink-0">
              <button
                id="btn-view-all-alerts"
                onClick={() => setActiveView('forecasting')}
                className="px-3.5 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 rounded-lg border border-slate-700 transition"
              >
                View All ({criticalForecasts.length})
              </button>
              <button
                id="btn-auto-reorder-primary"
                onClick={() => quickReorderFromForecast(mostCritical)}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 rounded-lg shadow-md shadow-rose-600/30 transition flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Auto-Reorder {mostCritical.recommendedOrderQuantity.toLocaleString()} Units</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Total Inventory Valuation */}
        <div 
          id="kpi-valuation-card" 
          className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition cursor-pointer"
          onClick={() => setActiveView('inventory')}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Inventory Valuation</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              ${totalValuation.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>Raw: <strong className="text-slate-200">${rawMaterialsValuation.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></span>
            <span>FG: <strong className="text-slate-200">${finishedGoodsValuation.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></span>
          </div>
        </div>

        {/* Ocean Containers Inbound */}
        <div 
          id="kpi-containers-card" 
          className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition cursor-pointer"
          onClick={() => setActiveView('shipments')}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Inbound Sea Freight</span>
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
              <Ship className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-bold text-cyan-300 tracking-tight">
              {inTransitPOs.length} <span className="text-lg font-medium text-slate-400">Shipments</span>
            </span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>{inTransitUnits.toLocaleString()} units at sea</span>
            <span className="text-cyan-400 font-semibold">${inTransitCapital.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
          </div>
        </div>

        {/* Active Shop Floor Production */}
        <div 
          id="kpi-production-card" 
          className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition cursor-pointer"
          onClick={() => setActiveView('production')}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Shop Floor WIP</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
              <Printer className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-bold text-indigo-300 tracking-tight">
              {activeWipUnits.toLocaleString()} <span className="text-lg font-medium text-slate-400">Units</span>
            </span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>{activeJobs.length} active press jobs</span>
            <span className="text-emerald-400 font-semibold">97.6% Yield (QC)</span>
          </div>
        </div>

        {/* Sales Orders & Xero Integration */}
        <div 
          id="kpi-orders-card" 
          className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-slate-700 transition cursor-pointer"
          onClick={() => setActiveView('orders')}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Sales Pipeline</span>
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              ${salesOrders.reduce((s, o) => s + o.total, 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>Avg Margin: <strong className="text-emerald-400 font-semibold">71.2%</strong></span>
            <span className="text-indigo-400 font-medium">{salesOrders.length} Orders</span>
          </div>
        </div>

      </div>

      {/* Main Content Two-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column (2 spans): Inbound Ocean Containers & Active Work Orders */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Live Inbound Containers Tracking */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Ship className="w-4 h-4 text-cyan-400" />
                  Live Inbound Shipping Containers (Overseas Procurement)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Tracking ocean transit, customs clearance, and landed unit costs
                </p>
              </div>
              <button
                onClick={onOpenNewPO}
                className="px-3 py-1.5 text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New PO</span>
              </button>
            </div>

            <div className="space-y-3">
              {purchaseOrders.map(po => {
                const percent = Math.min(100, Math.round((po.transitDaysElapsed / po.transitDaysTotal) * 100));
                const totalUnits = po.lines.reduce((sum, l) => sum + l.quantityOrdered, 0);

                return (
                  <div key={po.id} className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4 hover:border-slate-600 transition">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-xs font-bold text-cyan-300">{po.poNumber}</span>
                          {po.containerNumber && (
                            <span className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-700 text-slate-300 rounded">
                              {po.containerNumber}
                            </span>
                          )}
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase tracking-wider ${
                            po.status === 'received'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : po.status === 'customs_clearance'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                          }`}>
                            {po.status === 'received' ? 'Received & Stocked' : po.status === 'customs_clearance' ? 'Customs Hold / Port' : 'At Sea (Transit)'}
                          </span>
                        </div>
                        <h4 className="text-sm font-semibold text-white mt-1">
                          {po.supplierName} ({po.supplierCountry})
                        </h4>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Vessel: <span className="text-slate-300">{po.vesselName || 'Ocean Freight Carrier'}</span> | ETA: <span className="text-cyan-300 font-medium">{po.expectedDeliveryDate}</span>
                        </p>
                      </div>

                      <div className="flex sm:flex-col items-end justify-between text-right">
                        <div>
                          <span className="text-xs text-slate-400">Total Cargo:</span>{' '}
                          <strong className="text-sm text-white">{totalUnits.toLocaleString()} units</strong>
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          Landed Total:{' '}
                          <strong className="text-emerald-400">
                            ${po.costBreakdown.totalLandedCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </strong>
                        </div>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="mt-3">
                      <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                        <span>{po.originPort || 'Supplier Port'}</span>
                        <span className="font-semibold text-cyan-300">{po.transitDaysElapsed} / {po.transitDaysTotal} Days ({percent}%)</span>
                        <span>{po.destinationPort || 'Warehouse Dock'}</span>
                      </div>
                      <div className="w-full h-2 bg-slate-700/70 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all ${
                            po.status === 'received' 
                              ? 'bg-emerald-500' 
                              : po.status === 'customs_clearance'
                              ? 'bg-amber-400'
                              : 'bg-gradient-to-r from-cyan-500 to-indigo-500'
                          }`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>

                    {/* Actions & Detail */}
                    <div className="mt-3 pt-2.5 border-t border-slate-700/50 flex items-center justify-between text-xs">
                      <span className="text-slate-400 truncate max-w-[280px]">
                        Item: {po.lines[0]?.name || 'Drinkware Blanks'}
                      </span>
                      {po.status !== 'received' ? (
                        <button
                          onClick={() => receivePurchaseOrder(po.id)}
                          className="px-3 py-1 bg-emerald-600/90 hover:bg-emerald-500 text-white font-medium rounded-md transition flex items-center gap-1"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Receive & Put Away</span>
                        </button>
                      ) : (
                        <span className="text-emerald-400 flex items-center gap-1 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Stocked on {po.receivedDate}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Shop Floor Active Production Orders */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Printer className="w-4 h-4 text-indigo-400" />
                  Active Production Work Orders (Shop Floor)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Heat press stations, sublimation tunnels, and scrap loss tracking
                </p>
              </div>
              <button
                onClick={onOpenNewJob}
                className="px-3 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Launch Job</span>
              </button>
            </div>

            <div className="space-y-3">
              {productionOrders.slice(0, 3).map(job => {
                const jobPercent = job.targetQuantity > 0 
                  ? Math.min(100, Math.round((job.completedQuantity / job.targetQuantity) * 100)) 
                  : 0;

                return (
                  <div key={job.id} className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4 hover:border-slate-600 transition">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-xs font-bold text-indigo-300">{job.orderNumber}</span>
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase tracking-wider ${
                            job.status === 'completed'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : job.status === 'quality_check'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                          }`}>
                            {job.status.replace('_', ' ')}
                          </span>
                          <span className="text-xs text-slate-400">
                            Due: <strong className="text-slate-200">{job.dueDate}</strong>
                          </span>
                        </div>
                        <h4 className="text-sm font-semibold text-white mt-1">
                          {job.finishedGoodsName} ({job.targetQuantity.toLocaleString()} pcs)
                        </h4>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Line: <span className="text-slate-300">{job.machineLine}</span> | Operator: <span className="text-slate-300">{job.operatorName}</span>
                        </p>
                      </div>

                      <div className="flex sm:flex-col items-end justify-between text-right">
                        <div>
                          <span className="text-xs text-slate-400">Completed:</span>{' '}
                          <strong className="text-sm text-white">
                            {job.completedQuantity.toLocaleString()} / {job.targetQuantity.toLocaleString()}
                          </strong>
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          Scrap Logged:{' '}
                          <span className="text-rose-400 font-semibold">{job.scrapQuantity} pcs</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3">
                      <div className="w-full h-2 bg-slate-700/70 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full transition-all"
                          style={{ width: `${jobPercent}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* Right Column: Quick Operations & Recent Stock Ledger */}
        <div className="space-y-6">
          
          {/* Quick Operations Shortcuts */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-3">
              Shop Floor Quick Actions
            </h3>

            <div className="grid grid-cols-1 gap-2.5">
              <button
                onClick={onOpenAdjustStock}
                className="w-full p-3 bg-slate-800/80 hover:bg-slate-800 border border-slate-700/70 rounded-lg flex items-center justify-between text-left transition group"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-white group-hover:text-cyan-300">Quick Stock Adjustment</span>
                    <span className="block text-[11px] text-slate-400">Log damage, scrap, or cycle count</span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 transition" />
              </button>

              <button
                onClick={onOpenNewJob}
                className="w-full p-3 bg-slate-800/80 hover:bg-slate-800 border border-slate-700/70 rounded-lg flex items-center justify-between text-left transition group"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                    <Printer className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-white group-hover:text-indigo-300">Launch Production Batch</span>
                    <span className="block text-[11px] text-slate-400">Explode BOM & reserve raw materials</span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-indigo-400 transition" />
              </button>

              <button
                onClick={onOpenNewPO}
                className="w-full p-3 bg-slate-800/80 hover:bg-slate-800 border border-slate-700/70 rounded-lg flex items-center justify-between text-left transition group"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                    <Ship className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-white group-hover:text-emerald-300">New Overseas PO</span>
                    <span className="block text-[11px] text-slate-400">40ft / 20ft container procurement</span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition" />
              </button>

              <button
                onClick={() => setActiveView('bom')}
                className="w-full p-3 bg-slate-800/80 hover:bg-slate-800 border border-slate-700/70 rounded-lg flex items-center justify-between text-left transition group"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center">
                    <Layers className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-white group-hover:text-purple-300">BOM Recipe Studio</span>
                    <span className="block text-[11px] text-slate-400">Configure ingredient lines & scrap rates</span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-purple-400 transition" />
              </button>
            </div>
          </div>

          {/* Recent Stock Movement Audit Stream */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Live Audit Ledger
              </h3>
              <button
                onClick={() => setActiveView('audit_log')}
                className="text-xs text-cyan-400 hover:text-cyan-300 font-medium flex items-center gap-1"
              >
                <span>Full Ledger</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-3">
              {stockMovements.slice(0, 5).map(m => {
                const isPositive = m.quantityChange > 0;
                return (
                  <div key={m.id} className="text-xs border-b border-slate-800/80 pb-2.5 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[11px] text-slate-400">{m.sku}</span>
                      <span className={`font-mono font-bold px-1.5 py-0.5 rounded text-[11px] ${
                        isPositive 
                          ? 'bg-emerald-500/10 text-emerald-400' 
                          : 'bg-rose-500/10 text-rose-400'
                      }`}>
                        {isPositive ? `+${m.quantityChange.toLocaleString()}` : m.quantityChange.toLocaleString()}
                      </span>
                    </div>
                    <p className="text-slate-300 font-medium truncate mt-0.5">{m.itemName}</p>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
                      <span>{m.reason}</span>
                      <span>{m.timestamp.substring(11, 16)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

      </div>

    </div>
  );
};
