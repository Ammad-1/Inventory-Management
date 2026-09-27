import React, { useState } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { FileText, X, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';

interface NewXeroInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewXeroInvoiceModal: React.FC<NewXeroInvoiceModalProps> = ({ isOpen, onClose }) => {
  const { recipes, inventory, createXeroInvoice } = useInventory();

  const [customerName, setCustomerName] = useState<string>('');
  const [recipeId, setRecipeId] = useState<string>(recipes[0]?.id || '');
  const [quantity, setQuantity] = useState<number | string>(250);
  const [unitPrice, setUnitPrice] = useState<number | string>(3.60);
  const [customNotes, setCustomNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  const selectedRecipe = recipes.find(r => r.id === recipeId);
  const blankItem = inventory.find(i => i.id === selectedRecipe?.blankItemId);
  const boxItem = inventory.find(i => i.id === selectedRecipe?.packagingItemId);

  const numQuantity = typeof quantity === 'number' ? quantity : (parseInt(quantity) || 0);
  const numUnitPrice = typeof unitPrice === 'number' ? unitPrice : (parseFloat(unitPrice) || 0);

  const totalRevenue = numQuantity * numUnitPrice;
  const blankUnitCost = blankItem?.landedCostPerUnit || blankItem?.costPerUnit || 0;
  const boxUnitCost = boxItem?.costPerUnit || 0;
  const consumablesUnitCost = selectedRecipe?.consumablesCost || 0.05;
  const totalUnitCost = blankUnitCost + boxUnitCost + consumablesUnitCost;
  const totalLandedCost = totalUnitCost * numQuantity;
  const grossProfit = totalRevenue - totalLandedCost;
  const grossMarginPercent = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

  const handleRecipeChange = (newRecipeId: string) => {
    setRecipeId(newRecipeId);
    const rec = recipes.find(r => r.id === newRecipeId);
    if (rec && rec.targetSellPrice > 0) {
      setUnitPrice(rec.targetSellPrice);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName.trim()) {
      setStatusMessage({ type: 'error', text: 'Customer name is required' });
      return;
    }
    if (numQuantity <= 0) {
      setStatusMessage({ type: 'error', text: 'Quantity must be at least 1' });
      return;
    }

    setIsSubmitting(true);
    setStatusMessage(null);

    const res = await createXeroInvoice({
      customerName: customerName.trim(),
      recipeId,
      quantity: numQuantity,
      unitPrice: numUnitPrice,
      customNotes: customNotes.trim() || undefined
    });

    setIsSubmitting(false);

    if (res.success) {
      setStatusMessage({ 
        type: 'success', 
        text: `Xero Invoice #${res.invoiceNumber} created and physical stock deducted successfully!` 
      });
      setTimeout(() => {
        setStatusMessage(null);
        onClose();
      }, 1400);
    } else {
      setStatusMessage({ type: 'error', text: res.message });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Create & Push Invoice to Xero (2-Way)</h3>
              <p className="text-xs text-slate-400">Creates client invoice in Xero (free API) and automatically deducts blanks & packaging</p>
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

          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">
              Customer / Company Name *
            </label>
            <input
              type="text"
              placeholder="e.g. Oxford Event Promotions / TechVibe Ltd"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-hidden focus:border-indigo-500"
              required
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">
              Print Recipe / Product *
            </label>
            <select
              value={recipeId}
              onChange={(e) => handleRecipeChange(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 focus:outline-hidden focus:border-indigo-500"
              required
            >
              <option value="">-- Select a recipe --</option>
              {recipes.map(r => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">
                Quantity (pcs) *
              </label>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value === '' ? '' : (parseInt(e.target.value) || 0))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 font-bold focus:outline-hidden focus:border-indigo-500"
                required
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1.5">
                Selling Price / Unit (£) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value === '' ? '' : e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-900 font-bold focus:outline-hidden focus:border-indigo-500"
                required
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">
              Customer PO / Job Description (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. PO: 4492 - 2-Colour Screenprint, DPD Next Day"
              value={customNotes}
              onChange={(e) => setCustomNotes(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:outline-hidden focus:border-indigo-500"
            />
          </div>

          {/* Live Margin Calculation */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Live Order Profitability & Margin
            </div>
            
            <div className="grid grid-cols-3 gap-2.5 text-center pt-1">
              <div className="bg-white p-2.5 rounded-xl border border-slate-200/70 shadow-2xs">
                <div className="text-[10px] text-slate-400">Total Invoiced</div>
                <div className="text-xs font-bold text-slate-900">£{totalRevenue.toFixed(2)}</div>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-slate-200/70 shadow-2xs">
                <div className="text-[10px] text-slate-400">Landed + Box Cost</div>
                <div className="text-xs font-bold text-amber-700">£{totalLandedCost.toFixed(2)}</div>
              </div>
              <div className="bg-emerald-50 p-2.5 rounded-xl border border-emerald-200/70 shadow-2xs">
                <div className="text-[10px] text-emerald-700 font-semibold">Gross Margin ({grossMarginPercent.toFixed(1)}%)</div>
                <div className="text-xs font-bold text-emerald-700">£{grossProfit.toFixed(2)}</div>
              </div>
            </div>

            {blankItem && (
              <p className="text-[11px] text-slate-500 pt-1 text-center font-medium">
                Deducts: {numQuantity}x {blankItem.name} + {boxItem ? `${numQuantity}x ${boxItem.name}` : 'No Box'}
              </p>
            )}
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
              className="px-5 py-2 rounded-xl bg-[#1e2738] hover:bg-slate-800 text-white font-bold shadow-md shadow-slate-900/10 disabled:opacity-50 flex items-center space-x-1.5"
            >
              <span>{isSubmitting ? 'Sending to Xero...' : 'Push to Xero & Deduct Stock'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
