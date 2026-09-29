import React from 'react';
import { useInventory } from '../../context/InventoryContext';
import { useAuth } from '../../context/AuthContext';
import { UsersModal } from '../auth/UsersModal';
import { ActiveView } from '../../types';
import { 
  LayoutDashboard, 
  Package, 
  Ship, 
  FileText, 
  ShoppingBag,
  Layers,
  Tag,
  FileSignature,
  History, 
  Printer,
  User,
  ChevronDown,
  LogOut,
  Users as UsersIcon
} from 'lucide-react';

export const Navbar: React.FC = () => {
  const { activeView, setActiveView, inventory, shipments, invoices, ecommerceOrders } = useInventory();
  const { user, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [usersOpen, setUsersOpen] = React.useState(false);

  /*
   * Close on an outside click via the document rather than a full-screen
   * overlay: the navbar has backdrop-blur, which confines a fixed-position
   * child to the header, so such an overlay would only cover the header.
   */
  const menuRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onEsc);
    };
  }, [menuOpen]);

  const ROLE_LABEL: Record<string, string> = {
    owner: 'Owner', sales: 'Sales', production: 'Production'
  };
  const initials = (user?.name || '?')
    .split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

  const lowStockCount = inventory.filter(i => i.currentStock <= i.reorderPoint).length;
  const inTransitCount = shipments.filter(s => s.status === 'on_water' || s.status === 'customs_clearance').length;
  const pendingInvoices = invoices.filter(i => i.stockDeducted === 0).length;

  const navItems: { id: ActiveView; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number }[] = [
    { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
    { id: 'inventory', label: 'Stock & Blanks', icon: Package, badge: lowStockCount > 0 ? lowStockCount : undefined },
    { id: 'shipments', label: 'Transit', icon: Ship, badge: inTransitCount > 0 ? inTransitCount : undefined },
    { id: 'ecommerce', label: 'Online Stores', icon: ShoppingBag, badge: ecommerceOrders.length > 0 ? ecommerceOrders.length : undefined },
    { id: 'xero', label: 'Xero Sync', icon: FileText, badge: pendingInvoices > 0 ? pendingInvoices : undefined },
    { id: 'products', label: 'Products', icon: Tag },
    { id: 'quotes', label: 'Quotes', icon: FileSignature },
    { id: 'bom', label: 'Recipes', icon: Layers },
    { id: 'movements', label: 'Audit Logs', icon: History },
  ];

  return (
    <nav className="bg-white/95 backdrop-blur-md border-b border-slate-200/80 sticky top-0 z-40 shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
      <div className="max-w-[1560px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo */}
          <div className="flex items-center space-x-3 cursor-pointer shrink-0 group" onClick={() => setActiveView('dashboard')}>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 group-hover:scale-105 transition-transform">
              <Printer className="w-4 h-4 text-white" />
            </div>
            <div className="hidden sm:block">
              <span className="font-extrabold text-sm tracking-tight text-slate-900 flex items-center gap-1.5 font-heading">
                PrintBerry <span className="text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded-md text-xs font-black">IQ</span>
              </span>
            </div>
          </div>

          {/* Center Navigation Links */}
          <div className="hidden md:flex items-center space-x-1.5 flex-1 justify-center overflow-x-auto px-4">
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = activeView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveView(item.id)}
                  className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all duration-150 ${
                    isActive 
                      ? 'bg-indigo-50 text-indigo-700 shadow-xs border border-indigo-200/60 font-bold' 
                      : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50 border border-transparent'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                  {item.badge !== undefined && (
                    <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                      isActive ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 border border-slate-200'
                    }`}>
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Right Profile & Actions */}
          <div className="flex items-center space-x-3 shrink-0">
            <div className="relative" ref={menuRef}>
              <button onClick={() => setMenuOpen(o => !o)}
                className="flex items-center space-x-2.5 p-1.5 pl-2.5 rounded-xl hover:bg-slate-50 transition-all border border-slate-200/60 shadow-xs">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-700 text-white flex items-center justify-center font-bold text-xs shadow-xs">
                  {initials}
                </div>
                <div className="hidden lg:block text-left">
                  <div className="text-xs font-bold text-slate-800 leading-tight">{user?.name}</div>
                  <div className="text-[10px] text-slate-400 font-medium leading-tight">
                    {ROLE_LABEL[user?.role || ''] || user?.role}
                  </div>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
              </button>

              {menuOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 bg-white shadow-lg z-50 overflow-hidden">
                    <div className="px-3 py-2.5 border-b border-slate-100">
                      <div className="text-xs font-bold text-slate-800">{user?.name}</div>
                      <div className="text-[11px] text-slate-500 truncate">{user?.email}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {ROLE_LABEL[user?.role || ''] || user?.role}
                        {user?.role !== 'owner' && ' · cost and profit are hidden'}
                      </div>
                    </div>
                    {user?.role === 'owner' && (
                      <button onClick={() => { setMenuOpen(false); setUsersOpen(true); }}
                        className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                        <UsersIcon className="w-3.5 h-3.5 text-slate-400" /> People &amp; access
                      </button>
                    )}
                    <button onClick={signOut}
                      className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                      <LogOut className="w-3.5 h-3.5 text-slate-400" /> Sign out
                    </button>
                </div>
              )}
            </div>
          </div>
          
        </div>
      </div>
      
      {/* Mobile Navigation (Scrollable) */}
      <div className="md:hidden border-t border-slate-100 bg-slate-50 overflow-x-auto scrollbar-none flex">
         {navItems.map(item => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                className={`flex items-center space-x-1.5 px-4 py-3 text-xs font-semibold whitespace-nowrap transition-all border-b-2 ${
                  isActive 
                    ? 'border-indigo-600 text-indigo-700 bg-white' 
                    : 'border-transparent text-slate-500'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
      </div>

      {usersOpen && <UsersModal onClose={() => setUsersOpen(false)} />}
    </nav>
  );
};
