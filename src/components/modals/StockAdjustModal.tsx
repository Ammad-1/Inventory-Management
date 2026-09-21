import React, { useState, useEffect } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { InventoryItem, MovementType } from '../../types';
import { X, RotateCcw, AlertTriangle } from 'lucide-react';

interface StockAdjustModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedItem?: InventoryItem;
}

export const StockAdjustModal: React.FC<StockAdjustModalProps> = ({
  isOpen,
  onClose,
  preselectedItem
}) => {
  const { inventory, adjustStock } = useInventory();
  
  const [selectedItemId, setSelectedItemId] = useState<string>('');
  const [adjustType, setAdjustType] = useState<'add' | 'remove' | 'set_absolute'>('add');
  const [quantityValue, setQuantityValue] = useState<number>(100);
  const [reasonCode, setReasonCode] = useState<MovementType>('manual_adjustment');
  const [notes, setNotes] = useState<string>('Routine physical inventory cycle count adjustment');

  useEffect(() => {
    if (preselectedItem) {
      setSelectedItemId(preselectedItem.id);
    } else if (inventory.length > 0 && !selectedItemId) {
      setSelectedItemId(inventory[0].id);
    }
  }, [preselectedItem, inventory]);

  if (!isOpen) return null;

  const currentItem = inventory.find(i => i.id === selectedItemId) || inventory[0];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentItem) return;

    let delta = 0;
    if (adjustType === 'add') {
      delta = quantityValue;
    } else if (adjustType === 'remove') {
      delta = -Math.abs(quantityValue);
    } else {
      // set_absolute
      delta = quantityValue - currentItem.currentStock;
    }

    adjustStock(
      currentItem.id,
      delta,
      notes || 'Manual stock adjustment',
      reasonCode,
      `AUDIT-${new Date().toISOString().split('T')[0]}`
    );

    onClose();
  };

  const resultingBalance = currentItem 
    ? (adjustType === 'add' 
        ? currentItem.currentStock + quantityValue 
        : adjustType === 'remove' 
        ? Math.max(0, currentItem.currentStock - quantityValue) 
        : quantityValue)
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-150">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
              <RotateCcw className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Stock Adjustment</h3>
              <p className="text-[11px] text-slate-400">Record cycle count, shop scrap, or physical count correction</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          
          {/* Select Item */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Target Item</label>
            <select
              value={selectedItemId}
              onChange={e => setSelectedItemId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
            >
              {inventory.map(item => (
                <option key={item.id} value={item.id}>
                  [{item.sku}] {item.name} (Current: {item.currentStock} {item.unit})
                </option>
              ))}
            </select>
          </div>

          {/* Adjustment Mode */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Adjustment Type</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setAdjustType('add')}
                className={`py-2 px-3 rounded-lg font-bold border transition text-center ${
                  adjustType === 'add'
                    ? 'bg-emerald-600/20 text-emerald-300 border-emerald-500'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                }`}
              >
                + Add Units
              </button>
              <button
                type="button"
                onClick={() => setAdjustType('remove')}
                className={`py-2 px-3 rounded-lg font-bold border transition text-center ${
                  adjustType === 'remove'
                    ? 'bg-rose-600/20 text-rose-300 border-rose-500'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                }`}
              >
                − Deduct Units
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdjustType('set_absolute');
                  if (currentItem) setQuantityValue(currentItem.currentStock);
                }}
                className={`py-2 px-3 rounded-lg font-bold border transition text-center ${
                  adjustType === 'set_absolute'
                    ? 'bg-cyan-600/20 text-cyan-300 border-cyan-500'
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                }`}
              >
                Set Exact Count
              </button>
            </div>
          </div>

          {/* Quantity */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1">
              {adjustType === 'set_absolute' ? 'New Physical Count' : 'Units to Adjust'} ({currentItem?.unit})
            </label>
            <input
              type="number"
              min="0"
              value={quantityValue}
              onChange={e => setQuantityValue(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono font-bold text-white focus:outline-none focus:border-cyan-500"
              required
            />
          </div>

          {/* Result Preview Box */}
          {currentItem && (
            <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3 flex items-center justify-between text-xs">
              <div>
                <span className="text-slate-400 block">Current Stock:</span>
                <span className="font-mono font-bold text-slate-200">
                  {currentItem.currentStock.toLocaleString()} {currentItem.unit}
                </span>
              </div>
              <div className="text-right">
                <span className="text-slate-400 block">New Balance After:</span>
                <span className="font-mono font-bold text-emerald-400 text-sm">
                  {resultingBalance.toLocaleString()} {currentItem.unit}
                </span>
              </div>
            </div>
          )}

          {/* Reason Code */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Audit Reason Category</label>
            <select
              value={reasonCode}
              onChange={e => setReasonCode(e.target.value as any)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
            >
              <option value="cycle_count">Cycle Count Discrepancy</option>
              <option value="scrap_waste">Heat Press Breakage / Scrap Waste</option>
              <option value="manual_adjustment">Physical Audit Adjustment</option>
              <option value="order_dispatch">Sample / Test Print Deduct</option>
              <option value="po_receipt">Unrecorded Inbound Delivery</option>
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Audit Notes / Explanation</label>
            <textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Discovered unopened master carton during weekly shelf cycle count"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* Footer */}
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
              className="px-5 py-2 text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition shadow-md shadow-cyan-600/30"
            >
              Commit Adjustment
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
