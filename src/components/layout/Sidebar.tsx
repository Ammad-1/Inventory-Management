import React from 'react';
import { useInventory } from '../../context/InventoryContext';
import { ActiveView } from '../../types';
import { 
  LayoutDashboard, 
  Package, 
  Ship, 
  FileText, 
  Layers, 
  History, 
  Search,
  ChevronDown,
  Printer,
  Sparkles
} from 'lucide-react';

interface SidebarItem {
  id: ActiveView;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number | string;
  badgeColor?: string;
}

export const Sidebar: React.FC = () => {
  const { activeView, setActiveView, inventory, shipments, invoices, movements } = useInventory();

  const lowStockCount = inventory.filter(i => i.currentStock <= i.reorderPoint).length;
  const inTransitCount = shipments.filter(s => s.status === 'on_water' || s.status === 'customs_clearance').length;
  const pendingInvoices = invoices.filter(i => i.stockDeducted === 0).length;

  const navItems: SidebarItem[] = [
    {
      id: 'dashboard',
      label: 'Overview',
      icon: LayoutDashboard,
    },
    {
      id: 'inventory',
      label: 'Stock & Blanks',
      icon: Package,
      badge: lowStockCount > 0 ? lowStockCount : undefined,
      badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
    },
    {
      id: 'shipments',
      label: 'Containers & Transit',
      icon: Ship,
      badge: inTransitCount > 0 ? inTransitCount : undefined,
      badgeColor: 'bg-blue-100 text-blue-800 border-blue-200',
    },
    {
      id: 'xero',
      label: 'Xero Invoices (Sync)',
      icon: FileText,
      badge: pendingInvoices > 0 ? pendingInvoices : undefined,
      badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    },
    {
      id: 'bom',
      label: 'Recipes & Margins',
      icon: Layers,
    },
    {
      id: 'movements',
      label: 'Activity & Scrap Logs',
      icon: History,
    },
  ];

  return (
    <aside className="w-64 bg-white border-r border-slate-200/80 flex flex-col justify-between shrink-0 min-h-screen sticky top-0 h-screen z-30 shadow-[1px_0_10px_rgba(0,0,0,0.02)]">
      
      <div className="p-5">
        {/* Logo / Brand Header */}
        <div className="flex items-center space-x-3 mb-6 cursor-pointer" onClick={() => setActiveView('dashboard')}>
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/25">
            <Printer className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="font-extrabold text-base tracking-tight text-slate-900 flex items-center gap-1.5">
              PrintBerry <span className="text-indigo-600">IQ</span>
            </span>
            <p className="text-[11px] text-slate-400 font-medium">Inventory & Landed Cost</p>
          </div>
        </div>

        {/* Quick Search in Sidebar */}
        <div className="relative mb-6">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search..."
            className="w-full bg-slate-50 border border-slate-200/80 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:bg-white focus:border-indigo-500 transition-all"
          />
        </div>

        {/* Navigation Menu */}
        <nav className="space-y-1.5">
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all border ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700 border-indigo-100 shadow-xs font-bold'
                    : 'bg-transparent border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                    isActive 
                      ? 'bg-indigo-600 text-white border-indigo-700' 
                      : item.badgeColor || 'bg-slate-100 text-slate-700 border-slate-200'
                  }`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* User Profile Card at Bottom (Like Reference Image) */}
      <div className="p-4 border-t border-slate-100 bg-slate-50/50">
        <div className="flex items-center justify-between p-2 rounded-xl hover:bg-white transition-all cursor-pointer">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs shadow-xs border border-indigo-200/50">
              PB
            </div>
            <div>
              <div className="text-xs font-bold text-slate-800">PrintBerry Factory</div>
              <div className="text-[11px] text-slate-400">UK Operations &bull; Admin</div>
            </div>
          </div>
          <ChevronDown className="w-4 h-4 text-slate-400" />
        </div>
      </div>

    </aside>
  );
};
