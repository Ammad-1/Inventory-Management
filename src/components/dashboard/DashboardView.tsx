import React from 'react';
import { useInventory } from '../../context/InventoryContext';
import { MovementType } from '../../types';
import { 
  TrendingUp, 
  ShoppingCart, 
  PiggyBank, 
  BarChart3, 
  Ship, 
  Plus, 
  Minus, 
  ArrowRightLeft, 
  Download, 
  MoreHorizontal, 
  CheckCircle2, 
  AlertCircle,
  Package,
  FileText,
  Trash2,
  Calendar,
  Lock,
  Eye
} from 'lucide-react';

interface DashboardViewProps {
  onOpenNewShipment: () => void;
  onOpenCreateInvoice: () => void;
  onOpenScrapModal: () => void;
  onOpenAdjustStock: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onOpenNewShipment,
  onOpenCreateInvoice,
  onOpenScrapModal,
  onOpenAdjustStock
}) => {
  const { 
    inventory, 
    shipments, 
    invoices, 
    movements, 
    deductXeroInvoice,
    receiveShipment,
    valuationHistory,
    setActiveView 
  } = useInventory();

  // Metrics - every figure below is derived from live data. Where there is no
  // basis for a number (no history, no container, no revenue) the UI says so
  // rather than falling back to a placeholder.
  const totalValuation = inventory.reduce((sum, item) => sum + (item.currentStock * (item.landedCostPerUnit || item.costPerUnit || 0)), 0);
  const blanksStock = inventory.filter(i => i.category === 'blank').reduce((s, i) => s + i.currentStock, 0);
  const packagingStock = inventory.filter(i => i.category === 'packaging').reduce((s, i) => s + i.currentStock, 0);
  const consumablesStock = inventory.filter(i => i.category === 'consumable').reduce((s, i) => s + i.currentStock, 0);
  const totalUnits = blanksStock + packagingStock + consumablesStock;

  const inTransitShipments = shipments.filter(s => s.status === 'on_water' || s.status === 'customs_clearance');
  const activeContainer = inTransitShipments[0] || shipments[0];
  const inTransitValueGBP = inTransitShipments.reduce((sum, s) => sum + (s.totalLandedGBP || 0), 0);

  const totalInvoiceRevenue = invoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
  const totalTrueLandedCost = invoices.reduce((sum, inv) => sum + (inv.totalLandedCost || 0), 0);
  const grossProfitGBP = totalInvoiceRevenue - totalTrueLandedCost;
  const hasRevenue = totalInvoiceRevenue > 0;
  const averageMargin = hasRevenue ? (grossProfitGBP / totalInvoiceRevenue) * 100 : 0;

  const scrapMovements = movements.filter(m => m.movementType === 'scrap_defect');
  const totalScrappedUnits = Math.abs(scrapMovements.reduce((sum, m) => sum + m.quantityDelta, 0));
  // Cost the scrap at the unit cost recorded on each movement, not a flat guess
  const scrapCostGBP = scrapMovements.reduce((sum, m) => sum + Math.abs(m.quantityDelta) * (m.unitCost || 0), 0);

  // Month-over-month invoiced sales, computed from the invoice dates we hold
  const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  const nowDate = new Date();
  const thisMonthKey = monthKey(nowDate);
  const prevMonthKey = monthKey(new Date(Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth() - 1, 1)));
  const revenueInMonth = (key: string) => invoices
    .filter(inv => (inv.invoiceDate || '').slice(0, 7) === key)
    .reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
  const thisMonthRevenue = revenueInMonth(thisMonthKey);
  const prevMonthRevenue = revenueInMonth(prevMonthKey);
  const salesChangePercent = prevMonthRevenue > 0
    ? ((thisMonthRevenue - prevMonthRevenue) / prevMonthRevenue) * 100
    : null;

  // Units shipped out per month, from the sales side of the movement ledger
  const outboundTypes: MovementType[] = ['xero_sale_deduct', 'ecommerce_sale'];
  const shippedByMonth = (valuationHistory?.points || []).map(pt => {
    const key = pt.date.slice(0, 7);
    const units = movements
      .filter(m => outboundTypes.includes(m.movementType) && (m.createdAt || '').slice(0, 7) === key)
      .reduce((sum, m) => sum + Math.abs(m.quantityDelta), 0);
    return { label: pt.label, units };
  });
  const shippedThisMonth = shippedByMonth[shippedByMonth.length - 1]?.units || 0;
  const shippedPrevMonth = shippedByMonth[shippedByMonth.length - 2]?.units || 0;
  const shippedChangePercent = shippedPrevMonth > 0
    ? ((shippedThisMonth - shippedPrevMonth) / shippedPrevMonth) * 100
    : null;
  const maxShipped = Math.max(...shippedByMonth.map(b => b.units), 1);

  // Chart geometry, scaled to the real series
  const points = valuationHistory?.points || [];
  const chartMax = Math.max(...points.map(p => p.valuation), 1);
  const chartTop = Math.ceil(chartMax * 1.15);
  const chartX = (i: number) => points.length > 1 ? 40 + (i * (540 / (points.length - 1))) : 300;
  const chartY = (v: number) => 190 - (v / chartTop) * 150;

  return (
    <div className="space-y-6 pb-12">
      
      {/* 1. Top 4 Metric Cards (Identical to Reference Header Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        
        {/* Card 1: Stock Valuation */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-[0_2px_10px_rgba(0,0,0,0.03)] hover:shadow-md transition-all">
          <div className="flex items-center space-x-2.5 mb-3">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
            <span className="text-xs font-semibold text-slate-500">Stock Valuation (Landed)</span>
          </div>

          <div className="text-2xl font-extrabold text-slate-900 tracking-tight">
            £{totalValuation.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </div>

          <div className="flex items-center space-x-2 mt-2">
            {valuationHistory?.changePercent !== null && valuationHistory?.changePercent !== undefined ? (
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5 ${
                valuationHistory.changePercent >= 0
                  ? 'text-emerald-700 bg-emerald-50'
                  : 'text-rose-700 bg-rose-50'
              }`}>
                {valuationHistory.changePercent >= 0 ? '▲' : '▼'} {valuationHistory.changePercent > 0 ? '+' : ''}{valuationHistory.changePercent}%
              </span>
            ) : (
              <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                No prior month
              </span>
            )}
            <span className="text-xs text-slate-500 font-medium">
              {blanksStock.toLocaleString()} mugs & totes
            </span>
          </div>
        </div>

        {/* Card 2: China Inbound Transit */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-[0_2px_10px_rgba(0,0,0,0.03)] hover:shadow-md transition-all">
          <div className="flex items-center space-x-2.5 mb-3">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Ship className="w-4 h-4" />
            </div>
            <span className="text-xs font-semibold text-slate-500">China Inbound & Sea Freight</span>
          </div>

          <div className="text-2xl font-extrabold text-slate-900 tracking-tight">
            £{inTransitValueGBP.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </div>

          <div className="flex items-center space-x-2 mt-2">
            {inTransitShipments.length > 0 ? (
              <>
                <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full flex items-center gap-0.5">
                  ● On Water
                </span>
                <span className="text-xs text-slate-500 font-medium">
                  {inTransitShipments.length} container{inTransitShipments.length === 1 ? '' : 's'} in transit
                </span>
              </>
            ) : (
              <span className="text-xs text-slate-500 font-medium">No containers in transit</span>
            )}
          </div>
        </div>

        {/* Card 3: Xero Invoiced Sales */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-[0_2px_10px_rgba(0,0,0,0.03)] hover:shadow-md transition-all">
          <div className="flex items-center space-x-2.5 mb-3">
            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
            <span className="text-xs font-semibold text-slate-500">Invoiced Sales (Xero)</span>
          </div>

          <div className="text-2xl font-extrabold text-slate-900 tracking-tight">
            £{totalInvoiceRevenue.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </div>

          <div className="flex items-center space-x-2 mt-2">
            {salesChangePercent !== null ? (
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5 ${
                salesChangePercent >= 0 ? 'text-emerald-700 bg-emerald-50' : 'text-rose-700 bg-rose-50'
              }`}>
                {salesChangePercent >= 0 ? '▲' : '▼'} {salesChangePercent > 0 ? '+' : ''}{salesChangePercent.toFixed(1)}%
              </span>
            ) : (
              <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                No prior month
              </span>
            )}
            <span className="text-xs text-slate-500 font-medium">
              {invoices.length} synced invoice{invoices.length === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        {/* Card 4: True Net Gross Margin */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-[0_2px_10px_rgba(0,0,0,0.03)] hover:shadow-md transition-all">
          <div className="flex items-center space-x-2.5 mb-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <BarChart3 className="w-4 h-4" />
            </div>
            <span className="text-xs font-semibold text-slate-500">Real Gross Margin</span>
          </div>

          <div className="text-2xl font-extrabold text-slate-900 tracking-tight">
            {hasRevenue ? `${averageMargin.toFixed(1)}%` : '--'}
          </div>

          <div className="flex items-center space-x-2 mt-2">
            <span className="text-xs text-slate-500 font-medium">
              {hasRevenue
                ? 'Net of freight, boxes & scrap'
                : 'No invoiced revenue yet'}
            </span>
          </div>
        </div>

      </div>

      {/* 2. Middle Section: Area Chart (Left) + Container Card & Quick Actions (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Smooth Area Chart Card (Balance Evolution style) */}
        <div className="lg:col-span-2 bg-white border border-slate-200/80 rounded-2xl p-6 shadow-[0_2px_10px_rgba(0,0,0,0.03)] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-slate-800 text-sm">Stock Valuation Trend</h3>
                <p className="text-xs text-slate-500">Month-end landed valuation, derived from the stock movement ledger</p>
              </div>
              <span className="text-xs font-medium text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
                Last {points.length} months
              </span>
            </div>

            {valuationHistory?.hasHistory ? (
              <div className="relative pt-6 pb-2">
                <svg className="w-full h-52 overflow-visible" viewBox="0 0 600 200" role="img"
                     aria-label={`Stock valuation over the last ${points.length} months`}>
                  <defs>
                    <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Grid lines and y-axis, scaled to the real maximum */}
                  {[0, 0.25, 0.5, 0.75, 1].map(frac => {
                    const y = 190 - frac * 150;
                    return (
                      <g key={frac}>
                        <line x1="46" y1={y} x2="600" y2={y} stroke="#f1f5f9" strokeWidth="1" />
                        <text x="0" y={y + 4} fill="#64748b" fontSize="10">
                          {Math.round((chartTop * frac) / 1000)} k£
                        </text>
                      </g>
                    );
                  })}

                  <polygon
                    fill="url(#areaGradient)"
                    points={[
                      ...points.map((pt, i) => `${chartX(i)},${chartY(pt.valuation)}`),
                      `${chartX(points.length - 1)},190`,
                      `${chartX(0)},190`
                    ].join(' ')}
                  />

                  <polyline
                    fill="none"
                    stroke="#6366f1"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={points.map((pt, i) => `${chartX(i)},${chartY(pt.valuation)}`).join(' ')}
                  />

                  {points.map((pt, i) => (
                    <circle
                      key={pt.date}
                      cx={chartX(i)}
                      cy={chartY(pt.valuation)}
                      r={i === points.length - 1 ? 4.5 : 3}
                      fill="#ffffff"
                      stroke="#6366f1"
                      strokeWidth={i === points.length - 1 ? 3 : 2}
                    >
                      <title>{`${pt.label}: £${pt.valuation.toLocaleString('en-GB')}`}</title>
                    </circle>
                  ))}
                </svg>

                <div className="flex items-center justify-between text-xs text-slate-500 font-medium mt-1 pl-10">
                  {points.map(pt => <span key={pt.date}>{pt.label}</span>)}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-center px-6">
                <div className="w-11 h-11 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mb-3">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <p className="text-sm font-semibold text-slate-700">Not enough history yet</p>
                <p className="text-xs text-slate-500 mt-1 max-w-xs">
                  {valuationHistory?.movementCount
                    ? 'Valuation is tracked from the movement ledger. A trend appears once stock has moved in at least two separate months.'
                    : 'Receive a container or adjust stock to start building the valuation history.'}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Inbound Container Card & Quick Actions */}
        <div className="space-y-6">
          
          {/* Card 1: Mes Cartes style (China Inbound Container Card) */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-[0_2px_10px_rgba(0,0,0,0.03)]">
            <div className="flex items-center justify-between mb-3">
              <span className="font-bold text-slate-800 text-sm">Active Container</span>
              <MoreHorizontal className="w-4 h-4 text-slate-400 cursor-pointer" />
            </div>

            {/* Container card - rendered only when a real shipment exists */}
            {activeContainer ? (
              <div className="bg-gradient-to-tr from-slate-900 via-indigo-950 to-indigo-900 text-white rounded-2xl p-5 shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none"></div>

                <div className="flex items-center justify-between mb-4 relative z-10">
                  <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center backdrop-blur-xs">
                      <Ship className="w-4 h-4 text-indigo-300" />
                    </div>
                    <span className="text-xs font-mono font-bold tracking-wider text-white">
                      {activeContainer.containerNumber}
                    </span>
                  </div>
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-white/15 text-indigo-100 border border-white/20 font-semibold backdrop-blur-xs">
                    {activeContainer.supplierName}
                  </span>
                </div>

                <div className="space-y-1 my-3 relative z-10">
                  <div className="text-xs text-indigo-200 font-medium">Active Voyage Landed Investment</div>
                  <div className="text-2xl font-extrabold tracking-tight text-white font-mono">
                    £{activeContainer.totalLandedGBP.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-indigo-100 pt-3 border-t border-white/10 mt-3 font-medium relative z-10">
                  <span>ETA: {activeContainer.etaDate || 'Not set'}</span>
                  <span className="capitalize">{activeContainer.status.replace(/_/g, ' ')}</span>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                <Ship className="w-5 h-5 text-slate-400 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-700">No containers yet</p>
                <p className="text-xs text-slate-500 mt-1">
                  Log an inbound shipment to track its landed cost here.
                </p>
              </div>
            )}

            {/* 3 Quick Action Pills Under Container */}
            <div className="grid grid-cols-3 gap-2 mt-3 pt-1 text-center">
              <button 
                onClick={() => setActiveView('shipments')}
                className="py-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-[11px] font-semibold text-slate-700 flex flex-col items-center gap-1 border border-slate-200 transition-all"
              >
                <Ship className="w-3.5 h-3.5 text-indigo-600" />
                <span>Track</span>
              </button>

              <button 
                onClick={() => {
                  if (!activeContainer) return;
                  const ok = window.confirm(
                    `Receive container ${activeContainer.containerNumber} into the warehouse?\n\n` +
                    `This adds its units to stock and recalculates landed cost. It cannot be undone.`
                  );
                  if (ok) receiveShipment(activeContainer.id);
                }}
                disabled={!activeContainer}
                className="py-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-[11px] font-semibold text-slate-700 flex flex-col items-center gap-1 border border-slate-200 transition-all"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Receive</span>
              </button>

              <button 
                onClick={onOpenNewShipment}
                className="py-2 rounded-xl bg-slate-50 hover:bg-slate-100 text-[11px] font-semibold text-slate-700 flex flex-col items-center gap-1 border border-slate-200 transition-all"
              >
                <Plus className="w-3.5 h-3.5 text-slate-500" />
                <span>New</span>
              </button>
            </div>
          </div>

          {/* Card 2: Quick Actions (Like Reference Image: 4 circular buttons) */}
          <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-[0_2px_10px_rgba(0,0,0,0.03)]">
            <h3 className="font-bold text-slate-800 text-sm mb-3">Quick Actions</h3>

            <div className="grid grid-cols-4 gap-2 text-center">
              {/* Button 1: Stock In */}
              <button 
                onClick={onOpenAdjustStock}
                className="flex flex-col items-center group cursor-pointer"
              >
                <div className="w-11 h-11 rounded-2xl bg-slate-100 group-hover:bg-indigo-50 group-hover:text-indigo-600 text-slate-700 flex items-center justify-center transition-all shadow-xs">
                  <Plus className="w-5 h-5" />
                </div>
                <span className="text-[11px] font-medium text-slate-600 mt-1.5">Stock In</span>
              </button>

              {/* Button 2: Scrap / Defect */}
              <button 
                onClick={onOpenScrapModal}
                className="flex flex-col items-center group cursor-pointer"
              >
                <div className="w-11 h-11 rounded-2xl bg-slate-100 group-hover:bg-rose-50 group-hover:text-rose-600 text-slate-700 flex items-center justify-center transition-all shadow-xs">
                  <Minus className="w-5 h-5" />
                </div>
                <span className="text-[11px] font-medium text-slate-600 mt-1.5">Scrap</span>
              </button>

              {/* Button 3: Adjust Count */}
              <button 
                onClick={onOpenAdjustStock}
                className="flex flex-col items-center group cursor-pointer"
              >
                <div className="w-11 h-11 rounded-2xl bg-slate-100 group-hover:bg-blue-50 group-hover:text-blue-600 text-slate-700 flex items-center justify-center transition-all shadow-xs">
                  <ArrowRightLeft className="w-5 h-5" />
                </div>
                <span className="text-[11px] font-medium text-slate-600 mt-1.5">Adjust</span>
              </button>

              {/* Button 4: Receive Container */}
              <button 
                onClick={() => setActiveView('shipments')}
                className="flex flex-col items-center group cursor-pointer"
              >
                <div className="w-11 h-11 rounded-2xl bg-slate-100 group-hover:bg-emerald-50 group-hover:text-emerald-600 text-slate-700 flex items-center justify-center transition-all shadow-xs">
                  <Download className="w-5 h-5" />
                </div>
                <span className="text-[11px] font-medium text-slate-600 mt-1.5">Inbound</span>
              </button>
            </div>
          </div>

        </div>

      </div>

      {/* 3. Lower Section: 3 Summary Cards (Bar chart, Donut, and Circular Goal) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Card 1: Units shipped out per month, from the movement ledger */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-[0_2px_10px_rgba(0,0,0,0.03)] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="font-bold text-slate-800 text-sm">Units Shipped</span>
            </div>

            <div className="flex items-center space-x-2 my-1">
              {shippedChangePercent !== null ? (
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  shippedChangePercent >= 0 ? 'text-emerald-700 bg-emerald-50' : 'text-rose-700 bg-rose-50'
                }`}>
                  {shippedChangePercent > 0 ? '+' : ''}{shippedChangePercent.toFixed(1)}%
                </span>
              ) : (
                <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                  No prior month
                </span>
              )}
              <span className="text-xs text-slate-500">vs last month</span>
            </div>

            <div className="text-2xl font-extrabold text-slate-900 mt-1">
              {shippedThisMonth.toLocaleString()} pcs
            </div>
            <div className="text-xs text-slate-500">Deducted for Xero and online orders</div>
          </div>

          {shippedByMonth.some(b => b.units > 0) ? (
            <div className="flex items-end justify-between h-20 pt-4 px-2 gap-1">
              {shippedByMonth.map((bar, i) => (
                <div key={bar.label + i} className="flex flex-col items-center gap-1 flex-1">
                  <div
                    className={`w-4 rounded-t-sm ${
                      i === shippedByMonth.length - 1 ? 'bg-indigo-600' : 'bg-indigo-200'
                    }`}
                    style={{ height: `${Math.max(2, (bar.units / maxShipped) * 56)}px` }}
                    title={`${bar.label}: ${bar.units.toLocaleString()} pcs`}
                  ></div>
                  <span className={`text-[11px] ${
                    i === shippedByMonth.length - 1 ? 'text-slate-800 font-bold' : 'text-slate-500'
                  }`}>
                    {bar.label.charAt(0)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500 pt-4">No outbound movements recorded yet.</p>
          )}
        </div>

        {/* Card 2: Stock Breakdown - real category split by units on hand */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-[0_2px_10px_rgba(0,0,0,0.03)]">
          <div className="flex items-center justify-between mb-2">
            <span className="font-bold text-slate-800 text-sm">Stock Breakdown</span>
          </div>

          {totalUnits > 0 ? (
            <div className="flex items-center space-x-4 pt-2">
              <div className="relative w-24 h-24 shrink-0 flex items-center justify-center">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36" role="img"
                     aria-label="Share of units on hand by category">
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none" stroke="#f1f5f9" strokeWidth="4"
                  />
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none" stroke="#4f46e5" strokeWidth="4.5"
                    strokeDasharray={`${(blanksStock / totalUnits) * 100}, 100`}
                  />
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none" stroke="#818cf8" strokeWidth="4.5"
                    strokeDasharray={`${(packagingStock / totalUnits) * 100}, 100`}
                    strokeDashoffset={`-${(blanksStock / totalUnits) * 100}`}
                  />
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none" stroke="#cbd5e1" strokeWidth="4.5"
                    strokeDasharray={`${(consumablesStock / totalUnits) * 100}, 100`}
                    strokeDashoffset={`-${((blanksStock + packagingStock) / totalUnits) * 100}`}
                  />
                </svg>
                <div className="absolute text-center">
                  <span className="text-xs font-extrabold text-slate-800">{totalUnits.toLocaleString()}</span>
                  <span className="block text-[10px] text-slate-500 uppercase">Units</span>
                </div>
              </div>

              <div className="space-y-1.5 text-xs">
                {[
                  { label: 'Mugs & Blanks', units: blanksStock, dot: 'bg-indigo-600' },
                  { label: 'Boxes & Packaging', units: packagingStock, dot: 'bg-indigo-400' },
                  { label: 'Consumables', units: consumablesStock, dot: 'bg-slate-300' }
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between gap-4">
                    <span className="flex items-center gap-1.5 text-slate-600">
                      <span className={`w-2 h-2 rounded-full ${row.dot}`}></span>
                      {row.label}
                    </span>
                    <span className="font-bold text-slate-800">
                      {Math.round((row.units / totalUnits) * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-500 py-8 text-center">No stock on hand to break down yet.</p>
          )}
        </div>

        {/* Card 3: Financial Summary - real revenue, cost, scrap and margin */}
        <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-[0_2px_10px_rgba(0,0,0,0.03)]">
          <div className="flex items-center justify-between mb-2">
            <span className="font-bold text-slate-800 text-sm">Financial Summary</span>
            <span className="text-xs text-slate-500 font-medium">All invoices</span>
          </div>

          <div className="flex items-center space-x-4 pt-2">
            <div className="relative w-20 h-20 shrink-0 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36" role="img"
                   aria-label={hasRevenue ? `Gross margin ${averageMargin.toFixed(1)} percent` : 'No margin data'}>
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none" stroke="#f1f5f9" strokeWidth="3.5"
                />
                {hasRevenue && (
                  <path
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke={averageMargin >= 0 ? '#4f46e5' : '#e11d48'}
                    strokeWidth="3.5"
                    strokeDasharray={`${Math.min(100, Math.abs(averageMargin))}, 100`}
                  />
                )}
              </svg>
              <div className="absolute text-center">
                <span className="text-sm font-extrabold text-slate-900">
                  {hasRevenue ? `${Math.round(averageMargin)}%` : '--'}
                </span>
              </div>
            </div>

            <div className="space-y-1 text-xs">
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Total Revenue:</span>
                <strong className="text-slate-900">£{totalInvoiceRevenue.toFixed(0)}</strong>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Landed Cost:</span>
                <strong className="text-slate-900">£{totalTrueLandedCost.toFixed(0)}</strong>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Press Scrap:</span>
                <strong className="text-rose-600">£{scrapCostGBP.toFixed(0)}</strong>
              </div>
            </div>
          </div>

          <div className="mt-3 pt-2 border-t border-slate-100">
            <div className="flex justify-between text-xs text-slate-500">
              <span>Gross profit</span>
              <span className={`font-bold ${grossProfitGBP >= 0 ? 'text-slate-800' : 'text-rose-600'}`}>
                £{grossProfitGBP.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between text-xs text-slate-500 mt-0.5">
              <span>Scrapped units</span>
              <span className="font-bold text-slate-800">{totalScrappedUnits.toLocaleString()}</span>
            </div>
          </div>
        </div>

      </div>

      {/* 4. Bottom Table: Transaction History */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-[0_2px_10px_rgba(0,0,0,0.03)]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-slate-800 text-sm">Transaction History</h3>
            <p className="text-xs text-slate-400">Latest stock movements, automated Xero sales deductions and scrap records</p>
          </div>

          <button
            onClick={() => setActiveView('movements')}
            className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 transition-all"
          >
            View all &rarr;
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-[11px] text-slate-400 font-semibold border-b border-slate-100">
              <tr>
                <th className="pb-3 font-semibold">Date</th>
                <th className="pb-3 font-semibold">Description</th>
                <th className="pb-3 font-semibold">Category</th>
                <th className="pb-3 font-semibold">Method / Reference</th>
                <th className="pb-3 font-semibold text-right">Amount / Delta</th>
                <th className="pb-3 font-semibold text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {movements.slice(0, 5).map(m => {
                const isPositive = m.quantityDelta > 0;
                const isScrap = m.movementType === 'scrap_defect';
                const isXero = m.movementType === 'xero_sale_deduct';
                const isImport = m.movementType === 'purchase_received';

                return (
                  <tr key={m.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 text-slate-500 font-medium">
                      {new Date(m.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>

                    <td className="py-3 font-medium text-slate-900">
                      <div>{m.itemName}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{m.sku}</div>
                    </td>

                    <td className="py-3">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        isXero
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                          : isScrap
                          ? 'bg-rose-50 text-rose-700 border border-rose-200/60'
                          : isImport
                          ? 'bg-blue-50 text-blue-700 border border-blue-200/60'
                          : 'bg-indigo-50 text-indigo-700 border border-indigo-200/60'
                      }`}>
                        {isXero ? 'Xero Sale' : isScrap ? 'Factory Scrap' : isImport ? 'China Import' : 'Adjustment'}
                      </span>
                    </td>

                    <td className="py-3 text-slate-500">
                      {m.referenceId || m.operatorName || 'Automatic'}
                    </td>

                    <td className="py-3 text-right font-mono font-bold">
                      <span className={isPositive ? 'text-emerald-600' : 'text-slate-800'}>
                        {isPositive ? `+${m.quantityDelta} pcs` : `${m.quantityDelta} pcs`}
                      </span>
                    </td>

                    <td className="py-3 text-right text-slate-400">
                      <MoreHorizontal className="w-4 h-4 inline cursor-pointer hover:text-slate-700" />
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
