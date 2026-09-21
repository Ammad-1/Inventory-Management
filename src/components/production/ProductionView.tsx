import React, { useState } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { ProductionOrder, ProductionStatus } from '../../types';
import { 
  Printer, 
  Plus, 
  Play, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  Layers, 
  User, 
  Cpu, 
  CheckSquare,
  XCircle,
  TrendingDown
} from 'lucide-react';

interface ProductionViewProps {
  onOpenNewJob: () => void;
  onOpenCompleteModal: (job: ProductionOrder) => void;
}

export const ProductionView: React.FC<ProductionViewProps> = ({
  onOpenNewJob,
  onOpenCompleteModal
}) => {
  const { productionOrders, updateProductionStatus } = useInventory();
  const [statusFilter, setStatusFilter] = useState<ProductionStatus | 'all'>('all');

  const filteredOrders = productionOrders.filter(job => {
    if (statusFilter === 'all') return true;
    return job.status === statusFilter;
  });

  const getStatusBadge = (status: ProductionStatus) => {
    switch (status) {
      case 'scheduled':
        return <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-slate-800 text-slate-300 border border-slate-700">Scheduled</span>;
      case 'in_progress':
        return <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 animate-pulse">In Progress (Pressing)</span>;
      case 'quality_check':
        return <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">QC & Inspection</span>;
      case 'completed':
        return <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">Completed & Stocked</span>;
      case 'cancelled':
        return <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40">Cancelled</span>;
    }
  };

  return (
    <div id="production-view-container" className="space-y-6 pb-12">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Printer className="w-5 h-5 text-indigo-400" />
            Shop Floor Work Orders & Press Scheduling
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Manage heat press production runs, material reservation, real-time scrap tracking, and finished goods replenishment
          </p>
        </div>

        <button
          onClick={onOpenNewJob}
          className="px-4 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition shadow-md shadow-indigo-600/30 flex items-center gap-1.5 self-start sm:self-center"
        >
          <Plus className="w-4 h-4" />
          <span>Launch Job Run</span>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center space-x-1 overflow-x-auto bg-slate-900 border border-slate-800 p-1.5 rounded-xl">
        {(['all', 'scheduled', 'in_progress', 'quality_check', 'completed'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setStatusFilter(tab)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold capitalize transition whitespace-nowrap ${
              statusFilter === tab
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            {tab.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Production Orders Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredOrders.map(job => {
          const progressPercent = job.targetQuantity > 0 
            ? Math.min(100, Math.round((job.completedQuantity / job.targetQuantity) * 100))
            : 0;

          const scrapRate = job.completedQuantity > 0 
            ? ((job.scrapQuantity / (job.completedQuantity + job.scrapQuantity)) * 100).toFixed(1)
            : '0.0';

          return (
            <div 
              key={job.id} 
              className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-5 flex flex-col justify-between transition shadow-sm"
            >
              <div>
                {/* Header row */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <span className="font-mono text-xs font-bold text-indigo-400">{job.orderNumber}</span>
                  {getStatusBadge(job.status)}
                </div>

                {/* Product Title */}
                <div className="mt-3">
                  <h3 className="text-sm font-bold text-white leading-snug">{job.finishedGoodsName}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Customer: <strong className="text-slate-200">{job.customerName || 'Stock Run'}</strong>
                  </p>
                </div>

                {/* Machine & Operator Info */}
                <div className="mt-3 bg-slate-800/50 rounded-lg p-2.5 space-y-1 text-xs text-slate-300">
                  <div className="flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span className="truncate">{job.machineLine}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span>Operator: {job.operatorName}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                    <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span>Scheduled: {job.scheduledDate} | Due: <strong className="text-slate-200">{job.dueDate}</strong></span>
                  </div>
                </div>

                {/* Progress Bar & Scrap Metrics */}
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-slate-300 mb-1">
                    <span>Output Progress</span>
                    <span className="font-mono font-bold text-indigo-300">
                      {job.completedQuantity.toLocaleString()} / {job.targetQuantity.toLocaleString()} pcs ({progressPercent}%)
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all ${
                        job.status === 'completed' 
                          ? 'bg-emerald-500' 
                          : 'bg-gradient-to-r from-indigo-500 to-cyan-400'
                      }`}
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2">
                    <span className="flex items-center gap-1">
                      <TrendingDown className="w-3 h-3 text-rose-400" />
                      <span>Scrap logged: <strong className="text-rose-400 font-mono">{job.scrapQuantity} pcs</strong></span>
                    </span>
                    <span>Scrap rate: <strong className="text-slate-300">{scrapRate}%</strong></span>
                  </div>
                </div>

                {/* Notes if any */}
                {job.notes && (
                  <p className="text-[11px] text-slate-400 mt-3 italic bg-slate-800/30 p-2 rounded border border-slate-800">
                    "{job.notes}"
                  </p>
                )}
              </div>

              {/* Action Buttons Footer */}
              <div className="mt-5 pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
                {job.status === 'scheduled' && (
                  <button
                    onClick={() => updateProductionStatus(job.id, 'in_progress')}
                    className="w-full py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition flex items-center justify-center gap-1.5"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Start Pressing</span>
                  </button>
                )}

                {job.status === 'in_progress' && (
                  <button
                    onClick={() => updateProductionStatus(job.id, 'quality_check', job.targetQuantity)}
                    className="w-full py-2 text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white rounded-lg transition flex items-center justify-center gap-1.5"
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                    <span>Send to QC & Inspection</span>
                  </button>
                )}

                {job.status === 'quality_check' && (
                  <button
                    onClick={() => onOpenCompleteModal(job)}
                    className="w-full py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/20"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Complete & Post to Inventory</span>
                  </button>
                )}

                {job.status === 'completed' && (
                  <div className="w-full text-center py-1.5 text-xs text-emerald-400 font-medium bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                    ✓ Job Finished & Stock Updated
                  </div>
                )}
              </div>

            </div>
          );
        })}
      </div>

    </div>
  );
};
