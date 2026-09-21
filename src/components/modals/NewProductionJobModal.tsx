import React, { useState } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { X, Printer, Layers, AlertCircle } from 'lucide-react';

interface NewProductionJobModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultBOMId?: string;
  defaultQuantity?: number;
}

export const NewProductionJobModal: React.FC<NewProductionJobModalProps> = ({
  isOpen,
  onClose,
  defaultBOMId,
  defaultQuantity = 1000
}) => {
  const { boms, inventory, createProductionOrder, setActiveView } = useInventory();

  const [selectedBOMId, setSelectedBOMId] = useState<string>(defaultBOMId || boms[0]?.id || '');
  const [targetQuantity, setTargetQuantity] = useState<number>(defaultQuantity);
  const [customerName, setCustomerName] = useState('Stock Replenishment Run');
  const [machineLine, setMachineLine] = useState('Press Station #1 - 4-Head Pneumatic');
  const [operatorName, setOperatorName] = useState('Marcus Vance');
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000);
    return d.toISOString().split('T')[0];
  });
  const [notes, setNotes] = useState('');

  if (!isOpen) return null;

  const currentBOM = boms.find(b => b.id === selectedBOMId) || boms[0];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentBOM) return;

    createProductionOrder({
      bomId: currentBOM.id,
      targetQuantity,
      customerName,
      machineLine,
      operatorName,
      dueDate,
      notes,
    });

    onClose();
    setActiveView('production');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl my-8 animate-in fade-in zoom-in duration-150">
        
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
              <Printer className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Launch Production Work Order</h3>
              <p className="text-[11px] text-slate-400">Reserve inventory & schedule job card on print line</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Select BOM Recipe</label>
            <select
              value={selectedBOMId}
              onChange={e => setSelectedBOMId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            >
              {boms.map(bom => (
                <option key={bom.id} value={bom.id}>
                  {bom.name} (Output: {bom.finishedGoodsSku})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Target Batch Quantity (pcs)</label>
              <input
                type="number"
                min="1"
                required
                value={targetQuantity}
                onChange={e => setTargetQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono font-bold text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Target Due Date</label>
              <input
                type="date"
                required
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Machine / Station Line</label>
              <select
                value={machineLine}
                onChange={e => setMachineLine(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="Press Station #1 - 4-Head Pneumatic">Press Station #1 - 4-Head Pneumatic</option>
                <option value="Press Station #2 - Dual Shuttle Press">Press Station #2 - Dual Shuttle Press</option>
                <option value="Convection Tunnel B - Continuous Line">Convection Tunnel B - Continuous Line</option>
                <option value="Manual Heat Press Station #3">Manual Heat Press Station #3</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Assigned Press Operator</label>
              <input
                type="text"
                required
                value={operatorName}
                onChange={e => setOperatorName(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Customer / Order Reference</label>
            <input
              type="text"
              placeholder="e.g. Apex Global Financial Inc. or Stock Replenishment"
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Allocation Preview Box */}
          {currentBOM && (
            <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3.5 space-y-2">
              <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">
                Automatic Material Reservations:
              </span>
              <div className="space-y-1.5">
                {currentBOM.ingredients.map((ing, idx) => {
                  const scrapFactor = 1 + (ing.scrapRatePercent / 100);
                  const required = Math.ceil(ing.quantityRequired * targetQuantity * scrapFactor);
                  const invItem = inventory.find(i => i.id === ing.itemId || i.sku === ing.sku);
                  const available = invItem ? invItem.currentStock - invItem.reservedStock : 0;
                  const isLow = available < required;

                  return (
                    <div key={idx} className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-300 font-medium">
                        {ing.itemName} (+{ing.scrapRatePercent}% scrap)
                      </span>
                      <span className="font-mono">
                        <strong className="text-cyan-300">{required.toLocaleString()} {ing.unit}</strong>
                        {' / '}
                        <span className={isLow ? 'text-rose-400 font-bold' : 'text-slate-400'}>
                          {available.toLocaleString()} avail
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Special Operator Notes</label>
            <textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. 210°C press temp, 190 sec dwell time, inspect for rim edge bleeding"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

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
              className="px-5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition shadow-md shadow-indigo-600/30"
            >
              Confirm & Launch Run
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
