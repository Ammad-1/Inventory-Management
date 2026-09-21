import React, { useState, useEffect } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { InventoryItem } from '../../types';
import { X, Edit3 } from 'lucide-react';

interface EditItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: InventoryItem | null;
}

export const EditItemModal: React.FC<EditItemModalProps> = ({ isOpen, onClose, item }) => {
  const { updateItem } = useInventory();

  const [name, setName] = useState('');
  const [minSafetyStock, setMinSafetyStock] = useState<number>(0);
  const [reorderPoint, setReorderPoint] = useState<number>(0);
  const [leadTimeDays, setLeadTimeDays] = useState<number>(0);
  const [costPerUnit, setCostPerUnit] = useState<number>(0);
  const [landedCostPerUnit, setLandedCostPerUnit] = useState<number>(0);
  const [dailyBurnRate, setDailyBurnRate] = useState<number>(0);
  const [location, setLocation] = useState('');

  useEffect(() => {
    if (item) {
      setName(item.name);
      setMinSafetyStock(item.minSafetyStock);
      setReorderPoint(item.reorderPoint);
      setLeadTimeDays(item.leadTimeDays);
      setCostPerUnit(item.costPerUnit);
      setLandedCostPerUnit(item.landedCostPerUnit);
      setDailyBurnRate(item.dailyBurnRate);
      setLocation(item.location);
    }
  }, [item]);

  if (!isOpen || !item) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateItem(item.id, {
      name,
      minSafetyStock,
      reorderPoint,
      leadTimeDays,
      costPerUnit,
      landedCostPerUnit,
      dailyBurnRate,
      location,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-150">
        
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
              <Edit3 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Edit Item: {item.sku}</h3>
              <p className="text-[11px] text-slate-400">Update cost parameters, lead time, and safety thresholds</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          
          <div>
            <label className="block text-slate-300 font-semibold mb-1">Item Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">FOB Unit Cost ($)</label>
              <input
                type="number"
                step="0.001"
                min="0"
                value={costPerUnit}
                onChange={e => setCostPerUnit(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Landed Cost ($)</label>
              <input
                type="number"
                step="0.001"
                min="0"
                value={landedCostPerUnit}
                onChange={e => setLandedCostPerUnit(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Lead Time (Days)</label>
              <input
                type="number"
                min="1"
                value={leadTimeDays}
                onChange={e => setLeadTimeDays(parseInt(e.target.value) || 1)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Reorder Point</label>
              <input
                type="number"
                min="0"
                value={reorderPoint}
                onChange={e => setReorderPoint(parseInt(e.target.value) || 0)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Daily Burn Rate</label>
              <input
                type="number"
                min="1"
                value={dailyBurnRate}
                onChange={e => setDailyBurnRate(parseInt(e.target.value) || 1)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Location</label>
            <input
              type="text"
              value={location}
              onChange={e => setLocation(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
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
              Update Item
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
