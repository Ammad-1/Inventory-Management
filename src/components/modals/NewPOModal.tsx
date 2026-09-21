import React, { useState } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { X, Ship, DollarSign, Calculator } from 'lucide-react';

interface NewPOModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewPOModal: React.FC<NewPOModalProps> = ({ isOpen, onClose }) => {
  const { suppliers, inventory, createPurchaseOrder, setActiveView } = useInventory();

  const [poNumber, setPoNumber] = useState(() => `PO-CN-${Math.floor(1000 + Math.random() * 9000)}`);
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id || 'SUP-001');
  const [shippingMethod, setShippingMethod] = useState('Ocean Freight - 40ft High Cube Container');
  const [containerNumber, setContainerNumber] = useState(() => `MSKU-${Math.floor(100000 + Math.random() * 900000)}-${Math.floor(1 + Math.random() * 9)}`);
  const [vesselName, setVesselName] = useState('CMA CGM Palais Royal / Voyage 2609W');
  const [originPort, setOriginPort] = useState('Port of Qingdao, China');
  const [destinationPort, setDestinationPort] = useState('Port of Los Angeles (Berth 400), USA');
  const [transitDaysTotal, setTransitDaysTotal] = useState<number>(45);

  const [selectedItemId, setSelectedItemId] = useState(inventory[0]?.id || '');
  const [orderQuantity, setOrderQuantity] = useState<number>(36000); // 40ft container capacity
  const [unitFobPrice, setUnitFobPrice] = useState<number>(0.62);
  const [oceanFreightTotal, setOceanFreightTotal] = useState<number>(4600.00);
  const [tariffsDutyTotal, setTariffsDutyTotal] = useState<number>(1940.00);
  const [portDrayageTotal, setPortDrayageTotal] = useState<number>(1200.00);
  const [notes, setNotes] = useState('');

  if (!isOpen) return null;

  const currentItem = inventory.find(i => i.id === selectedItemId) || inventory[0];
  const currentSupplier = suppliers.find(s => s.id === supplierId) || suppliers[0];

  const fobGoodsTotal = orderQuantity * unitFobPrice;
  const totalLandedCost = fobGoodsTotal + oceanFreightTotal + tariffsDutyTotal + portDrayageTotal;
  const landedUnitCost = orderQuantity > 0 ? totalLandedCost / orderQuantity : unitFobPrice;
  const allocatedFreightPerUnit = orderQuantity > 0 ? oceanFreightTotal / orderQuantity : 0;
  const allocatedDutyPerUnit = orderQuantity > 0 ? tariffsDutyTotal / orderQuantity : 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentItem) return;

    const today = new Date().toISOString().split('T')[0];
    const deliveryDateObj = new Date(Date.now() + transitDaysTotal * 24 * 60 * 60 * 1000);
    const expectedDelivery = deliveryDateObj.toISOString().split('T')[0];

    createPurchaseOrder({
      poNumber,
      supplierId: currentSupplier.id,
      supplierName: currentSupplier.name,
      supplierCountry: currentSupplier.country,
      status: 'in_transit',
      orderDate: today,
      expectedDeliveryDate: expectedDelivery,
      shippingMethod,
      containerNumber,
      vesselName,
      originPort,
      destinationPort,
      transitDaysTotal,
      transitDaysElapsed: 1,
      lines: [
        {
          itemId: currentItem.id,
          sku: currentItem.sku,
          name: currentItem.name,
          quantityOrdered: orderQuantity,
          unitFobPrice,
          allocatedFreight: parseFloat(allocatedFreightPerUnit.toFixed(3)),
          allocatedDuty: parseFloat(allocatedDutyPerUnit.toFixed(3)),
          landedUnitCost: parseFloat(landedUnitCost.toFixed(3)),
          totalCost: totalLandedCost,
        }
      ],
      costBreakdown: {
        fobTotal: fobGoodsTotal,
        oceanFreight: oceanFreightTotal,
        tariffsDuty: tariffsDutyTotal,
        portDrayage: portDrayageTotal,
        totalLandedCost,
      },
      notes,
    });

    onClose();
    setActiveView('shipments');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl my-8 animate-in fade-in zoom-in duration-150">
        
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
              <Ship className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Create Overseas PO & Inbound Container</h3>
              <p className="text-[11px] text-slate-400">Calculate landed unit costs across ocean freight, tariffs, and drayage</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">PO Number</label>
              <input
                type="text"
                required
                value={poNumber}
                onChange={e => setPoNumber(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-cyan-300 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Supplier</label>
              <select
                value={supplierId}
                onChange={e => {
                  setSupplierId(e.target.value);
                  const sup = suppliers.find(s => s.id === e.target.value);
                  if (sup) setTransitDaysTotal(sup.leadTimeDays);
                }}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
              >
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.country}) - {s.leadTimeDays}d Lead Time
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Shipping Method</label>
              <select
                value={shippingMethod}
                onChange={e => setShippingMethod(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="Ocean Freight - 40ft High Cube Container">Ocean Freight - 40ft High Cube Container (36k Mugs)</option>
                <option value="Ocean Freight - 20ft Standard Container">Ocean Freight - 20ft Standard Container (12k Mugs)</option>
                <option value="Air Freight Express - Palletized">Air Freight Express - Palletized (7 Days)</option>
                <option value="Domestic Dedicated LTL Freight">Domestic Dedicated LTL Freight (5 Days)</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Container Number</label>
              <input
                type="text"
                value={containerNumber}
                onChange={e => setContainerNumber(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-300 font-semibold mb-1">Vessel Name</label>
              <input
                type="text"
                value={vesselName}
                onChange={e => setVesselName(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Origin Port</label>
              <input
                type="text"
                value={originPort}
                onChange={e => setOriginPort(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-slate-300 font-semibold mb-1">Transit Duration (Days)</label>
              <input
                type="number"
                min="1"
                value={transitDaysTotal}
                onChange={e => setTransitDaysTotal(parseInt(e.target.value) || 1)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Item & Quantity Selection */}
          <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700/60 space-y-3">
            <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
              Cargo Line Item & FOB Pricing
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-slate-400 mb-1">Item to Order</label>
                <select
                  value={selectedItemId}
                  onChange={e => {
                    setSelectedItemId(e.target.value);
                    const it = inventory.find(i => i.id === e.target.value);
                    if (it) setUnitFobPrice(it.costPerUnit);
                  }}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
                >
                  {inventory.filter(i => i.category === 'raw_material' || i.category === 'consumable').map(item => (
                    <option key={item.id} value={item.id}>
                      [{item.sku}] {item.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Quantity ({currentItem?.unit})</label>
                <input
                  type="number"
                  min="1"
                  value={orderQuantity}
                  onChange={e => setOrderQuantity(parseInt(e.target.value) || 1)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono font-bold text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-slate-400 mb-1">FOB Unit Price ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={unitFobPrice}
                  onChange={e => setUnitFobPrice(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Ocean Freight ($)</label>
                <input
                  type="number"
                  step="10"
                  value={oceanFreightTotal}
                  onChange={e => setOceanFreightTotal(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Customs Tariffs ($)</label>
                <input
                  type="number"
                  step="10"
                  value={tariffsDutyTotal}
                  onChange={e => setTariffsDutyTotal(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Port Drayage ($)</label>
                <input
                  type="number"
                  step="10"
                  value={portDrayageTotal}
                  onChange={e => setPortDrayageTotal(parseFloat(e.target.value) || 0)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>
          </div>

          {/* Live Landed Cost Summary */}
          <div className="bg-cyan-950/30 border border-cyan-500/30 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-[11px] text-cyan-300 font-semibold block">Calculated True Landed Cost:</span>
              <div className="flex items-baseline space-x-2 mt-0.5">
                <span className="text-2xl font-bold font-mono text-cyan-200">
                  ${landedUnitCost.toFixed(3)}
                </span>
                <span className="text-slate-400 text-xs">/ unit (vs ${unitFobPrice.toFixed(2)} FOB)</span>
              </div>
            </div>

            <div className="text-right text-xs">
              <span className="text-slate-400 block">Total Landed Investment:</span>
              <span className="font-mono text-base font-bold text-white">
                ${totalLandedCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </span>
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
              className="px-5 py-2 text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition shadow-md shadow-cyan-600/30"
            >
              Book Inbound Container & Dispatch PO
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
