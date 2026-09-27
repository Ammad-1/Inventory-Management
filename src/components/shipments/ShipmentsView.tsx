import React, { useState } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { InboundShipment } from '../../types';
import { 
  Ship, 
  Plus, 
  CheckCircle2, 
  Clock, 
  Anchor, 
  Truck, 
  RefreshCw,
  Boxes,
  Package,
  TrendingUp,
  MoreHorizontal,
  Compass,
  Building2,
  Calendar,
  Layers,
  ArrowRight
} from 'lucide-react';
import { NewShipmentModal } from '../modals/NewShipmentModal';

export const ShipmentsView: React.FC = () => {
  const { shipments, receiveShipment } = useInventory();
  const [isNewShipmentOpen, setIsNewShipmentOpen] = useState(false);
  const [receivingId, setReceivingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ id: string; message: string } | null>(null);

  const handleReceive = async (shipmentId: string) => {
    setReceivingId(shipmentId);
    const res = await receiveShipment(shipmentId);
    setReceivingId(null);
    if (res.success) {
      setFeedback({ id: shipmentId, message: res.message });
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  const getStatusBadge = (status: InboundShipment['status']) => {
    switch (status) {
      case 'on_water':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full bg-blue-50 text-blue-700 border border-blue-200">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
            On Water (Ocean Transit)
          </span>
        );
      case 'customs_clearance':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full bg-amber-50 text-amber-700 border border-amber-200">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
            UK Customs Clearance
          </span>
        );
      case 'received_warehouse':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Received in Warehouse
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full bg-slate-100 text-slate-700 border border-slate-200">
            Order Confirmed
          </span>
        );
    }
  };

  const totalInTransitValue = shipments
    .filter(s => s.status !== 'received_warehouse')
    .reduce((sum, s) => sum + (s.totalLandedGBP || 0), 0);

  const totalInTransitUnits = shipments
    .filter(s => s.status !== 'received_warehouse')
    .reduce((sum, s) => sum + s.items.reduce((acc, it) => acc + (it.quantity || 0), 0), 0);

  return (
    <div className="space-y-6 pb-12">
      
      {/* Top Banner Card & Summary */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5 mb-1.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
              <Ship className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-slate-900 font-heading">
                Ocean Containers & Landed Cost Calculator
              </h2>
            </div>
          </div>
          <p className="text-xs text-slate-500 max-w-2xl font-medium">
            True landed cost engine allocating 40ft HQ ocean freight ($4,200), HMRC duty (6.5%), and port haulage across CBM volume for exact per-item UK costing.
          </p>
        </div>

        <div className="flex items-center space-x-3 self-start md:self-auto">
          <div className="hidden sm:block text-right pr-2">
            <div className="text-[10px] text-slate-400 font-semibold uppercase">Inbound Pipeline</div>
            <div className="text-sm font-extrabold text-slate-900 font-mono">
              £{totalInTransitValue.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
            </div>
          </div>

          <button
            onClick={() => setIsNewShipmentOpen(true)}
            className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition-all active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4 text-indigo-200" />
            <span>New China Shipment</span>
          </button>
        </div>
      </div>

      {/* Shipments List */}
      <div className="space-y-6">
        {shipments.length === 0 ? (
          <div className="bg-white border border-slate-200/80 rounded-2xl p-12 text-center text-slate-400 text-sm">
            No shipments recorded yet. Click "New China Shipment" to log an inbound container.
          </div>
        ) : (
          shipments.map(shp => {
            const isReceived = shp.status === 'received_warehouse';
            const isOnWater = shp.status === 'on_water';
            const isCustoms = shp.status === 'customs_clearance';

            const totalUnits = shp.items.reduce((s, it) => s + (it.quantity || 0), 0);
            const totalCBM = shp.items.reduce((s, it) => s + (it.cbmTotal || 0), 0);

            return (
              <div 
                key={shp.id}
                className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] hover:shadow-md transition-all space-y-5"
              >
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="font-extrabold text-slate-900 text-lg font-heading">{shp.shipmentRef}</span>
                      <span className="text-xs font-mono font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200/60">
                        {shp.containerNumber}
                      </span>
                      {getStatusBadge(shp.status)}
                    </div>
                    <div className="text-xs text-slate-500 mt-2 flex flex-wrap items-center gap-3 font-medium">
                      <span className="flex items-center gap-1">
                        <Building2 className="w-3.5 h-3.5 text-slate-400" />
                        Supplier: <strong className="text-slate-800 font-semibold">{shp.supplierName}</strong>
                      </span>
                      <span>&bull;</span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        ETA: <strong className="text-slate-800 font-semibold">{shp.etaDate || 'Pending'}</strong>
                      </span>
                      <span>&bull;</span>
                      <span>Exchange Rate: <strong className="text-indigo-600 font-mono font-semibold">${shp.currencyRateUSDGBP} = £1.00</strong></span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div>
                    {isReceived ? (
                      <span className="px-4 py-2.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200/80 text-xs font-semibold flex items-center gap-2 shadow-2xs">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>Stock Received & Added to Inventory</span>
                      </span>
                    ) : (
                      <button
                        onClick={() => handleReceive(shp.id)}
                        disabled={receivingId === shp.id}
                        className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-700/20 transition-all flex items-center gap-2 disabled:opacity-50 active:scale-95 cursor-pointer"
                      >
                        {receivingId === shp.id ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <Boxes className="w-4 h-4" />
                        )}
                        <span>Receive Container into Stock</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Voyage Transit Progress Stepper */}
                <div className="bg-slate-50/80 border border-slate-100 rounded-xl p-4">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3">
                    Ocean Voyage & Clearance Stepper (45-Day Lead Time)
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center text-xs">
                    <div className="flex flex-col items-center">
                      <div className="w-7 h-7 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold text-[11px] shadow-xs">
                        ✓
                      </div>
                      <span className="font-bold text-slate-800 mt-1.5 text-[11px]">Factory Ningbo</span>
                      <span className="text-[10px] text-slate-400">Order Dispatched</span>
                    </div>

                    <div className="flex flex-col items-center">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-[11px] shadow-xs ${
                        isOnWater || isCustoms || isReceived ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600'
                      }`}>
                        <Ship className="w-3.5 h-3.5" />
                      </div>
                      <span className="font-bold text-slate-800 mt-1.5 text-[11px]">Ocean Transit</span>
                      <span className="text-[10px] text-slate-400">Maersk 40ft HQ</span>
                    </div>

                    <div className="flex flex-col items-center">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-[11px] shadow-xs ${
                        isCustoms || isReceived ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'
                      }`}>
                        <Anchor className="w-3.5 h-3.5" />
                      </div>
                      <span className="font-bold text-slate-800 mt-1.5 text-[11px]">UK Customs</span>
                      <span className="text-[10px] text-slate-400">HMRC Duty & Clearance</span>
                    </div>

                    <div className="flex flex-col items-center">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-[11px] shadow-xs ${
                        isReceived ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500'
                      }`}>
                        <Truck className="w-3.5 h-3.5" />
                      </div>
                      <span className="font-bold text-slate-800 mt-1.5 text-[11px]">PrintBerry Ops</span>
                      <span className="text-[10px] text-slate-400">{isReceived ? 'Stock Added' : 'Pending Arrival'}</span>
                    </div>
                  </div>
                </div>

                {/* Feedback */}
                {feedback && feedback.id === shp.id && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{feedback.message}</span>
                  </div>
                )}

                {/* 5 Cost Breakdown Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                  <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
                    <div className="text-[10px] text-slate-400 font-semibold uppercase">FOB Goods Value</div>
                    <div className="font-extrabold text-slate-900 mt-1 text-sm font-mono">${shp.totalFobUSD?.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                    <div className="text-[10px] text-slate-500 font-medium mt-0.5">£{(shp.totalFobUSD / (shp.currencyRateUSDGBP || 1.28)).toFixed(2)} GBP</div>
                  </div>

                  <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
                    <div className="text-[10px] text-slate-400 font-semibold uppercase">Ocean Sea Freight</div>
                    <div className="font-extrabold text-indigo-600 mt-1 text-sm font-mono">${shp.seaFreightUSD?.toFixed(2)}</div>
                    <div className="text-[10px] text-slate-500 font-medium mt-0.5">£{(shp.seaFreightUSD / (shp.currencyRateUSDGBP || 1.28)).toFixed(2)} GBP</div>
                  </div>

                  <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
                    <div className="text-[10px] text-slate-400 font-semibold uppercase">HMRC Customs Duty</div>
                    <div className="font-extrabold text-amber-600 mt-1 text-sm font-mono">£{shp.ukCustomsDutyGBP?.toFixed(2)}</div>
                    <div className="text-[10px] text-slate-500 font-medium mt-0.5">Tariff & Clearance</div>
                  </div>

                  <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
                    <div className="text-[10px] text-slate-400 font-semibold uppercase">Port & Haulage</div>
                    <div className="font-extrabold text-slate-900 mt-1 text-sm font-mono">£{((shp.ukPortHandlingGBP || 0) + (shp.ukInlandHaulageGBP || 0)).toFixed(2)}</div>
                    <div className="text-[10px] text-slate-500 font-medium mt-0.5">Southampton to Works</div>
                  </div>

                  <div className="bg-emerald-50/80 p-3.5 rounded-xl border border-emerald-200/80 shadow-2xs col-span-2 sm:col-span-1">
                    <div className="text-[10px] text-emerald-800 font-bold uppercase">Total Landed Investment</div>
                    <div className="font-extrabold text-emerald-800 text-base mt-1 font-mono">£{shp.totalLandedGBP?.toLocaleString('en-GB', { minimumFractionDigits: 2 })}</div>
                    <div className="text-[10px] text-emerald-700 font-semibold mt-0.5">{totalUnits.toLocaleString()} pcs &bull; {totalCBM} CBM</div>
                  </div>
                </div>

                {/* Manifest Table */}
                <div className="border border-slate-200/80 rounded-xl overflow-hidden">
                  <div className="bg-slate-50/80 px-4 py-2.5 text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center justify-between border-b border-slate-200">
                    <span>Manifest Items & Landed Cost Allocation ({shp.costAllocationMethod?.toUpperCase()}):</span>
                    <span className="text-indigo-600 font-semibold normal-case">True landed unit cost is updated on receipt</span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-700">
                      <thead className="bg-white border-b border-slate-200 text-[11px] text-slate-400 uppercase font-semibold">
                        <tr>
                          <th className="px-4 py-2.5 font-semibold">SKU & Item Name</th>
                          <th className="px-4 py-2.5 font-semibold">Quantity</th>
                          <th className="px-4 py-2.5 font-semibold">FOB Unit ($)</th>
                          <th className="px-4 py-2.5 font-semibold">Volume (CBM)</th>
                          <th className="px-4 py-2.5 font-semibold">Allocated Freight & Duty</th>
                          <th className="px-4 py-2.5 font-semibold text-right">True Unit Landed (£)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono text-[12px]">
                        {shp.items.map((it, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/60">
                            <td className="px-4 py-3 font-sans font-medium text-slate-900">
                              <div className="font-bold font-mono">{it.sku}</div>
                              <div className="text-[11px] text-slate-500 font-sans">{it.name}</div>
                            </td>
                            <td className="px-4 py-3 font-bold text-slate-900">{it.quantity?.toLocaleString()} pcs</td>
                            <td className="px-4 py-3 text-slate-600">${it.unitPriceUSD?.toFixed(2)}</td>
                            <td className="px-4 py-3 text-slate-500">{it.cbmTotal} m³</td>
                            <td className="px-4 py-3 text-slate-500">£{it.allocatedFreightAndFeesGBP?.toFixed(2)}</td>
                            <td className="px-4 py-3 text-right">
                              <span className="font-bold text-indigo-700 bg-indigo-50 border border-indigo-200/80 px-2.5 py-1 rounded-lg">
                                £{it.unitLandedGBP?.toFixed(2)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            );
          })
        )}
      </div>

      <NewShipmentModal
        isOpen={isNewShipmentOpen}
        onClose={() => setIsNewShipmentOpen(false)}
      />

    </div>
  );
};
