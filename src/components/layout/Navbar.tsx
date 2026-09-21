import React from 'react';
import { useInventory } from '../../context/InventoryContext';
import { 
  Boxes, 
  AlertTriangle, 
  Ship, 
  RotateCcw, 
  TrendingUp, 
  DollarSign, 
  Plus,
  Cpu,
  Layers
} from 'lucide-react';

interface NavbarProps {
  onQuickNewItem: () => void;
  onQuickAdjust: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onQuickNewItem, onQuickAdjust }) => {
  const { 
    inventory, 
    purchaseOrders, 
    forecasts, 
    productionOrders, 
    resetToDefaultData,
    setActiveView 
  } = useInventory();

  // Compute live metrics
  const totalValuation = inventory.reduce((sum, item) => sum + (item.currentStock * item.landedCostPerUnit), 0);
  const criticalStockouts = forecasts.filter(f => f.urgency === 'critical').length;
  const inTransitContainers = purchaseOrders.filter(p => p.status === 'in_transit' || p.status === 'customs_clearance').length;
  const activeJobs = productionOrders.filter(j => j.status === 'in_progress' || j.status === 'quality_check').length;

  return (
    <header id="app-header" className="bg-slate-900 border-b border-slate-800 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo & Identity */}
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setActiveView('dashboard')}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 text-white font-bold text-lg">
              <Boxes className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-lg text-white tracking-tight">SmartPrint <span className="text-cyan-400">IQ</span></span>
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  ERP Live
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">Print Inventory & Landed Cost Operating System</p>
            </div>
          </div>

          {/* Key Stat Badges */}
          <div className="hidden lg:flex items-center space-x-3">
            {/* Inventory Valuation */}
            <div 
              id="stat-valuation"
              className="flex items-center space-x-2 bg-slate-800/80 border border-slate-700/70 px-3 py-1.5 rounded-lg text-xs hover:border-slate-600 transition cursor-pointer"
              onClick={() => setActiveView('inventory')}
              title="Total warehouse inventory valuation at true landed cost"
            >
              <div className="w-6 h-6 rounded-md bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <DollarSign className="w-3.5 h-3.5" />
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] leading-tight">Valuation</span>
                <span className="font-semibold text-slate-200">
                  ${totalValuation.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              </div>
            </div>

            {/* Containers at Sea */}
            <div 
              id="stat-containers"
              className="flex items-center space-x-2 bg-slate-800/80 border border-slate-700/70 px-3 py-1.5 rounded-lg text-xs hover:border-slate-600 transition cursor-pointer"
              onClick={() => setActiveView('shipments')}
              title="Inbound ocean freight containers currently in transit"
            >
              <div className="w-6 h-6 rounded-md bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
                <Ship className="w-3.5 h-3.5" />
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] leading-tight">Inbound Freight</span>
                <span className="font-semibold text-cyan-300">{inTransitContainers} Containers</span>
              </div>
            </div>

            {/* Active Production Jobs */}
            <div 
              id="stat-production-jobs"
              className="flex items-center space-x-2 bg-slate-800/80 border border-slate-700/70 px-3 py-1.5 rounded-lg text-xs hover:border-slate-600 transition cursor-pointer"
              onClick={() => setActiveView('production')}
              title="Active print press runs on shop floor"
            >
              <div className="w-6 h-6 rounded-md bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                <Layers className="w-3.5 h-3.5" />
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] leading-tight">Active Press Jobs</span>
                <span className="font-semibold text-indigo-300">{activeJobs} Jobs</span>
              </div>
            </div>

            {/* Stockout Risk Alerts */}
            {criticalStockouts > 0 ? (
              <div 
                id="stat-critical-alerts"
                className="flex items-center space-x-2 bg-rose-500/10 border border-rose-500/30 px-3 py-1.5 rounded-lg text-xs hover:bg-rose-500/20 transition cursor-pointer"
                onClick={() => setActiveView('forecasting')}
                title="Items breaching reorder deadline considering lead time"
              >
                <div className="w-6 h-6 rounded-md bg-rose-500/20 text-rose-400 flex items-center justify-center">
                  <AlertTriangle className="w-3.5 h-3.5 animate-bounce" />
                </div>
                <div>
                  <span className="text-rose-400 block text-[10px] leading-tight">Reorder Alerts</span>
                  <span className="font-bold text-rose-300">{criticalStockouts} Critical</span>
                </div>
              </div>
            ) : (
              <div className="flex items-center space-x-2 bg-slate-800/50 border border-slate-700/50 px-3 py-1.5 rounded-lg text-xs text-slate-400">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                <span>Supply Healthy</span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center space-x-2">
            <button
              id="btn-quick-adjust"
              onClick={onQuickAdjust}
              className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg transition flex items-center gap-1.5"
              title="Quick physical stock count adjustment"
            >
              <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline">Adjust Stock</span>
            </button>

            <button
              id="btn-quick-new-item"
              onClick={onQuickNewItem}
              className="px-3 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition shadow-md shadow-indigo-600/30 flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Item</span>
            </button>

            <button
              id="btn-reset-demo"
              onClick={() => {
                if (window.confirm('Reset all inventory, BOMs, orders, and jobs to clean initial demo data?')) {
                  resetToDefaultData();
                }
              }}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition ml-1"
              title="Reset to fresh demo dataset"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

        </div>
      </div>
    </header>
  );
};
