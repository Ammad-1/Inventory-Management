import React, { useState } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { ItemCategory } from '../../types';
import { X, Plus, Package } from 'lucide-react';

interface NewItemModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewItemModal: React.FC<NewItemModalProps> = ({ isOpen, onClose }) => {
  const { addItem, suppliers } = useInventory();

  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<ItemCategory>('raw_material');
  const [unit, setUnit] = useState('pcs');
  const [currentStock, setCurrentStock] = useState<number>(1000);
  const [minSafetyStock, setMinSafetyStock] = useState<number>(500);
  const [reorderPoint, setReorderPoint] = useState<number>(1200);
  const [leadTimeDays, setLeadTimeDays] = useState<number>(45);
  const [costPerUnit, setCostPerUnit] = useState<number>(0.75);
  const [landedCostPerUnit, setLandedCostPerUnit] = useState<number>(0.98);
  const [dailyBurnRate, setDailyBurnRate] = useState<number>(50);
  const [location, setLocation] = useState('Warehouse Dock A - Pallet Rack');
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id || 'SUP-001');
  const [barcode, setBarcode] = useState(() => `84029100${Math.floor(1000 + Math.random() * 9000)}`);
  const [description, setDescription] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!sku.trim() || !name.trim()) return;

    const matchedSupplier = suppliers.find(s => s.id === supplierId);

    addItem({
      sku: sku.trim().toUpperCase(),
      name: name.trim(),
      category,
      unit,
      currentStock,
      reservedStock: 0,
      minSafetyStock,
      maxStock: minSafetyStock * 4,
      reorderPoint,
      leadTimeDays,
      costPerUnit,
      landedCostPerUnit: landedCostPerUnit || costPerUnit,
      location,
      supplierId,
      supplierName: matchedSupplier?.name || 'Local Supplier',
      barcode,
      dailyBurnRate,
      description,
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl my-8 animate-in fade-in zoom-in duration-150">
        
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Add Catalog Item</h3>
              <p className="text-[11px] text-slate-400">Register new raw material, consumable, packaging, or finished good</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">SKU *</label>
              <input
                type="text"
                required
                placeholder="e.g. RM-MUG-12OZ"
                value={sku}
                onChange={e => setSku(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Category</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value as any)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="raw_material">Raw Material (Blanks)</option>
                <option value="consumable">Consumable & Ink</option>
                <option value="packaging">Packaging Material</option>
                <option value="finished_goods">Finished Good</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Item Description / Name *</label>
            <input
              type="text"
              required
              placeholder="e.g. 12oz Ceramic Blank Mug (Matte Black Coated)"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Unit of Measure</label>
              <select
                value={unit}
                onChange={e => setUnit(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="pcs">pcs (Pieces)</option>
                <option value="ml">ml (Milliliters)</option>
                <option value="rolls">rolls</option>
                <option value="boxes">boxes</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Initial Stock</label>
              <input
                type="number"
                min="0"
                value={currentStock}
                onChange={e => setCurrentStock(parseInt(e.target.value) || 0)}
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

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">FOB Unit Cost ($)</label>
              <input
                type="number"
                step="0.01"
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
                step="0.01"
                min="0"
                value={landedCostPerUnit}
                onChange={e => setLandedCostPerUnit(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

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
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Primary Supplier</label>
              <select
                value={supplierId}
                onChange={e => setSupplierId(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.country} - {s.leadTimeDays}d lead)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Bin Location</label>
              <input
                type="text"
                placeholder="e.g. Warehouse Dock A - Pallet 12"
                value={location}
                onChange={e => setLocation(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
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
              Save Item to Catalog
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
