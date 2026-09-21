import React, { useState } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { ProductionOrder } from '../../types';
import { X, CheckCircle2, AlertTriangle, TrendingDown } from 'lucide-react';

interface CompleteJobModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: ProductionOrder | null;
}

export const CompleteJobModal: React.FC<CompleteJobModalProps> = ({
  isOpen,
  onClose,
  job
}) => {
  const { completeProductionOrder } = useInventory();

  const [completedQty, setCompletedQty] = useState<number>(job?.targetQuantity || 1000);
  const [scrapQty, setScrapQty] = useState<number>(25);

  if (!isOpen || !job) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    completeProductionOrder(job.id, completedQty, scrapQty);
    onClose();
  };

  const scrapRate = completedQty + scrapQty > 0 
    ? ((scrapQty / (completedQty + scrapQty)) * 100).toFixed(1)
    : '0.0';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-150">
        
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Complete Job: {job.orderNumber}</h3>
              <p className="text-[11px] text-slate-400">Post finished goods to stock & deduct raw materials</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          
          <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/60 space-y-1">
            <div className="text-slate-400">Product: <strong className="text-white">{job.finishedGoodsName}</strong></div>
            <div className="text-slate-400">Target Run: <strong className="text-cyan-300 font-mono">{job.targetQuantity.toLocaleString()} pcs</strong></div>
            <div className="text-slate-400">Line: <strong className="text-slate-200">{job.machineLine}</strong></div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Passed Quality Units (Added to Stock)
              </label>
              <input
                type="number"
                min="0"
                required
                value={completedQty}
                onChange={e => setCompletedQty(parseInt(e.target.value) || 0)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono font-bold text-emerald-400 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">
                Scrap / Defect Units (Waste Loss)
              </label>
              <input
                type="number"
                min="0"
                required
                value={scrapQty}
                onChange={e => setScrapQty(parseInt(e.target.value) || 0)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono font-bold text-rose-400 focus:outline-none focus:border-rose-500"
              />
            </div>
          </div>

          {/* Scrap rate summary badge */}
          <div className="bg-slate-800/40 p-3 rounded-lg flex items-center justify-between text-xs">
            <span className="text-slate-400 flex items-center gap-1">
              <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
              <span>Calculated Scrap Loss Rate:</span>
            </span>
            <span className="font-mono font-bold text-rose-300">{scrapRate}%</span>
          </div>

          <p className="text-[11px] text-slate-400 leading-relaxed">
            Clicking "Finalize & Post to Inventory" will deduct all allocated raw materials and ink volumes from warehouse stock, release reservations, log defect items in the immutable audit ledger, and increment finished goods on hand by <strong className="text-emerald-400">{completedQty.toLocaleString()} units</strong>.
          </p>

          <div className="pt-3 border-t border-slate-800 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white rounded-lg transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition shadow-md shadow-emerald-600/30"
            >
              Finalize & Post to Inventory
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
