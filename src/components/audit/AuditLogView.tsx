import React, { useState } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { MovementType } from '../../types';
import { 
  History, 
  Search, 
  Trash2, 
  CheckCircle2, 
  Package, 
  MoreHorizontal,
  X,
  FileText,
  Ship,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp
} from 'lucide-react';

export const AuditLogView: React.FC = () => {
  const { movements } = useInventory();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<MovementType | 'all'>('all');

  const filteredMovements = movements.filter(m => {
    if (filterType !== 'all' && m.movementType !== filterType) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchSku = m.sku.toLowerCase().includes(q);
      const matchName = m.itemName.toLowerCase().includes(q);
      const matchRef = (m.referenceId || '').toLowerCase().includes(q);
      const matchOperator = (m.operatorName || '').toLowerCase().includes(q);
      const matchReason = (m.defectReason || '').toLowerCase().includes(q);
      return matchSku || matchName || matchRef || matchOperator || matchReason;
    }
    return true;
  });

  const getMovementBadge = (type: MovementType) => {
    switch (type) {
      case 'purchase_received':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[10px] font-bold rounded-full bg-blue-50 text-blue-700 border border-blue-200/60">
            <Ship className="w-3 h-3 text-blue-500" />
            China Import
          </span>
        );
      case 'xero_sale_deduct':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[10px] font-bold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60">
            <FileText className="w-3 h-3 text-emerald-500" />
            Xero Sale
          </span>
        );
      case 'scrap_defect':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[10px] font-bold rounded-full bg-rose-50 text-rose-700 border border-rose-200/60">
            <Trash2 className="w-3 h-3 text-rose-500" />
            Press Scrap
          </span>
        );
      case 'manual_adjust':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[10px] font-bold rounded-full bg-purple-50 text-purple-700 border border-purple-200/60">
            Manual Adjust
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 text-[10px] font-bold rounded-full bg-slate-100 text-slate-700 border border-slate-200/60">
            Stocktake
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 pb-12">
      
      {/* Top Banner Card */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
        <div className="flex items-center space-x-2.5 mb-1.5">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
            <History className="w-4 h-4" />
          </div>
          <h2 className="text-xl font-extrabold text-slate-900 font-heading">
            Stock Activity Ledger & Audit Trail
          </h2>
        </div>
        <p className="text-xs text-slate-500 max-w-2xl font-medium">
          Real-time, immutable audit trail recording ocean container stock receipts, automated Xero sales deductions, and press-side scrap write-offs.
        </p>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-[0_2px_10px_rgba(0,0,0,0.03)] flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
              filterType === 'all' 
                ? 'bg-indigo-600 text-white shadow-sm' 
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            All Movements ({movements.length})
          </button>
          <button
            onClick={() => setFilterType('xero_sale_deduct')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
              filterType === 'xero_sale_deduct' 
                ? 'bg-indigo-600 text-white shadow-sm' 
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            Xero Sales
          </button>
          <button
            onClick={() => setFilterType('purchase_received')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
              filterType === 'purchase_received' 
                ? 'bg-indigo-600 text-white shadow-sm' 
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            China Containers
          </button>
          <button
            onClick={() => setFilterType('scrap_defect')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
              filterType === 'scrap_defect' 
                ? 'bg-indigo-600 text-white shadow-sm' 
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            Press Scrap
          </button>
        </div>

        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search reference, SKU, operator, notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200/80 rounded-xl pl-9 pr-8 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:bg-white focus:border-indigo-500 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Movements Table */}
      <div className="bg-white border border-slate-200/80 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/80 border-b border-slate-200/70 text-[11px] text-slate-500 font-semibold uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3.5 font-semibold">Date & Time</th>
                <th className="px-4 py-3.5 font-semibold">SKU & Item Name</th>
                <th className="px-4 py-3.5 font-semibold">Event Type</th>
                <th className="px-4 py-3.5 font-semibold text-right">Delta (pcs)</th>
                <th className="px-4 py-3.5 font-semibold text-right">Balance</th>
                <th className="px-4 py-3.5 font-semibold">Reference</th>
                <th className="px-4 py-3.5 font-semibold">Reason / Notes</th>
                <th className="px-5 py-3.5 font-semibold text-right">Logged By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredMovements.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-slate-400 text-sm">
                    No movements found matching this filter.
                  </td>
                </tr>
              ) : (
                filteredMovements.map(m => {
                  const isPositive = m.quantityDelta > 0;
                  return (
                    <tr key={m.id} className="hover:bg-indigo-50/30 transition-colors">
                      <td className="px-5 py-3.5 font-mono text-[11px] text-slate-500">
                        {new Date(m.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="font-bold text-slate-900 font-mono text-xs">{m.sku}</div>
                        <div className="text-[11px] text-slate-500 line-clamp-1">{m.itemName}</div>
                      </td>

                      <td className="px-4 py-3.5">
                        {getMovementBadge(m.movementType)}
                      </td>

                      <td className="px-4 py-3.5 font-mono text-right">
                        <span className={`font-bold text-xs ${isPositive ? 'text-emerald-600' : 'text-slate-800'}`}>
                          {isPositive ? `+${m.quantityDelta.toLocaleString()}` : m.quantityDelta.toLocaleString()}
                        </span>
                      </td>

                      <td className="px-4 py-3.5 font-mono font-extrabold text-slate-900 text-right text-xs">
                        {m.resultingStock?.toLocaleString()}
                      </td>

                      <td className="px-4 py-3.5 font-mono font-medium text-indigo-700">
                        {m.referenceId || '—'}
                      </td>

                      <td className="px-4 py-3.5 text-slate-600 text-[11px]">
                        {m.defectReason && (
                          <div className="font-bold text-rose-700 mb-0.5">
                            Reason: {m.defectReason.replace(/_/g, ' ')}
                          </div>
                        )}
                        <div>{m.notes || '—'}</div>
                      </td>

                      <td className="px-5 py-3.5 text-right text-slate-500 text-[11px] font-medium">
                        {m.operatorName || 'System'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
