import React, { useState } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { Ship, X, Plus, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';

interface NewShipmentModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewShipmentModal: React.FC<NewShipmentModalProps> = ({ isOpen, onClose }) => {
  const { inventory, createShipment } = useInventory();

  const [shipmentRef, setShipmentRef] = useState<string>(`SHP-2026-CN${Math.floor(10 + Math.random() * 90)}`);
  const [containerNumber, setContainerNumber] = useState<string>('MSKU-4819203 (40ft HQ)');
  const [supplierName, setSupplierName] = useState<string>('Zibo High-Tech Ceramics Co. (China)');
  const [departureDate, setDepartureDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [etaDate, setEtaDate] = useState<string>(new Date(Date.now() + 42 * 86400000).toISOString().slice(0, 10));
  const [currencyRateUSDGBP, setCurrencyRateUSDGBP] = useState<number>(1.28);
  const [seaFreightUSD, setSeaFreightUSD] = useState<number>(2600);
  const [ukCustomsDutyGBP, setUkCustomsDutyGBP] = useState<number>(450);
  const [ukPortHandlingGBP, setUkPortHandlingGBP] = useState<number>(250);
  const [ukInlandHaulageGBP, setUkInlandHaulageGBP] = useState<number>(480);
  const [unloadingLaborGBP, setUnloadingLaborGBP] = useState<number>(180);
  const [costAllocationMethod, setCostAllocationMethod] = useState<'cbm' | 'weight' | 'value'>('cbm');

  const [items, setItems] = useState<Array<{
    itemId: string;
    sku: string;
    name: string;
    quantity: number;
    unitPriceUSD: number;
    cbmTotal: number;
    weightKgTotal: number;
  }>>([
    {
      itemId: inventory[0]?.id || 'item-001',
      sku: inventory[0]?.sku || 'BLANK-MUG-11-WHT',
      name: inventory[0]?.name || '11oz White Cambridge Ceramic Mugs',
      quantity: 15000,
      unitPriceUSD: 0.44,
      cbmTotal: 24.0,
      weightKgTotal: 5250
    },
    {
      itemId: inventory[3]?.id || 'item-004',
      sku: inventory[3]?.sku || 'BAG-TOTE-CANVAS-NAT',
      name: inventory[3]?.name || 'Natural Cotton Canvas Tote Bags',
      quantity: 5000,
      unitPriceUSD: 0.78,
      cbmTotal: 2.0,
      weightKgTotal: 450
    }
  ]);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  const handleAddItemLine = () => {
    const defaultItem = inventory[0];
    setItems([
      ...items,
      {
        itemId: defaultItem?.id || '',
        sku: defaultItem?.sku || '',
        name: defaultItem?.name || '',
        quantity: 1000,
        unitPriceUSD: defaultItem?.fobCostUSD || 0.50,
        cbmTotal: 1.5,
        weightKgTotal: 350
      }
    ]);
  };

  const handleRemoveItemLine = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleItemSelect = (index: number, selectedId: string) => {
    const found = inventory.find(i => i.id === selectedId);
    if (!found) return;

    const updated = [...items];
    updated[index] = {
      ...updated[index],
      itemId: found.id,
      sku: found.sku,
      name: found.name,
      unitPriceUSD: found.fobCostUSD || 0.45
    };
    setItems(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) {
      setStatusMessage({ type: 'error', text: 'Please add at least one item to the container manifest' });
      return;
    }

    setIsSubmitting(true);
    setStatusMessage(null);

    const res = await createShipment({
      shipmentRef,
      containerNumber,
      supplierName,
      departureDate,
      etaDate,
      status: 'on_water',
      currencyRateUSDGBP,
      seaFreightUSD,
      ukCustomsDutyGBP,
      ukPortHandlingGBP,
      ukInlandHaulageGBP,
      unloadingLaborGBP,
      costAllocationMethod,
      items
    });

    setIsSubmitting(false);

    if (res.success) {
      setStatusMessage({ type: 'success', text: 'Container saved & landed costs calculated!' });
      setTimeout(() => {
        setStatusMessage(null);
        onClose();
      }, 1200);
    } else {
      setStatusMessage({ type: 'error', text: res.message });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden my-8">
        
        {/* Header */}
        <div className="px-6 py-4.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Ship className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">New China Container & CBM Cost Allocation</h3>
              <p className="text-xs text-slate-400">Calculate landed cost per unit via volume (CBM) for every blank item</p>
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

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Shipment Ref *</label>
              <input
                type="text"
                value={shipmentRef}
                onChange={(e) => setShipmentRef(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-slate-900 focus:outline-hidden focus:border-indigo-500 font-bold"
                required
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Container Number</label>
              <input
                type="text"
                value={containerNumber}
                onChange={(e) => setContainerNumber(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-slate-900 focus:outline-hidden focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Supplier Name</label>
              <input
                type="text"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-slate-900 focus:outline-hidden focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">USD / GBP Rate *</label>
              <input
                type="number"
                step="0.01"
                value={currencyRateUSDGBP}
                onChange={(e) => setCurrencyRateUSDGBP(parseFloat(e.target.value) || 1.28)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-slate-900 font-bold focus:outline-hidden focus:border-indigo-500 text-indigo-700"
                required
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">China Factory Departure</label>
              <input
                type="date"
                value={departureDate}
                onChange={(e) => setDepartureDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-slate-900 focus:outline-hidden focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">UK Factory Arrival ETA</label>
              <input
                type="date"
                value={etaDate}
                onChange={(e) => setEtaDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-slate-900 focus:outline-hidden focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Import Expenses Box */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-2.5">
            <div className="font-bold text-slate-800 uppercase tracking-wider text-[11px] flex items-center justify-between">
              <span>Freight, Customs & Port Haulage Expenses</span>
              <div className="flex items-center space-x-2">
                <span className="text-slate-500 font-medium">Allocation Method:</span>
                <select
                  value={costAllocationMethod}
                  onChange={(e) => setCostAllocationMethod(e.target.value as any)}
                  className="bg-white border border-slate-200 rounded-lg px-2 py-0.5 text-indigo-700 font-bold text-xs"
                >
                  <option value="cbm">Volume (CBM - Recommended)</option>
                  <option value="weight">Weight (KG)</option>
                  <option value="value">FOB Value (USD)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1">
              <div>
                <label className="block text-slate-500 text-[10px]">Ocean Freight ($ USD)</label>
                <input
                  type="number"
                  value={seaFreightUSD}
                  onChange={(e) => setSeaFreightUSD(parseFloat(e.target.value) || 0)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-900"
                />
              </div>
              <div>
                <label className="block text-slate-500 text-[10px]">UK Customs Duty (£)</label>
                <input
                  type="number"
                  value={ukCustomsDutyGBP}
                  onChange={(e) => setUkCustomsDutyGBP(parseFloat(e.target.value) || 0)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-900"
                />
              </div>
              <div>
                <label className="block text-slate-500 text-[10px]">UK Port Handling (£)</label>
                <input
                  type="number"
                  value={ukPortHandlingGBP}
                  onChange={(e) => setUkPortHandlingGBP(parseFloat(e.target.value) || 0)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-900"
                />
              </div>
              <div>
                <label className="block text-slate-500 text-[10px]">UK Road Haulage (£)</label>
                <input
                  type="number"
                  value={ukInlandHaulageGBP}
                  onChange={(e) => setUkInlandHaulageGBP(parseFloat(e.target.value) || 0)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-900"
                />
              </div>
              <div>
                <label className="block text-slate-500 text-[10px]">Unloading Labor (£)</label>
                <input
                  type="number"
                  value={unloadingLaborGBP}
                  onChange={(e) => setUnloadingLaborGBP(parseFloat(e.target.value) || 0)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-900"
                />
              </div>
            </div>
          </div>

          {/* Items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800">Container Manifest Items:</span>
              <button
                type="button"
                onClick={handleAddItemLine}
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg flex items-center gap-1 font-semibold"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Item</span>
              </button>
            </div>

            {items.map((it, idx) => (
              <div key={idx} className="bg-slate-50 border border-slate-200 p-3 rounded-xl grid grid-cols-1 sm:grid-cols-6 gap-2 items-center">
                <div className="sm:col-span-2">
                  <label className="block text-[10px] text-slate-500">Item / SKU</label>
                  <select
                    value={it.itemId}
                    onChange={(e) => handleItemSelect(idx, e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-900 text-xs"
                  >
                    {inventory.map(inv => (
                      <option key={inv.id} value={inv.id}>{inv.sku} - {inv.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500">Quantity</label>
                  <input
                    type="number"
                    value={it.quantity}
                    onChange={(e) => {
                      const updated = [...items];
                      updated[idx].quantity = parseInt(e.target.value) || 0;
                      setItems(updated);
                    }}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-900 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500">FOB ($ USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={it.unitPriceUSD}
                    onChange={(e) => {
                      const updated = [...items];
                      updated[idx].unitPriceUSD = parseFloat(e.target.value) || 0;
                      setItems(updated);
                    }}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500">Volume (CBM)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={it.cbmTotal}
                    onChange={(e) => {
                      const updated = [...items];
                      updated[idx].cbmTotal = parseFloat(e.target.value) || 0;
                      setItems(updated);
                    }}
                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-900"
                  />
                </div>

                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => handleRemoveItemLine(idx)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
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
              {isSubmitting ? 'Calculating...' : 'Calculate Landed Cost & Save'}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
