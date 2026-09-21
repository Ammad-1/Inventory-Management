import React, { useState } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { X, FileText, DollarSign, TrendingUp } from 'lucide-react';

interface NewSalesOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewSalesOrderModal: React.FC<NewSalesOrderModalProps> = ({ isOpen, onClose }) => {
  const { inventory, boms, createSalesOrder, setActiveView } = useInventory();

  const finishedGoods = inventory.filter(i => i.category === 'finished_goods');

  const [customerName, setCustomerName] = useState('Venture Tech Partners');
  const [customerEmail, setCustomerEmail] = useState('procurement@venturetech.com');
  const [dueAt, setDueAt] = useState(() => {
    const d = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    return d.toISOString().split('T')[0];
  });

  const [selectedSku, setSelectedSku] = useState(finishedGoods[0]?.sku || 'FG-MUG-11-BLK');
  const [quantity, setQuantity] = useState<number>(1000);
  const [unitPrice, setUnitPrice] = useState<number>(6.50);

  if (!isOpen) return null;

  const currentItem = finishedGoods.find(i => i.sku === selectedSku) || finishedGoods[0];
  const matchingBOM = boms.find(b => b.finishedGoodsSku === selectedSku);
  
  const estimatedUnitCost = matchingBOM 
    ? matchingBOM.ingredients.reduce((s, ing) => s + (ing.quantityRequired * ing.unitCost * (1 + ing.scrapRatePercent / 100)), 0) 
      + matchingBOM.laborCostPerUnit + matchingBOM.overheadCostPerUnit
    : (currentItem?.landedCostPerUnit || 1.80);

  const lineTotal = quantity * unitPrice;
  const totalCost = quantity * estimatedUnitCost;
  const estimatedGrossProfit = lineTotal - totalCost;
  const estimatedGrossMarginPercent = lineTotal > 0 ? (estimatedGrossProfit / lineTotal) * 100 : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentItem) return;

    const orderNumber = `SO-${Math.floor(10000 + Math.random() * 90000)}`;
    const subtotal = lineTotal;
    const tax = subtotal * 0.0825;
    const totalWithTax = subtotal + tax;

    createSalesOrder({
      orderNumber,
      customerName,
      customerEmail,
      status: 'draft',
      xeroSyncStatus: 'pending',
      dueAt,
      items: [
        {
          itemId: currentItem.id,
          sku: currentItem.sku,
          name: currentItem.name,
          quantity,
          unitPrice,
          estimatedUnitCost: parseFloat(estimatedUnitCost.toFixed(2)),
          lineTotal,
          estimatedMargin: parseFloat(estimatedGrossMarginPercent.toFixed(1)),
        }
      ],
      subtotal,
      tax,
      total: totalWithTax,
      estimatedCOGS: totalCost,
      estimatedGrossProfit,
      estimatedGrossMarginPercent,
    });

    onClose();
    setActiveView('orders');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl my-8 animate-in fade-in zoom-in duration-150">
        
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Create Sales Order</h3>
              <p className="text-[11px] text-slate-400">Generate customer invoice & allocate print production</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Customer Account</label>
              <input
                type="text"
                required
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Billing Email</label>
              <input
                type="email"
                required
                value={customerEmail}
                onChange={e => setCustomerEmail(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Delivery Due Date</label>
            <input
              type="date"
              required
              value={dueAt}
              onChange={e => setDueAt(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-semibold mb-1">Product Item</label>
            <select
              value={selectedSku}
              onChange={e => {
                setSelectedSku(e.target.value);
                const bom = boms.find(b => b.finishedGoodsSku === e.target.value);
                if (bom && bom.targetSellPrice) {
                  setUnitPrice(bom.targetSellPrice);
                }
              }}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
            >
              {finishedGoods.map(fg => (
                <option key={fg.sku} value={fg.sku}>
                  [{fg.sku}] {fg.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Order Quantity (pcs)</label>
              <input
                type="number"
                min="1"
                required
                value={quantity}
                onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono font-bold text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Unit Selling Price ($)</label>
              <input
                type="number"
                step="0.05"
                min="0.1"
                required
                value={unitPrice}
                onChange={e => setUnitPrice(parseFloat(e.target.value) || 0)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono font-bold text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          {/* Live Profitability Forecast Box */}
          <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3.5 space-y-2">
            <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider block">
              Estimated Order Margin & BOM Economics:
            </span>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-slate-800 p-2 rounded-lg">
                <span className="text-slate-400 block text-[10px]">Total Revenue</span>
                <span className="font-mono font-bold text-white text-xs mt-0.5 block">
                  ${lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="bg-slate-800 p-2 rounded-lg">
                <span className="text-slate-400 block text-[10px]">Est. BOM Cost</span>
                <span className="font-mono font-bold text-rose-400 text-xs mt-0.5 block">
                  ${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="bg-emerald-500/10 border border-emerald-500/30 p-2 rounded-lg">
                <span className="text-emerald-300 block text-[10px] font-semibold">Gross Margin</span>
                <span className="font-mono font-bold text-emerald-300 text-xs mt-0.5 block">
                  {estimatedGrossMarginPercent.toFixed(1)}% (${estimatedGrossProfit.toLocaleString(undefined, { minimumFractionDigits: 0 })})
                </span>
              </div>
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
              className="px-5 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition shadow-md shadow-emerald-600/30"
            >
              Confirm Sales Order
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
