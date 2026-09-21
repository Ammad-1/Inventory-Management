import React, { useState, useMemo } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { InventoryItem, ItemCategory, MovementType } from '../../types';
import { 
  Search, 
  Filter, 
  Plus, 
  Edit3, 
  AlertTriangle, 
  CheckCircle2, 
  ArrowUpDown, 
  RotateCcw, 
  Package, 
  MapPin, 
  Truck, 
  DollarSign, 
  Sparkles,
  Barcode,
  Clock,
  Layers
} from 'lucide-react';

interface InventoryCatalogViewProps {
  onOpenAddItem: () => void;
  onOpenAdjustStock: (item?: InventoryItem) => void;
  onOpenEditItem: (item: InventoryItem) => void;
}

export const InventoryCatalogView: React.FC<InventoryCatalogViewProps> = ({
  onOpenAddItem,
  onOpenAdjustStock,
  onOpenEditItem
}) => {
  const { inventory, forecasts, quickReorderFromForecast } = useInventory();

  const [selectedCategory, setSelectedCategory] = useState<ItemCategory | 'all'>('all');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'low_stock' | 'optimal' | 'out_of_stock'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<keyof InventoryItem>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Filter & Search
  const filteredItems = useMemo(() => {
    return inventory.filter(item => {
      // Category filter
      if (selectedCategory !== 'all' && item.category !== selectedCategory) {
        return false;
      }

      // Stock status filter
      const available = item.currentStock - item.reservedStock;
      if (selectedStatus === 'out_of_stock' && item.currentStock > 0) return false;
      if (selectedStatus === 'low_stock' && item.currentStock > item.reorderPoint) return false;
      if (selectedStatus === 'optimal' && item.currentStock <= item.reorderPoint) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchSku = item.sku.toLowerCase().includes(q);
        const matchName = item.name.toLowerCase().includes(q);
        const matchBarcode = item.barcode.toLowerCase().includes(q);
        const matchLocation = item.location.toLowerCase().includes(q);
        const matchSupplier = item.supplierName.toLowerCase().includes(q);
        if (!matchSku && !matchName && !matchBarcode && !matchLocation && !matchSupplier) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];
      if (typeof aVal === 'string') {
        return sortDirection === 'asc' 
          ? (aVal as string).localeCompare(bVal as string) 
          : (bVal as string).localeCompare(aVal as string);
      }
      return sortDirection === 'asc' 
        ? ((aVal as number) - (bVal as number)) 
        : ((bVal as number) - (aVal as number));
    });
  }, [inventory, selectedCategory, selectedStatus, searchQuery, sortField, sortDirection]);

  // Compute category valuations
  const totalValuation = filteredItems.reduce((s, i) => s + (i.currentStock * i.landedCostPerUnit), 0);
  const lowStockCount = filteredItems.filter(i => i.currentStock <= i.reorderPoint).length;

  const handleSort = (field: keyof InventoryItem) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const getCategoryBadge = (cat: ItemCategory) => {
    switch (cat) {
      case 'raw_material':
        return <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">Raw Material</span>;
      case 'consumable':
        return <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">Consumable & Ink</span>;
      case 'packaging':
        return <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">Packaging</span>;
      case 'finished_goods':
        return <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Finished Good</span>;
    }
  };

  return (
    <div id="inventory-catalog-container" className="space-y-5 pb-12">
      
      {/* Top Header & Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Package className="w-5 h-5 text-cyan-400" />
            Inventory Catalog & Material Control
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time stock on hand, WIP reservations, true landed cost, and automated reorder points
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            id="btn-catalog-adjust"
            onClick={() => onOpenAdjustStock()}
            className="px-3 py-2 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg transition flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5 text-cyan-400" />
            <span>Stock Adjustment</span>
          </button>
          <button
            id="btn-catalog-add"
            onClick={onOpenAddItem}
            className="px-4 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition shadow-md shadow-indigo-600/30 flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Item</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
        
        {/* Category Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-800 pb-3">
          <span className="text-xs text-slate-400 mr-2 font-medium">Category:</span>
          {(['all', 'raw_material', 'consumable', 'packaging', 'finished_goods'] as const).map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition ${
                selectedCategory === cat
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              {cat.replace('_', ' ')}
            </button>
          ))}
        </div>

        {/* Search & Stock Status */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-1">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by SKU, item name, barcode, location, supplier..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-800/80 border border-slate-700/80 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition"
            />
          </div>

          <div className="flex items-center space-x-3 text-xs">
            <div className="flex items-center space-x-1.5">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-400">Stock Status:</span>
              <select
                value={selectedStatus}
                onChange={e => setSelectedStatus(e.target.value as any)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
              >
                <option value="all">All Levels</option>
                <option value="low_stock">Low Stock Alerts Only</option>
                <option value="optimal">Healthy / Optimal</option>
                <option value="out_of_stock">Out of Stock (0)</option>
              </select>
            </div>

            <div className="border-l border-slate-800 pl-3 hidden lg:flex items-center space-x-3 text-slate-400">
              <span>Showing: <strong className="text-slate-200">{filteredItems.length}</strong> items</span>
              <span>Valuation: <strong className="text-emerald-400 font-semibold">${totalValuation.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></span>
            </div>
          </div>
        </div>

      </div>

      {/* Items Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-800/70 border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4 cursor-pointer hover:text-white" onClick={() => handleSort('sku')}>
                  <div className="flex items-center gap-1">
                    <span>SKU / Barcode</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3 px-4 cursor-pointer hover:text-white" onClick={() => handleSort('name')}>
                  <div className="flex items-center gap-1">
                    <span>Item Name & Category</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3 px-4 text-right cursor-pointer hover:text-white" onClick={() => handleSort('currentStock')}>
                  <div className="flex items-center justify-end gap-1">
                    <span>Stock Levels</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3 px-4 text-center">
                  <span>Supply Health</span>
                </th>
                <th className="py-3 px-4 text-right cursor-pointer hover:text-white" onClick={() => handleSort('landedCostPerUnit')}>
                  <div className="flex items-center justify-end gap-1">
                    <span>Landed Cost</span>
                    <ArrowUpDown className="w-3 h-3" />
                  </div>
                </th>
                <th className="py-3 px-4 text-right">
                  <span>Total Value</span>
                </th>
                <th className="py-3 px-4">
                  <span>Location / Supplier</span>
                </th>
                <th className="py-3 px-4 text-right">
                  <span>Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredItems.map(item => {
                const available = Math.max(0, item.currentStock - item.reservedStock);
                const daysSupply = item.dailyBurnRate > 0 ? Math.floor(available / item.dailyBurnRate) : 999;
                const isLowStock = item.currentStock <= item.reorderPoint;
                const isCritical = daysSupply <= item.leadTimeDays;
                const itemTotalValue = item.currentStock * item.landedCostPerUnit;

                const forecast = forecasts.find(f => f.itemId === item.id);

                return (
                  <tr key={item.id} className="hover:bg-slate-800/40 transition">
                    
                    {/* SKU & Barcode */}
                    <td className="py-3 px-4 align-top">
                      <div className="font-mono font-bold text-cyan-300 text-xs">{item.sku}</div>
                      <div className="flex items-center gap-1 text-[10px] text-slate-500 mt-0.5">
                        <Barcode className="w-3 h-3" />
                        <span>{item.barcode}</span>
                      </div>
                    </td>

                    {/* Name & Category */}
                    <td className="py-3 px-4 align-top max-w-[260px]">
                      <div className="font-semibold text-white leading-tight">{item.name}</div>
                      <div className="flex items-center gap-2 mt-1">
                        {getCategoryBadge(item.category)}
                        <span className="text-[11px] text-slate-400">Unit: <strong>{item.unit}</strong></span>
                      </div>
                    </td>

                    {/* Stock Levels */}
                    <td className="py-3 px-4 align-top text-right whitespace-nowrap">
                      <div className="font-mono text-sm font-bold text-white">
                        {item.currentStock.toLocaleString()} {item.unit}
                      </div>
                      <div className="text-[11px] text-slate-400 space-x-1.5 mt-0.5">
                        <span>Res: <strong className="text-amber-400">{item.reservedStock.toLocaleString()}</strong></span>
                        <span>•</span>
                        <span>Avail: <strong className="text-emerald-400">{available.toLocaleString()}</strong></span>
                      </div>
                    </td>

                    {/* Supply Health */}
                    <td className="py-3 px-4 align-top text-center whitespace-nowrap">
                      <div className="inline-flex flex-col items-center">
                        <span className={`px-2 py-0.5 text-[11px] font-bold rounded-full border ${
                          isCritical
                            ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse'
                            : isLowStock
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                            : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                        }`}>
                          {daysSupply} Days Supply
                        </span>
                        <span className="text-[10px] text-slate-500 mt-0.5">
                          Burn: {item.dailyBurnRate} {item.unit}/day
                        </span>
                      </div>
                    </td>

                    {/* Landed Cost */}
                    <td className="py-3 px-4 align-top text-right whitespace-nowrap">
                      <div className="font-mono font-bold text-slate-200">
                        ${item.landedCostPerUnit.toFixed(item.category === 'consumable' ? 3 : 2)}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        FOB: ${item.costPerUnit.toFixed(item.category === 'consumable' ? 3 : 2)}
                      </div>
                    </td>

                    {/* Total Value */}
                    <td className="py-3 px-4 align-top text-right whitespace-nowrap">
                      <div className="font-mono font-bold text-emerald-400">
                        ${itemTotalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </td>

                    {/* Location & Supplier */}
                    <td className="py-3 px-4 align-top text-[11px] max-w-[200px]">
                      <div className="flex items-center gap-1 text-slate-300 truncate">
                        <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                        <span className="truncate">{item.location}</span>
                      </div>
                      <div className="flex items-center gap-1 text-slate-400 truncate mt-0.5">
                        <Truck className="w-3 h-3 text-slate-500 shrink-0" />
                        <span className="truncate">{item.supplierName} ({item.leadTimeDays}d)</span>
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 align-top text-right whitespace-nowrap">
                      <div className="flex items-center justify-end space-x-1.5">
                        <button
                          onClick={() => onOpenAdjustStock(item)}
                          className="p-1.5 text-slate-400 hover:text-cyan-300 hover:bg-slate-800 rounded transition"
                          title="Adjust stock count"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => onOpenEditItem(item)}
                          className="p-1.5 text-slate-400 hover:text-indigo-300 hover:bg-slate-800 rounded transition"
                          title="Edit item specifications"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>

                        {isLowStock && forecast && (
                          <button
                            onClick={() => quickReorderFromForecast(forecast)}
                            className="px-2 py-1 text-[10px] font-bold bg-rose-600/90 hover:bg-rose-500 text-white rounded transition shadow-sm flex items-center gap-1"
                            title="Auto-create inbound PO container"
                          >
                            <Sparkles className="w-3 h-3" />
                            <span>Reorder</span>
                          </button>
                        )}
                      </div>
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
