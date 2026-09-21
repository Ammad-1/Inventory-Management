import React, { useState } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { PurchaseOrder, POStatus } from '../../types';
import { 
  Ship, 
  Plus, 
  CheckCircle2, 
  MapPin, 
  Anchor, 
  Clock, 
  DollarSign, 
  FileText, 
  Truck, 
  AlertCircle 
} from 'lucide-react';

interface ShipmentsViewProps {
  onOpenCreatePO: () => void;
}

export const ShipmentsView: React.FC<ShipmentsViewProps> = ({ onOpenCreatePO }) => {
  const { purchaseOrders, updatePOStatus, receivePurchaseOrder } = useInventory();
  const [selectedStatus, setSelectedStatus] = useState<POStatus | 'all'>('all');

  const filteredOrders = purchaseOrders.filter(po => {
    if (selectedStatus === 'all') return true;
    return po.status === selectedStatus;
  });

  const getStatusBadge = (status: POStatus) => {
    switch (status) {
      case 'draft':
        return <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-slate-800 text-slate-300 border border-slate-700">Draft PO</span>;
      case 'ordered':
        return <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">Order Placed</span>;
      case 'in_transit':
        return <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 animate-pulse">At Sea (Transit)</span>;
      case 'customs_clearance':
        return <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">Customs Clearance</span>;
      case 'received':
        return <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Received & Stocked</span>;
      case 'cancelled':
        return <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">Cancelled</span>;
    }
  };

  return (
    <div id="shipments-view-container" className="space-y-6 pb-12">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Ship className="w-5 h-5 text-cyan-400" />
            Inbound Containers & Ocean Freight Procurement
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Track 45-day ocean transit from China, calculate true landed unit costs, and automate warehouse stock put-away
          </p>
        </div>

        <button
          onClick={onOpenCreatePO}
          className="px-4 py-2 text-xs font-bold bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition shadow-md shadow-cyan-600/30 flex items-center gap-1.5 self-start sm:self-center"
        >
          <Plus className="w-4 h-4" />
          <span>New Purchase Order</span>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center space-x-1 overflow-x-auto bg-slate-900 border border-slate-800 p-1.5 rounded-xl">
        {(['all', 'in_transit', 'customs_clearance', 'ordered', 'received'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setSelectedStatus(tab as any)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold capitalize transition whitespace-nowrap ${
              selectedStatus === tab
                ? 'bg-cyan-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            {tab.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Shipments List */}
      <div className="space-y-5">
        {filteredOrders.map(po => {
          const percent = Math.min(100, Math.round((po.transitDaysElapsed / po.transitDaysTotal) * 100));
          const totalUnits = po.lines.reduce((s, l) => s + l.quantityOrdered, 0);

          return (
            <div key={po.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              
              {/* Top Row: PO number, Supplier, Status */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center justify-center">
                    <Ship className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-mono text-sm font-bold text-white">{po.poNumber}</span>
                      {po.containerNumber && (
                        <span className="px-2 py-0.5 text-xs font-mono bg-slate-800 text-cyan-300 rounded border border-slate-700">
                          {po.containerNumber}
                        </span>
                      )}
                      {getStatusBadge(po.status)}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Supplier: <strong className="text-slate-200">{po.supplierName}</strong> ({po.supplierCountry}) | Method: <span className="text-slate-300">{po.shippingMethod}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2 self-end sm:self-center">
                  {po.status !== 'received' ? (
                    <button
                      onClick={() => receivePurchaseOrder(po.id)}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg transition shadow-md shadow-emerald-600/20 flex items-center gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Receive Shipment & Stock</span>
                    </button>
                  ) : (
                    <div className="px-3 py-1.5 bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 text-xs font-bold rounded-lg flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Put-Away Completed on {po.receivedDate}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Ocean Transit Route & Timeline */}
              <div className="bg-slate-800/40 rounded-xl p-4 border border-slate-800">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-2 mb-2">
                  <div className="flex items-center gap-1.5 text-slate-300">
                    <Anchor className="w-4 h-4 text-cyan-400" />
                    <span>Origin: <strong>{po.originPort || 'Factory Departure'}</strong></span>
                  </div>
                  <div className="text-center font-semibold text-cyan-300">
                    Day {po.transitDaysElapsed} of {po.transitDaysTotal} ({percent}% Completed)
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-300 sm:justify-end">
                    <MapPin className="w-4 h-4 text-emerald-400" />
                    <span>Destination: <strong>{po.destinationPort || 'Warehouse Dock'}</strong></span>
                  </div>
                </div>

                <div className="w-full h-3 bg-slate-700/60 rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all ${
                      po.status === 'received' 
                        ? 'bg-emerald-500' 
                        : po.status === 'customs_clearance'
                        ? 'bg-amber-400'
                        : 'bg-gradient-to-r from-cyan-500 to-indigo-500'
                    }`}
                    style={{ width: `${percent}%` }}
                  />
                </div>

                <div className="flex justify-between text-[11px] text-slate-400 mt-2">
                  <span>Ordered: {po.orderDate}</span>
                  <span>Vessel: <strong className="text-slate-200">{po.vesselName || 'Ocean Container Line'}</strong></span>
                  <span>Expected Dock ETA: <strong className="text-cyan-300">{po.expectedDeliveryDate}</strong></span>
                </div>
              </div>

              {/* Items & Landed Cost Financial Breakdown */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-xs">
                
                {/* Cargo Manifest Lines */}
                <div className="lg:col-span-2 bg-slate-800/30 rounded-xl p-4 border border-slate-800">
                  <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-2.5">
                    Cargo Manifest & Landed Cost Explosion
                  </h4>

                  <table className="w-full text-left">
                    <thead className="text-[10px] text-slate-400 border-b border-slate-700 pb-1 uppercase">
                      <tr>
                        <th className="pb-1.5">Item / SKU</th>
                        <th className="pb-1.5 text-right">Quantity</th>
                        <th className="pb-1.5 text-right">FOB Unit</th>
                        <th className="pb-1.5 text-right">Freight+Duty</th>
                        <th className="pb-1.5 text-right">Landed Unit</th>
                        <th className="pb-1.5 text-right">Line Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {po.lines.map((line, idx) => (
                        <tr key={idx}>
                          <td className="py-2">
                            <div className="font-semibold text-white">{line.name}</div>
                            <div className="font-mono text-[10px] text-slate-400">{line.sku}</div>
                          </td>
                          <td className="py-2 text-right font-mono font-bold text-white">
                            {line.quantityOrdered.toLocaleString()}
                          </td>
                          <td className="py-2 text-right font-mono text-slate-300">
                            ${line.unitFobPrice.toFixed(2)}
                          </td>
                          <td className="py-2 text-right font-mono text-amber-300">
                            +${(line.allocatedFreight + line.allocatedDuty).toFixed(3)}
                          </td>
                          <td className="py-2 text-right font-mono font-bold text-emerald-300">
                            ${line.landedUnitCost.toFixed(3)}
                          </td>
                          <td className="py-2 text-right font-mono font-bold text-slate-100">
                            ${line.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Landed Cost Breakdown */}
                <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/60 flex flex-col justify-between">
                  <div>
                    <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-2.5">
                      Cost Allocation Breakdown
                    </h4>

                    <div className="space-y-2 text-slate-300">
                      <div className="flex justify-between">
                        <span className="text-slate-400">FOB Goods Value:</span>
                        <strong className="font-mono">${po.costBreakdown.fobTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Ocean Freight:</span>
                        <strong className="font-mono">${po.costBreakdown.oceanFreight.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Customs Duty & Tariffs:</span>
                        <strong className="font-mono">${po.costBreakdown.tariffsDuty.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Port Drayage & Handling:</span>
                        <strong className="font-mono">${po.costBreakdown.portDrayage.toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-700 flex items-center justify-between">
                    <span className="font-bold text-slate-200">Total Landed Cost:</span>
                    <span className="font-mono text-base font-bold text-emerald-400">
                      ${po.costBreakdown.totalLandedCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

              </div>

            </div>
          );
        })}
      </div>

    </div>
  );
};
