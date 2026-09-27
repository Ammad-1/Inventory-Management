import React from 'react';
import { useInventory } from '../../context/InventoryContext';
import { ActiveView } from '../../types';
import { 
  LayoutDashboard, 
  Package, 
  Ship, 
  FileText, 
  Layers, 
  History 
} from 'lucide-react';

interface TabItem {
  id: ActiveView;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number | string;
  badgeColor?: string;
}

export const TabBar: React.FC = () => {
  const { activeView, setActiveView, inventory, shipments, invoices } = useInventory();

  const lowStockCount = inventory.filter(i => i.currentStock <= i.reorderPoint).length;
  const inTransitCount = shipments.filter(s => s.status === 'on_water' || s.status === 'customs_clearance').length;
  const pendingInvoices = invoices.filter(i => i.stockDeducted === 0).length;

  const tabs: TabItem[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
    },
    {
      id: 'inventory',
      label: 'Inventory Stock',
      icon: Package,
      badge: lowStockCount > 0 ? `${lowStockCount} Low` : undefined,
      badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    },
    {
      id: 'shipments',
      label: 'China Containers & Landed Cost',
      icon: Ship,
      badge: inTransitCount > 0 ? inTransitCount : undefined,
      badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    },
    {
      id: 'xero',
      label: 'Xero Invoicing & Sync',
      icon: FileText,
      badge: pendingInvoices > 0 ? `${pendingInvoices} Pending` : undefined,
      badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    },
    {
      id: 'bom',
      label: 'Print Recipes (BOM)',
      icon: Layers,
    },
    {
      id: 'movements',
      label: 'Stock Movements & Scrap',
      icon: History,
    },
  ];

  return (
    <nav id="app-navigation-tabs" className="bg-slate-900/90 border-b border-slate-800 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto flex items-center space-x-1 overflow-x-auto py-2.5 scrollbar-none">
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
                <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold border ${tab.badgeColor || 'bg-slate-800 text-slate-300 border-slate-700'}`}>
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
