import React, { useState } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { SalesOrder, OrderStatus } from '../../types';
import { 
  FileText, 
  Plus, 
  RefreshCw, 
  CheckCircle2, 
  Clock, 
  DollarSign, 
  Truck, 
  TrendingUp, 
  ExternalLink,
  ShieldCheck,
  PackageCheck
} from 'lucide-react';

interface SalesOrdersViewProps {
  onOpenCreateOrder: () => void;
}

export const SalesOrdersView: React.FC<SalesOrdersViewProps> = ({ onOpenCreateOrder }) => {
  const { salesOrders, approveSalesOrder, dispatchSalesOrder, syncXeroInvoice } = useInventory();
  const [selectedStatus, setSelectedStatus] = useState<OrderStatus | 'all'>('all');
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const filteredOrders = salesOrders.filter(so => {
    if (selectedStatus === 'all') return true;
    return so.status === selectedStatus;
  });

  const handleSyncXero = (orderId: string) => {
    setSyncingId(orderId);
    setTimeout(() => {
      syncXeroInvoice(orderId);
      setSyncingId(null);
    }, 600);
  };

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'draft':
        return <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-slate-800 text-slate-300 border border-slate-700">Draft Quote</span>;
      case 'approved':
        return <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">Approved (Stock Reserved)</span>;
      case 'in_production':
        return <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 animate-pulse">In Production</span>;
      case 'dispatched':
        return <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">Dispatched</span>;
      case 'paid':
        return <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Paid & Reconciled</span>;
    }
  };

  return (
    <div id="sales-orders-view-container" className="space-y-6 pb-12">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-emerald-400" />
            Sales Orders & Xero Accounting Synchronization
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Process customer print orders, automate BOM inventory reservations, and 2-way sync invoices with Xero
          </p>
        </div>

        <button
          onClick={onOpenCreateOrder}
          className="px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition shadow-md shadow-emerald-600/30 flex items-center gap-1.5 self-start sm:self-center"
        >
          <Plus className="w-4 h-4" />
          <span>New Sales Order</span>
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center space-x-1 overflow-x-auto bg-slate-900 border border-slate-800 p-1.5 rounded-xl">
        {(['all', 'draft', 'approved', 'in_production', 'dispatched'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setSelectedStatus(tab as any)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold capitalize transition whitespace-nowrap ${
              selectedStatus === tab
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            {tab.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Orders List */}
      <div className="space-y-4">
        {filteredOrders.map(order => (
          <div key={order.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            
            {/* Header: Order #, Customer, Xero status */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div>
                <div className="flex items-center space-x-2">
                  <span className="font-mono text-sm font-bold text-white">{order.orderNumber}</span>
                  {getStatusBadge(order.status)}

                  {/* Xero Badge */}
                  {order.xeroSyncStatus === 'synced' ? (
                    <span className="px-2 py-0.5 text-[11px] font-semibold bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 rounded-full flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-cyan-400" />
                      <span>Xero {order.xeroInvoiceId}</span>
                    </span>
                  ) : (
                    <button
                      onClick={() => handleSyncXero(order.id)}
                      disabled={syncingId === order.id}
                      className="px-2 py-0.5 text-[11px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-full flex items-center gap-1 transition"
                    >
                      <RefreshCw className={`w-3 h-3 ${syncingId === order.id ? 'animate-spin text-cyan-400' : ''}`} />
                      <span>Sync to Xero</span>
                    </button>
                  )}
                </div>

                <h3 className="text-base font-bold text-white mt-1">{order.customerName}</h3>
                <p className="text-xs text-slate-400">
                  Email: <span className="text-slate-300">{order.customerEmail}</span> | Created: {order.createdAt} | Delivery Due: <strong className="text-slate-200">{order.dueAt}</strong>
                </p>
              </div>

              {/* Financial summary badge */}
              <div className="flex sm:flex-col items-end justify-between text-right">
                <span className="font-mono text-xl font-bold text-white">
                  ${order.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
                <div className="text-xs text-slate-400 mt-0.5">
                  Gross Margin:{' '}
                  <strong className="text-emerald-400 font-semibold">
                    {order.estimatedGrossMarginPercent.toFixed(1)}% (${order.estimatedGrossProfit.toLocaleString()})
                  </strong>
                </div>
              </div>
            </div>

            {/* Line items table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[11px] text-slate-400 border-b border-slate-800 pb-1 uppercase">
                  <tr>
                    <th className="pb-2">Ordered Finished Product</th>
                    <th className="pb-2 text-right">Qty</th>
                    <th className="pb-2 text-right">Unit Price</th>
                    <th className="pb-2 text-right">Est. Unit Cost</th>
                    <th className="pb-2 text-right">Line Margin</th>
                    <th className="pb-2 text-right">Line Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {order.items.map((item, idx) => (
                    <tr key={idx}>
                      <td className="py-2.5">
                        <div className="font-semibold text-white">{item.name}</div>
                        <div className="font-mono text-[10px] text-slate-400">{item.sku}</div>
                      </td>
                      <td className="py-2.5 text-right font-mono font-bold text-white">
                        {item.quantity.toLocaleString()} pcs
                      </td>
                      <td className="py-2.5 text-right font-mono text-slate-300">
                        ${item.unitPrice.toFixed(2)}
                      </td>
                      <td className="py-2.5 text-right font-mono text-slate-400">
                        ${item.estimatedUnitCost.toFixed(2)}
                      </td>
                      <td className="py-2.5 text-right font-mono font-semibold text-emerald-400">
                        {item.estimatedMargin.toFixed(1)}%
                      </td>
                      <td className="py-2.5 text-right font-mono font-bold text-white">
                        ${item.lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Actions Bar */}
            <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="text-slate-400 text-[11px]">
                {order.stockDeducted ? (
                  <span className="text-cyan-400 flex items-center gap-1 font-medium">
                    <PackageCheck className="w-3.5 h-3.5" /> Inventory reserved & BOM material allocations linked
                  </span>
                ) : (
                  <span className="text-amber-400 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" /> Awaiting approval to reserve raw stock
                  </span>
                )}
              </div>

              <div className="flex items-center space-x-2">
                {order.status === 'draft' && (
                  <button
                    onClick={() => approveSalesOrder(order.id)}
                    className="px-3.5 py-1.5 font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition shadow-sm flex items-center gap-1"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Approve & Reserve Stock</span>
                  </button>
                )}

                {(order.status === 'approved' || order.status === 'in_production') && (
                  <button
                    onClick={() => dispatchSalesOrder(order.id)}
                    className="px-3.5 py-1.5 font-bold bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition shadow-sm flex items-center gap-1"
                  >
                    <Truck className="w-3.5 h-3.5" />
                    <span>Dispatch & Fulfill Order</span>
                  </button>
                )}

                {order.status === 'dispatched' && (
                  <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 font-semibold rounded-lg border border-emerald-500/20">
                    Fulfilled & Shipped
                  </span>
                )}
              </div>
            </div>

          </div>
        ))}
      </div>

    </div>
  );
};
