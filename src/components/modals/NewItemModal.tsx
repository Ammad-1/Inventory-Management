import React, { useState } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { ItemCategory } from '../../types';
import { X, Package, AlertTriangle } from 'lucide-react';

interface NewItemModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewItemModal: React.FC<NewItemModalProps> = ({ isOpen, onClose }) => {
  const { createItem, inventory } = useInventory();

  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<ItemCategory>('blank');
  const [unit, setUnit] = useState('pcs');
  const [currentStock, setCurrentStock] = useState<number>(1000);
  const [minSafetyStock, setMinSafetyStock] = useState<number>(500);
  const [reorderPoint, setReorderPoint] = useState<number>(1200);
  const [leadTimeDays, setLeadTimeDays] = useState<number>(45);
  const [fobCostUSD, setFobCostUSD] = useState<number>(0.45);
  const [costPerUnit, setCostPerUnit] = useState<number>(0.35);
  const [landedCostPerUnit, setLandedCostPerUnit] = useState<number>(0.58);
  const [cbmPerUnit, setCbmPerUnit] = useState<number>(0.0016);
  const [weightKgPerUnit, setWeightKgPerUnit] = useState<number>(0.35);
  const [location, setLocation] = useState('Aisle A - Pallet Bay 1');
  const [supplierName, setSupplierName] = useState('Zibo Ceramics (China)');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sku.trim() || !name.trim()) return;

    setIsSubmitting(true);
    setError(null);
    const res = await createItem({
      sku: sku.trim().toUpperCase(),
      name: name.trim(),
      category,
      unit,
      currentStock,
      minSafetyStock,
      reorderPoint,
      leadTimeDays,
      fobCostUSD,
      costPerUnit,
      landedCostPerUnit,
      cbmPerUnit,
      weightKgPerUnit,
      location,
      supplierName
    });
    setIsSubmitting(false);

    // Keep the dialog open on failure so the typed values are not lost
    if (!res.success) return setError(res.message);
    onClose();
  };

  // Warn before submitting rather than after: SKUs are unique
  const trimmedSku = sku.trim().toUpperCase();
  const duplicate = trimmedSku
    ? inventory.find(i => i.sku.toUpperCase() === trimmedSku)
    : undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden my-6">
        
        {/* Header */}
        <div className="px-6 py-4.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Add New Inventory Item</h3>
              <p className="text-xs text-slate-400">Register blank drinkware, gift packaging boxes, or printing consumables</p>
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
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">SKU Code *</label>
              <input
                type="text"
                placeholder="e.g. BLANK-MUG-11-RED"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                aria-invalid={!!duplicate}
                aria-describedby={duplicate ? 'sku-duplicate' : undefined}
                className={`w-full bg-slate-50 border rounded-xl px-3 py-2 text-slate-900 font-mono uppercase focus:outline-hidden ${
                  duplicate ? 'border-rose-400 focus:border-rose-500' : 'border-slate-200 focus:border-indigo-500'
                }`}
                required
              />
              {duplicate && (
                <p id="sku-duplicate" className="mt-1 text-xs text-rose-700">
                  Already used by &ldquo;{duplicate.name}&rdquo;. Edit that item or pick a different SKU.
                </p>
              )}
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">Category *</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ItemCategory)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:outline-hidden focus:border-indigo-500"
              >
                <option value="blank">Blank Drinkware / Substrate (Mug, Tote, Bottle)</option>
                <option value="packaging">Box & Packaging (Smashproof Box, Mailer)</option>
                <option value="consumable">Consumable (Sublimation Ink, Paper)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">Product Name / Description *</label>
            <input
              type="text"
              placeholder="e.g. 11oz Ceramic Mug - Glossy Red Outer"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:outline-hidden focus:border-indigo-500"
              required
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">Initial Stock</label>
              <input
                type="number"
                value={currentStock}
                onChange={(e) => setCurrentStock(parseInt(e.target.value) || 0)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 font-bold"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">Unit</label>
              <input
                type="text"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">Reorder Alert Level</label>
              <input
                type="number"
                value={reorderPoint}
                onChange={(e) => setReorderPoint(parseInt(e.target.value) || 0)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">FOB Price ($ USD)</label>
              <input
                type="number"
                step="0.01"
                value={fobCostUSD}
                onChange={(e) => setFobCostUSD(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">Est. Landed Cost (£)</label>
              <input
                type="number"
                step="0.01"
                value={landedCostPerUnit}
                onChange={(e) => setLandedCostPerUnit(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-indigo-700 font-bold"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">Lead Time (Days)</label>
              <input
                type="number"
                value={leadTimeDays}
                onChange={(e) => setLeadTimeDays(parseInt(e.target.value) || 30)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">Warehouse Location</label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">Supplier Name</label>
              <input
                type="text"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

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
              disabled={isSubmitting || !!duplicate}
              className="px-5 py-2 rounded-xl bg-[#1e2738] hover:bg-slate-800 text-white font-bold shadow-md shadow-slate-900/10 disabled:opacity-50"
            >
              {isSubmitting ? 'Creating...' : 'Create Item'}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
