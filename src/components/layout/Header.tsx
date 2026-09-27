import React from 'react';
import { useInventory } from '../../context/InventoryContext';
import { 
  Bell, 
  Mail, 
  User, 
  Plus, 
  RotateCcw, 
  Trash2, 
  CheckCircle2, 
  FileText 
} from 'lucide-react';

interface HeaderProps {
  onQuickScrap: () => void;
  onQuickAdjust: () => void;
  onQuickInvoice: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onQuickScrap, onQuickAdjust, onQuickInvoice }) => {
  const { activeView, refreshAll, isLoading, xeroStatus } = useInventory();
  const isXeroConnected = !!xeroStatus?.connected;

  const getTitle = () => {
    switch (activeView) {
      case 'dashboard': return 'Overview';
      case 'inventory': return 'Stock & Products';
      case 'shipments': return 'Containers & China Shipments';
      case 'ecommerce': return 'Online Stores';
      case 'xero': return 'Xero Invoicing (2-Way Sync)';
      case 'bom': return 'Print Recipes & Landed Margins';
      case 'movements': return 'Stock Ledger & Activity';
      default: return 'Dashboard';
    }
  };

  const getSubtitle = () => {
    switch (activeView) {
      case 'dashboard': return 'Clear, intuitive overview of warehouse stock valuation, container arrivals, and true profit margins.';
      case 'inventory': return 'Manage blank mugs, canvas tote bags, packaging boxes, and printing consumables.';
      case 'shipments': return 'Ocean freight tracking, UK customs clearance, and CBM volume-based landed cost calculations.';
      case 'ecommerce': return 'Shopify, Amazon, eBay, and TikTok order intake with automatic BOM explosion and stock deduction.';
      case 'xero': return 'Free two-way invoice synchronization with automated stock deductions.';
      case 'bom': return 'Itemized print recipes with gross margin analytics and heat-press defect allowance (+2.5%).';
      case 'movements': return 'Full audit trail of container receipts, Xero sales deductions, and factory scrap logs.';
      default: return '';
    }
  };

  return (
    <header className="px-4 sm:px-6 lg:px-8 py-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight font-heading">{getTitle()}</h1>
        <p className="text-xs text-slate-500 mt-1 font-medium max-w-2xl">{getSubtitle()}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        {/* Xero Connection Pill - reflects the real OAuth connection state */}
        <div
          className={`hidden sm:flex items-center space-x-2 px-3 py-1.5 rounded-full text-xs font-semibold shadow-xs ${
            isXeroConnected
              ? 'bg-emerald-50 border border-emerald-200/80 text-emerald-800'
              : 'bg-slate-50 border border-slate-200 text-slate-600'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              isXeroConnected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
            }`}
          ></span>
          <span>{isXeroConnected ? 'Xero Connected' : 'Xero Not Connected'}</span>
        </div>

        {/* Action Button: Log Scrap */}
        <button
          onClick={onQuickScrap}
          className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold shadow-xs transition-all active:scale-95 cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Log Scrap</span>
        </button>

        {/* Action Button: Stock In */}
        <button
          onClick={onQuickAdjust}
          className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/90 text-xs font-semibold shadow-xs transition-all active:scale-95 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5 text-indigo-600" />
          <span>Stock In</span>
        </button>

        {/* Primary Action Button: New Xero Invoice */}
        <button
          onClick={onQuickInvoice}
          className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition-all active:scale-95 cursor-pointer"
        >
          <FileText className="w-3.5 h-3.5 text-indigo-200" />
          <span>New Xero Invoice</span>
        </button>

        {/* Refresh Round Icon */}
        <button
          onClick={() => refreshAll()}
          className={`w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:border-slate-300 shadow-xs transition-all active:scale-95 cursor-pointer ${
            isLoading ? 'animate-spin text-indigo-600' : ''
          }`}
          title="Refresh Data"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
