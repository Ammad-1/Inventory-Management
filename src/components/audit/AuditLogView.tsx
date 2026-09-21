import React, { useState } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { MovementType } from '../../types';
import { 
  History, 
  Search, 
  Filter, 
  Download, 
  ArrowUpRight, 
  ArrowDownRight, 
  RotateCcw,
  CheckCircle2,
  Trash2
} from 'lucide-react';

export const AuditLogView: React.FC = () => {
  const { stockMovements } = useInventory();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<MovementType | 'all'>('all');

  const filteredMovements = stockMovements.filter(m => {
    if (selectedType !== 'all' && m.movementType !== selectedType) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchSku = m.sku.toLowerCase().includes(q);
      const matchName = m.itemName.toLowerCase().includes(q);
      const matchRef = m.referenceId.toLowerCase().includes(q);
      const matchReason = m.reason.toLowerCase().includes(q);
      const matchActor = m.performedBy.toLowerCase().includes(q);
      if (!matchSku && !matchName && !matchRef && !matchReason && !matchActor) return false;
    }
    return true;
  });

  const getMovementBadge = (type: MovementType) => {
    switch (type) {
      case 'po_receipt':
        return <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">PO Receipt</span>;
      case 'production_consume':
        return <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">Press Consumption</span>;
      case 'production_finish':
        return <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Finished Output</span>;
      case 'scrap_waste':
        return <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">Scrap / Defect</span>;
      case 'order_dispatch':
        return <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">Order Dispatch</span>;
      case 'manual_adjustment':
        return <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">Manual Adjust</span>;
      case 'cycle_count':
        return <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">Cycle Count</span>;
    }
  };

  const exportCSV = () => {
    const headers = ['Timestamp', 'SKU', 'Item Name', 'Type', 'Change Qty', 'Balance After', 'Reference', 'Reason', 'Performed By'];
    const rows = filteredMovements.map(m => [
      `"${m.timestamp}"`,
      `"${m.sku}"`,
      `"${m.itemName}"`,
      `"${m.movementType}"`,
      m.quantityChange,
      m.balanceAfter,
      `"${m.referenceId}"`,
      `"${m.reason}"`,
      `"${m.performedBy}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `smartprint_audit_ledger_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div id="audit-log-view-container" className="space-y-6 pb-12">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <History className="w-5 h-5 text-cyan-400" />
            Immutable Stock Movement Audit Ledger
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Full compliance audit trail of container put-away receipts, production press deductions, scrap write-offs, and order dispatches
          </p>
        </div>

        <button
          onClick={exportCSV}
          className="px-3.5 py-2 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg transition flex items-center gap-1.5 self-start sm:self-center"
        >
          <Download className="w-4 h-4 text-cyan-400" />
          <span>Export CSV</span>
        </button>
      </div>

      {/* Filter Controls */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by SKU, item, job/PO reference, reason, operator..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div className="flex items-center space-x-2 text-xs">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-400">Type:</span>
          <select
            value={selectedType}
            onChange={e => setSelectedType(e.target.value as any)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
          >
            <option value="all">All Movements</option>
            <option value="po_receipt">PO Receipt</option>
            <option value="production_consume">Production Consumed</option>
            <option value="production_finish">Finished Goods Output</option>
            <option value="scrap_waste">Scrap & Defect Write-off</option>
            <option value="order_dispatch">Order Fulfillment Dispatch</option>
            <option value="manual_adjustment">Manual Adjustment</option>
            <option value="cycle_count">Cycle Count</option>
          </select>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-800/70 border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Item SKU & Name</th>
                <th className="py-3 px-4">Reference</th>
                <th className="py-3 px-4 text-right">Delta Change</th>
                <th className="py-3 px-4 text-right">Balance After</th>
                <th className="py-3 px-4">Audit Reason & Notes</th>
                <th className="py-3 px-4">Actor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredMovements.map(m => {
                const isPositive = m.quantityChange > 0;

                return (
                  <tr key={m.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                      {m.timestamp}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {getMovementBadge(m.movementType)}
                    </td>
                    <td className="py-3 px-4 max-w-[200px]">
                      <div className="font-mono text-[11px] font-bold text-cyan-300">{m.sku}</div>
                      <div className="font-medium text-white truncate text-[11px]">{m.itemName}</div>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-indigo-300 whitespace-nowrap">
                      {m.referenceId}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap font-mono font-bold">
                      <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs ${
                        isPositive 
                          ? 'bg-emerald-500/10 text-emerald-400' 
                          : 'bg-rose-500/10 text-rose-400'
                      }`}>
                        {isPositive ? (
                          <ArrowUpRight className="w-3 h-3" />
                        ) : (
                          <ArrowDownRight className="w-3 h-3" />
                        )}
                        {isPositive ? `+${m.quantityChange.toLocaleString()}` : m.quantityChange.toLocaleString()}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold text-slate-200 whitespace-nowrap">
                      {m.balanceAfter.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-slate-300 max-w-[260px]">
                      {m.reason}
                    </td>
                    <td className="py-3 px-4 text-slate-400 whitespace-nowrap text-[11px]">
                      {m.performedBy}
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
