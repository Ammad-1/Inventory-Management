import React, { useState } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { DefectReason } from '../../types';
import { Trash2, X, AlertCircle, CheckCircle2 } from 'lucide-react';

interface LogScrapModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedItemId?: string;
}

export const LogScrapModal: React.FC<LogScrapModalProps> = ({ isOpen, onClose, preselectedItemId }) => {
  const { inventory, logScrap } = useInventory();

  const [itemId, setItemId] = useState<string>(preselectedItemId || (inventory[0]?.id || ''));
  const [quantity, setQuantity] = useState<number | string>(1);
  const [defectReason, setDefectReason] = useState<DefectReason>('heat_press_breakage');
  const [jobReference, setJobReference] = useState<string>('');
  const [operatorName, setOperatorName] = useState<string>('Press Operator 1');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  const selectedItem = inventory.find(i => i.id === (itemId || preselectedItemId));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemId) {
      setStatusMessage({ type: 'error', text: 'Please select an item' });
      return;
    }

    const parsedQty = typeof quantity === 'string' ? (parseInt(quantity) || 0) : quantity;
    if (parsedQty <= 0) {
      setStatusMessage({ type: 'error', text: 'Quantity must be at least 1' });
      return;
    }

    setIsSubmitting(true);
    setStatusMessage(null);

    const res = await logScrap({
      itemId,
      quantity: parsedQty,
      defectReason,
      jobReference: jobReference.trim() || undefined,
      operatorName: operatorName.trim() || undefined,
      notes: notes.trim() || undefined
    });

    setIsSubmitting(false);

    if (res.success) {
      setStatusMessage({ type: 'success', text: res.message });
      setTimeout(() => {
        setStatusMessage(null);
        onClose();
      }, 1200);
    } else {
      setStatusMessage({ type: 'error', text: res.message });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
              <Trash2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Record Factory Scrap & Defect</h3>
              <p className="text-xs text-slate-400">Immediately write off damaged items to maintain 100% accurate physical inventory</p>
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
          
          {statusMessage && (
            <div className={`p-3 rounded-xl font-medium flex items-center space-x-2 ${
              statusMessage.type === 'success' 
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' 
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}>
              {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />}
              <span>{statusMessage.text}</span>
            </div>
          )}

          {/* Item Selector */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">
              Damaged Item *
            </label>
            <select
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-hidden focus:border-indigo-500"
              required
            >
              <option value="">-- Select an item --</option>
              {inventory.map(item => (
                <option key={item.id} value={item.id}>
                  {item.sku} - {item.name} (Stock: {item.currentStock} {item.unit})
                </option>
              ))}
            </select>
            {selectedItem && (
              <p className="text-[11px] text-slate-500 mt-1">
                Current Stock: <strong className="text-slate-900">{selectedItem.currentStock} {selectedItem.unit}</strong> &bull; Landed Cost: <strong className="text-indigo-600">£{selectedItem.landedCostPerUnit?.toFixed(2)}</strong>
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">
                Scrap Quantity (Units) *
              </label>
              <input
                type="number"
                min="1"
                max={selectedItem?.currentStock || 99999}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 font-bold focus:outline-hidden focus:border-indigo-500"
                required
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">
                Defect Reason *
              </label>
              <select
                value={defectReason}
                onChange={(e) => setDefectReason(e.target.value as DefectReason)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-hidden focus:border-indigo-500"
              >
                <option value="heat_press_breakage">Thermal Crack Under Heat Press</option>
                <option value="print_misaligned">Misaligned / Off-Center Print</option>
                <option value="chipped_in_transit">Chipped / Broken in Carton</option>
                <option value="ink_smear">Ink Smear / Ghosting</option>
                <option value="handling_scratch">Handling Scratch / Impact</option>
                <option value="other">Other Factory Defect</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">
                Job / Invoice Reference (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. INV-1093 or Manchester Run"
                value={jobReference}
                onChange={(e) => setJobReference(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:outline-hidden focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">
                Operator
              </label>
              <input
                type="text"
                value={operatorName}
                onChange={(e) => setOperatorName(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:outline-hidden focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">
              Additional Notes (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Pneumatic pressure too high on station 2"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:outline-hidden focus:border-indigo-500"
            />
          </div>

          {selectedItem && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between text-xs">
              <span className="text-slate-600">Landed Financial Loss:</span>
              <span className="font-extrabold text-rose-700">
                £{((selectedItem.landedCostPerUnit || selectedItem.costPerUnit || 0) * (typeof quantity === 'string' ? (parseInt(quantity) || 0) : quantity)).toFixed(2)}
              </span>
            </div>
          )}

          {/* Footer */}
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
              className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold shadow-md shadow-rose-600/20 disabled:opacity-50"
            >
              {isSubmitting ? 'Recording...' : 'Confirm Scrap & Deduct'}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
