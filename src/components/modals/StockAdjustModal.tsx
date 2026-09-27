import React, { useState, useEffect } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { InventoryItem } from '../../types';
import { X, Package, Plus, Minus } from 'lucide-react';

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
  const [quantityValue, setQuantityValue] = useState<number | string>(100);
  const [notes, setNotes] = useState<string>('Warehouse physical stock count');
  const [operatorName, setOperatorName] = useState<string>('Stock Supervisor');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  useEffect(() => {
    if (preselectedItem) {
      setSelectedItemId(preselectedItem.id);
    } else if (inventory.length > 0 && !selectedItemId) {
      setSelectedItemId(inventory[0].id);
    }
  }, [preselectedItem, inventory]);

  if (!isOpen) return null;

  const currentItem = inventory.find(i => i.id === selectedItemId) || inventory[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentItem) return;

    const parsedQty = typeof quantityValue === 'string' ? (parseInt(quantityValue) || 0) : quantityValue;
    if (parsedQty <= 0 && adjustType !== 'set_absolute') return;

    let delta = 0;
    if (adjustType === 'add') {
      delta = parsedQty;
    } else if (adjustType === 'remove') {
      delta = -Math.abs(parsedQty);
    } else {
      delta = parsedQty - currentItem.currentStock;
    }

    setIsSubmitting(true);
    await adjustStock(currentItem.id, delta, notes, operatorName);
    setIsSubmitting(false);
    onClose();
  };

  const numericQty = typeof quantityValue === 'string' ? (parseInt(quantityValue) || 0) : quantityValue;
  const resultingStock = currentItem
    ? adjustType === 'add'
      ? currentItem.currentStock + numericQty
      : adjustType === 'remove'
      ? Math.max(0, currentItem.currentStock - numericQty)
      : numericQty
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Adjust Physical Stock</h3>
              <p className="text-xs text-slate-400">Manual stock in for local supplier deliveries or stocktake cycle counts</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          
          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">
              Select Item *
            </label>
            <select
              value={selectedItemId}
              onChange={(e) => setSelectedItemId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-hidden focus:border-indigo-500"
              required
            >
              {inventory.map(item => (
                <option key={item.id} value={item.id}>
                  {item.sku} - {item.name} (Stock: {item.currentStock} {item.unit})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">Adjustment Type</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setAdjustType('add')}
                className={`py-2 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 transition-all ${
                  adjustType === 'add'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Stock In (+)</span>
              </button>

              <button
                type="button"
                onClick={() => setAdjustType('remove')}
                className={`py-2 px-3 rounded-xl font-bold flex items-center justify-center gap-1.5 transition-all ${
                  adjustType === 'remove'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Minus className="w-3.5 h-3.5" />
                <span>Stock Out (-)</span>
              </button>

              <button
                type="button"
                onClick={() => setAdjustType('set_absolute')}
                className={`py-2 px-3 rounded-xl font-bold transition-all ${
                  adjustType === 'set_absolute'
                    ? 'bg-[#1e2738] text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Set Exact Count
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">
                {adjustType === 'set_absolute' ? 'New Exact Stock' : 'Units to Adjust'} *
              </label>
              <input
                type="number"
                min="1"
                value={quantityValue}
                onChange={(e) => setQuantityValue(e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 font-bold focus:outline-hidden focus:border-indigo-500"
                required
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">New Stock Preview</label>
              <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-mono font-bold text-indigo-700 flex items-center justify-between">
                <span>{currentItem?.currentStock} &rarr;</span>
                <span className="text-slate-900 text-base">{resultingStock} {currentItem?.unit}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">Operator</label>
              <input
                type="text"
                value={operatorName}
                onChange={(e) => setOperatorName(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:outline-hidden focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">Reason / Justification</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:outline-hidden focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl bg-[#1e2738] hover:bg-slate-800 text-white font-bold shadow-md shadow-slate-900/10 disabled:opacity-50"
            >
              {isSubmitting ? 'Updating...' : 'Confirm Adjustment'}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
