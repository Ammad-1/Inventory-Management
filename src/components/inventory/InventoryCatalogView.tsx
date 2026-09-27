import React, { useState, useMemo } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { InventoryItem, ItemCategory } from '../../types';
import { 
  Search, 
  Plus, 
  Trash2, 
  AlertTriangle, 
  CheckCircle2, 
  Package, 
  MapPin, 
  TrendingUp,
  Boxes,
  Layers,
  ArrowRightLeft,
  LayoutGrid,
  Table as TableIcon,
  SlidersHorizontal,
  X,
  ShieldCheck,
  Building2,
  DollarSign,
  Upload
}
from 'lucide-react';

interface InventoryCatalogViewProps {
  onOpenAddItem: () => void;
  onOpenImport: () => void;
  onOpenAdjustStock: (item?: InventoryItem) => void;
  onOpenScrapModal: (item?: InventoryItem) => void;
}

type SortOption = 'valuation_desc' | 'stock_desc' | 'sku_asc' | 'landed_desc';

export const InventoryCatalogView: React.FC<InventoryCatalogViewProps> = ({
  onOpenAddItem,
  onOpenImport,
  onOpenAdjustStock,
  onOpenScrapModal,
}) => {
  const { inventory } = useInventory();

  const [selectedCategory, setSelectedCategory] = useState<ItemCategory | 'all'>('all');
  const [stockFilter, setStockFilter] = useState<'all' | 'low_stock' | 'healthy'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('table');
  const [sortBy, setSortBy] = useState<SortOption>('valuation_desc');

  // Filter & Sort logic
  const filteredItems = useMemo(() => {
    let items = inventory.filter(item => {
      if (selectedCategory !== 'all' && item.category !== selectedCategory) {
        return false;
      }
      if (stockFilter === 'low_stock' && item.currentStock > item.reorderPoint) return false;
      if (stockFilter === 'healthy' && item.currentStock <= item.reorderPoint) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          item.sku.toLowerCase().includes(q) || 
          item.name.toLowerCase().includes(q) || 
          item.location.toLowerCase().includes(q) ||
          item.supplierName.toLowerCase().includes(q)
        );
      }
      return true;
    });

    items = [...items].sort((a, b) => {
      const valA = a.currentStock * (a.landedCostPerUnit || a.costPerUnit || 0);
      const valB = b.currentStock * (b.landedCostPerUnit || b.costPerUnit || 0);

      switch (sortBy) {
        case 'valuation_desc':
          return valB - valA;
        case 'stock_desc':
          return b.currentStock - a.currentStock;
        case 'sku_asc':
          return a.sku.localeCompare(b.sku);
        case 'landed_desc':
          return (b.landedCostPerUnit || 0) - (a.landedCostPerUnit || 0);
        default:
          return 0;
      }
    });

    return items;
  }, [inventory, selectedCategory, stockFilter, searchQuery, sortBy]);

  const totalCatalogValue = inventory.reduce((sum, item) => sum + (item.currentStock * (item.landedCostPerUnit || item.costPerUnit || 0)), 0);
  const totalUnits = inventory.reduce((s, i) => s + i.currentStock, 0);
  const blanksTotal = inventory.filter(i => i.category === 'blank').reduce((s, i) => s + i.currentStock, 0);
  const packagingTotal = inventory.filter(i => i.category === 'packaging').reduce((s, i) => s + i.currentStock, 0);
  const lowStockCount = inventory.filter(i => i.currentStock <= i.reorderPoint).length;

  const getCategoryDetails = (category: ItemCategory) => {
    switch (category) {
      case 'blank':
        return {
          label: 'Blank Drinkware',
          badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200/70',
          dotClass: 'bg-indigo-500'
        };
      case 'packaging':
        return {
          label: 'Packaging & Mailers',
          badgeClass: 'bg-violet-50 text-violet-700 border-violet-200/70',
          dotClass: 'bg-violet-500'
        };
      case 'consumable':
        return {
          label: 'Inks & Consumables',
          badgeClass: 'bg-amber-50 text-amber-700 border-amber-200/70',
          dotClass: 'bg-amber-500'
        };
      default:
        return {
          label: 'General',
          badgeClass: 'bg-slate-50 text-slate-700 border-slate-200',
          dotClass: 'bg-slate-400'
        };
    }
  };

  return (
    <div className="space-y-6 pb-12">
      
      {/* 3 Top KPI Cards (Light Card Theme) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        
        {/* Card 1: Valuation */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] hover:shadow-md transition-all">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2.5">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
                <TrendingUp className="w-4 h-4" />
              </div>
              <span className="text-xs font-semibold text-slate-500">Total Stock Valuation</span>
            </div>
            <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100/80 px-2.5 py-0.5 rounded-full">
              {inventory.length} Active SKUs
            </span>
          </div>

          <div className="text-3xl font-extrabold text-slate-900 tracking-tight font-heading">
            £{totalCatalogValue.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium mt-2 pt-2 border-t border-slate-100">
            <span className="text-emerald-600 font-semibold">True Landed Cost</span>
            <span>&bull;</span>
            <span>Includes China FOB, ocean freight & duty</span>
          </div>
        </div>

        {/* Card 2: Units On Hand */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] hover:shadow-md transition-all">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2.5">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
                <Boxes className="w-4 h-4" />
              </div>
              <span className="text-xs font-semibold text-slate-500">Warehouse Units On Hand</span>
            </div>
            <span className="text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-100/80 px-2.5 py-0.5 rounded-full">
              {blanksTotal.toLocaleString()} Blanks
            </span>
          </div>

          <div className="text-3xl font-extrabold text-slate-900 tracking-tight font-heading">
            {totalUnits.toLocaleString()} <span className="text-lg font-bold text-slate-500 font-sans">units</span>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium mt-2 pt-2 border-t border-slate-100">
            <span>{blanksTotal.toLocaleString()} mugs</span>
            <span>&bull;</span>
            <span>{packagingTotal.toLocaleString()} boxes</span>
            <span>&bull;</span>
            <span>Consumables</span>
          </div>
        </div>

        {/* Card 3: Stock Health */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] hover:shadow-md transition-all">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2.5">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center border ${
                lowStockCount > 0 
                  ? 'bg-amber-50 text-amber-600 border-amber-100' 
                  : 'bg-emerald-50 text-emerald-600 border-emerald-100'
              }`}>
                {lowStockCount > 0 ? <AlertTriangle className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
              </div>
              <span className="text-xs font-semibold text-slate-500">Reorder Safety Level</span>
            </div>
            <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
              lowStockCount > 0 
                ? 'bg-amber-50 text-amber-700 border-amber-200' 
                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
            }`}>
              {lowStockCount > 0 ? `${lowStockCount} Action Required` : '100% In Stock'}
            </span>
          </div>

          <div className={`text-2xl font-extrabold tracking-tight font-heading ${
            lowStockCount > 0 ? 'text-amber-600' : 'text-emerald-600'
          }`}>
            {lowStockCount > 0 ? `${lowStockCount} SKUs Need Reorder` : 'All Stock Healthy'}
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium mt-2 pt-2 border-t border-slate-100">
            <span>45-day China sea freight transit buffer maintained</span>
          </div>
        </div>

      </div>

      {/* Filter, Search & View Controls Bar */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-[0_2px_10px_rgba(0,0,0,0.03)] space-y-3">
        
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          
          {/* Category Tabs */}
          <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 lg:pb-0 scrollbar-none">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                selectedCategory === 'all' 
                  ? 'bg-indigo-600 text-white shadow-sm' 
                  : 'bg-slate-50 text-slate-600 border border-slate-200/80 hover:bg-slate-100'
              }`}
            >
              All Products ({inventory.length})
            </button>
            <button
              onClick={() => setSelectedCategory('blank')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                selectedCategory === 'blank' 
                  ? 'bg-indigo-600 text-white shadow-sm' 
                  : 'bg-slate-50 text-slate-600 border border-slate-200/80 hover:bg-slate-100'
              }`}
            >
              Blanks & Drinkware ({inventory.filter(i => i.category === 'blank').length})
            </button>
            <button
              onClick={() => setSelectedCategory('packaging')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                selectedCategory === 'packaging' 
                  ? 'bg-indigo-600 text-white shadow-sm' 
                  : 'bg-slate-50 text-slate-600 border border-slate-200/80 hover:bg-slate-100'
              }`}
            >
              Boxes & Packaging ({inventory.filter(i => i.category === 'packaging').length})
            </button>
            <button
              onClick={() => setSelectedCategory('consumable')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                selectedCategory === 'consumable' 
                  ? 'bg-indigo-600 text-white shadow-sm' 
                  : 'bg-slate-50 text-slate-600 border border-slate-200/80 hover:bg-slate-100'
              }`}
            >
              Inks & Consumables ({inventory.filter(i => i.category === 'consumable').length})
            </button>
          </div>

          {/* Right Action: Add Item Button */}
          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={onOpenAddItem}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add New Product</span>
            </button>

            <button
              onClick={onOpenImport}
              className="ml-2 flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold shadow-xs transition-all cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Import spreadsheet</span>
            </button>
          </div>
        </div>

        {/* Secondary controls: Search, Health filter, Sort, and View Toggle */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-2 border-t border-slate-100">
          
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by SKU, product name, aisle location or supplier..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200/80 rounded-xl pl-9 pr-8 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:bg-white focus:border-indigo-500 transition-all"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            
            {/* Stock status filter */}
            <div className="flex items-center space-x-1 bg-slate-50 p-1 rounded-xl border border-slate-200/80 text-xs">
              <button
                onClick={() => setStockFilter('all')}
                className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                  stockFilter === 'all' ? 'bg-white text-slate-900 shadow-xs font-bold' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                All Status
              </button>
              <button
                onClick={() => setStockFilter('healthy')}
                className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                  stockFilter === 'healthy' ? 'bg-white text-emerald-700 shadow-xs font-bold' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Optimal
              </button>
              <button
                onClick={() => setStockFilter('low_stock')}
                className={`px-2.5 py-1 rounded-lg font-medium transition-all cursor-pointer ${
                  stockFilter === 'low_stock' ? 'bg-white text-amber-700 shadow-xs font-bold' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Low Stock
              </button>
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center space-x-1.5 bg-slate-50 border border-slate-200/80 rounded-xl px-3 py-1.5 text-xs text-slate-700">
              <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="bg-transparent font-medium focus:outline-hidden cursor-pointer"
              >
                <option value="valuation_desc">Highest Valuation</option>
                <option value="stock_desc">Highest Stock Quantity</option>
                <option value="sku_asc">SKU Code (A-Z)</option>
                <option value="landed_desc">Unit Landed Cost</option>
              </select>
            </div>

            {/* View Mode Toggle: Cards vs Table */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200/80">
              <button
                onClick={() => setViewMode('table')}
                title="Table View"
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  viewMode === 'table' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-400 hover:text-slate-700'
                }`}
              >
                <TableIcon className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('cards')}
                title="Card Grid View"
                className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                  viewMode === 'cards' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-400 hover:text-slate-700'
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>

          </div>

        </div>

      </div>

      {/* Main View Area: Card Grid View OR High-End Table View */}
      {viewMode === 'cards' ? (
        /* CARD GRID VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filteredItems.length === 0 ? (
            <div className="col-span-full bg-white border border-slate-200/80 rounded-2xl p-12 text-center text-slate-400 text-sm">
              No inventory items found matching your filters.
            </div>
          ) : (
            filteredItems.map(item => {
              const cat = getCategoryDetails(item.category);
              const isLow = item.currentStock <= item.reorderPoint;
              const itemValuation = item.currentStock * (item.landedCostPerUnit || item.costPerUnit || 0);
              const stockRatio = Math.min(100, Math.round((item.currentStock / (item.reorderPoint * 3)) * 100));

              return (
                <div 
                  key={item.id}
                  className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] hover:-translate-y-0.5 transition-all duration-200 flex flex-col justify-between"
                >
                  <div>
                    {/* Header: Category Badge & SKU */}
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold border ${cat.badgeClass}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${cat.dotClass}`}></span>
                        {cat.label}
                      </span>
                      <span className="font-mono text-xs font-bold text-slate-800 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md">
                        {item.sku}
                      </span>
                    </div>

                    {/* Product Name & Description */}
                    <h3 className="font-bold text-slate-900 text-sm tracking-tight line-clamp-1 mb-1 font-heading">
                      {item.name}
                    </h3>
                    <div className="text-xs text-slate-400 flex items-center gap-1 mb-3">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{item.location}</span>
                      <span>&bull;</span>
                      <span className="truncate">{item.supplierName}</span>
                    </div>

                    {/* Stock Gauge Progress Bar */}
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 mb-4">
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="text-slate-500 font-medium">On-Hand Stock</span>
                        <div className="flex items-center gap-1.5">
                          <span className={`font-extrabold font-mono text-sm ${isLow ? 'text-amber-600' : 'text-slate-900'}`}>
                            {item.currentStock.toLocaleString()} {item.unit}
                          </span>
                          {isLow && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800">
                              Low
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="w-full bg-slate-200/80 h-2 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all ${
                            isLow ? 'bg-amber-500' : 'bg-emerald-500'
                          }`}
                          style={{ width: `${Math.max(10, stockRatio)}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1.5">
                        <span>Reorder Trigger: {item.reorderPoint.toLocaleString()}</span>
                        <span>Safety Level: {isLow ? 'Below minimum' : 'Adequate'}</span>
                      </div>
                    </div>

                    {/* 3 Metrics Box */}
                    <div className="grid grid-cols-3 gap-2 text-center text-xs mb-4">
                      <div className="bg-slate-50/70 p-2.5 rounded-xl border border-slate-200">
                        <div className="text-[10px] text-slate-400 uppercase font-semibold">China FOB</div>
                        <div className="font-bold text-slate-700 font-mono mt-0.5">
                          {item.fobCostUSD ? `$${item.fobCostUSD.toFixed(2)}` : '—'}
                        </div>
                      </div>
                      <div className="bg-indigo-50/60 p-2.5 rounded-xl border border-indigo-100">
                        <div className="text-[10px] text-indigo-700 uppercase font-bold">Landed Cost</div>
                        <div className="font-extrabold text-indigo-900 font-mono mt-0.5">
                          £{(item.landedCostPerUnit || item.costPerUnit || 0).toFixed(2)}
                        </div>
                      </div>
                      <div className="bg-slate-50/70 p-2.5 rounded-xl border border-slate-200">
                        <div className="text-[10px] text-slate-400 uppercase font-semibold">Total Asset</div>
                        <div className="font-extrabold text-slate-900 font-mono mt-0.5">
                          £{itemValuation.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                        </div>
                      </div>
                    </div>

                  </div>

                  {/* Actions Footer */}
                  <div className="flex items-center justify-between pt-3 border-t border-slate-100 gap-2">
                    <button
                      onClick={() => onOpenAdjustStock(item)}
                      className="flex-1 py-1.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold border border-slate-200 transition-all text-center cursor-pointer"
                    >
                      Stock In / Adjust
                    </button>
                    <button
                      onClick={() => onOpenScrapModal(item)}
                      className="py-1.5 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold border border-rose-200 transition-all flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Scrap</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* TABLE VIEW (REFINED & EXECUTIVE) */
        <div className="bg-white border border-slate-200/80 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.03)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-200/70 text-[11px] text-slate-500 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3.5 font-semibold">Product & SKU</th>
                  <th className="px-4 py-3.5 font-semibold">Category</th>
                  <th className="px-4 py-3.5 font-semibold">On-Hand Stock</th>
                  <th className="px-4 py-3.5 font-semibold">Warehouse Location</th>
                  <th className="px-4 py-3.5 font-semibold text-right">FOB Price ($)</th>
                  <th className="px-4 py-3.5 font-semibold text-right">Landed Cost (£)</th>
                  <th className="px-4 py-3.5 font-semibold text-right">Stock Valuation (£)</th>
                  <th className="px-5 py-3.5 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-12 text-center text-slate-400 text-sm">
                      No inventory items found matching your filters.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map(item => {
                    const cat = getCategoryDetails(item.category);
                    const isLow = item.currentStock <= item.reorderPoint;
                    const itemValue = item.currentStock * (item.landedCostPerUnit || item.costPerUnit || 0);

                    return (
                      <tr key={item.id} className="hover:bg-indigo-50/30 transition-colors group">
                        
                        {/* Product & SKU */}
                        <td className="px-5 py-4">
                          <div className="font-extrabold text-slate-900 font-mono text-xs">{item.sku}</div>
                          <div className="text-xs text-slate-500 line-clamp-1 mt-0.5 font-medium">{item.name}</div>
                        </td>

                        {/* Category Badge */}
                        <td className="px-4 py-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold border ${cat.badgeClass}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${cat.dotClass}`}></span>
                            {cat.label}
                          </span>
                        </td>

                        {/* Stock Level with indicator */}
                        <td className="px-4 py-4">
                          <div className="flex items-center space-x-1.5">
                            <span className={`font-extrabold font-mono text-[13px] ${isLow ? 'text-amber-600' : 'text-slate-900'}`}>
                              {item.currentStock.toLocaleString()} {item.unit}
                            </span>
                            {isLow && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 font-bold">
                                Low
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 font-medium">
                            Reorder trigger: {item.reorderPoint.toLocaleString()}
                          </div>
                        </td>

                        {/* Location & Supplier */}
                        <td className="px-4 py-4 text-slate-600">
                          <div className="flex items-center space-x-1 font-medium">
                            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">{item.location}</span>
                          </div>
                          <div className="text-[11px] text-slate-400 truncate pl-4.5">{item.supplierName}</div>
                        </td>

                        {/* FOB Price */}
                        <td className="px-4 py-4 font-mono text-slate-600 text-right">
                          {item.fobCostUSD ? `$${item.fobCostUSD.toFixed(2)}` : '—'}
                        </td>

                        {/* Landed Cost */}
                        <td className="px-4 py-4 font-mono text-right">
                          <span className="font-extrabold text-indigo-700 bg-indigo-50 border border-indigo-200/80 px-2.5 py-1 rounded-lg text-xs">
                            £{(item.landedCostPerUnit || item.costPerUnit || 0).toFixed(2)}
                          </span>
                        </td>

                        {/* Total Stock Valuation */}
                        <td className="px-4 py-4 font-mono font-bold text-slate-900 text-right text-sm">
                          £{itemValue.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end space-x-1.5">
                            <button
                              onClick={() => onOpenAdjustStock(item)}
                              className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-semibold border border-slate-200 transition-all cursor-pointer shadow-2xs"
                            >
                              Adjust
                            </button>
                            <button
                              onClick={() => onOpenScrapModal(item)}
                              className="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-semibold border border-rose-200 transition-all flex items-center gap-1 cursor-pointer shadow-2xs"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Scrap</span>
                            </button>
                          </div>
                        </td>

                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
};
