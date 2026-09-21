import React from 'react';
import { useInventory } from '../../context/InventoryContext';
import { ActiveView } from '../../types';
import { 
  LayoutDashboard, 
  Boxes, 
  FlaskConical, 
  Printer, 
  Ship, 
  FileText, 
  Sparkles, 
  History, 
  Network 
} from 'lucide-react';

interface TabItem {
  id: ActiveView;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number | string;
  badgeColor?: string;
}

export const TabBar: React.FC = () => {
  const { activeView, setActiveView, forecasts, purchaseOrders, productionOrders, salesOrders } = useInventory();

  const criticalAlerts = forecasts.filter(f => f.urgency === 'critical').length;
  const inTransitCount = purchaseOrders.filter(p => p.status === 'in_transit' || p.status === 'customs_clearance').length;
  const activeJobs = productionOrders.filter(j => j.status === 'in_progress' || j.status === 'quality_check').length;
  const pendingOrders = salesOrders.filter(s => s.status === 'draft' || s.status === 'approved').length;

  const tabs: TabItem[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
    },
    {
      id: 'inventory',
      label: 'Inventory Catalog',
      icon: Boxes,
    },
    {
      id: 'bom',
      label: 'BOM & Recipes',
      icon: FlaskConical,
    },
    {
      id: 'production',
      label: 'Production Jobs',
      icon: Printer,
      badge: activeJobs > 0 ? activeJobs : undefined,
      badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
    },
    {
      id: 'shipments',
      label: 'Inbound Containers',
      icon: Ship,
      badge: inTransitCount > 0 ? inTransitCount : undefined,
      badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    },
    {
      id: 'orders',
      label: 'Sales & Invoicing',
      icon: FileText,
      badge: pendingOrders > 0 ? pendingOrders : undefined,
      badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    },
    {
      id: 'forecasting',
      label: 'AI Forecasting',
      icon: Sparkles,
      badge: criticalAlerts > 0 ? `${criticalAlerts} Alert` : undefined,
      badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    },
    {
      id: 'audit_log',
      label: 'Audit Ledger',
      icon: History,
    },
    {
      id: 'reference_architecture',
      label: 'Blueprints',
      icon: Network,
    },
  ];

  return (
    <nav id="app-navigation-tabs" className="bg-slate-900/60 backdrop-blur border-b border-slate-800 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto flex items-center space-x-1 overflow-x-auto py-2 scrollbar-none">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeView === tab.id;
          return (
            <button
              key={tab.id}
              id={`tab-btn-${tab.id}`}
              onClick={() => setActiveView(tab.id)}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-slate-800 text-cyan-300 shadow-sm border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-cyan-400' : 'text-slate-400'}`} />
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span className={`ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] font-bold border ${tab.badgeColor || 'bg-slate-800 text-slate-300 border-slate-700'}`}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
