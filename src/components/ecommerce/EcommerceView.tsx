import React, { useState } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { ShipStationPanel } from './ShipStationPanel';
import { ShopifyConnectPanel } from './ShopifyConnectPanel';
import { 
  ShoppingBag, 
  Store, 
  Globe, 
  ShieldAlert, 
  Key, 
  RefreshCw, 
  Play, 
  CheckCircle2, 
  AlertCircle, 
  Trash2, 
  ExternalLink, 
  Layers, 
  Terminal, 
  ArrowRight, 
  Box, 
  Info, 
  Sliders,
  DollarSign,
  TrendingUp,
  Cpu,
  Clock,
  Sparkles,
  Search,
  Check
} from 'lucide-react';
import { EcommercePlatform } from '../../types';

export const EcommerceView: React.FC = () => {
  const { 
    ecommerceOrders, 
    ecommerceChannels, 
    inventory,
    simulateEcommerceOrder, 
    deleteEcommerceOrder, 
    refreshAll 
  } = useInventory();

  // Active sub-tab: 'simulation' or 'webhooks'

  // Simulation form state
  const [selectedPlatform, setSelectedPlatform] = useState<EcommercePlatform>('shopify');
  const [customerName, setCustomerName] = useState('Sarah Jenkins (London)');
  const [productType, setProductType] = useState('cambridge_mug');
  const [orderQuantity, setOrderQuantity] = useState<number>(2);
  const [unitSellingPrice, setUnitSellingPrice] = useState<number>(8.99);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationResult, setSimulationResult] = useState<any>(null);

  // Webhook test state

  // Filter state for orders
  const connectedCount = ecommerceChannels.filter(c => c.connected).length;
  // Filter by the store an order actually came from, not a hardcoded platform
  const storeNames = [...new Set(ecommerceOrders.map(o => o.storeName).filter(Boolean))].sort() as string[];
  const [showSimulator, setShowSimulator] = useState(false);
  const [showShopifyDirect, setShowShopifyDirect] = useState(false);

  const [platformFilter, setPlatformFilter] = useState<'all' | EcommercePlatform>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Handle product preset changes
  const handleProductChange = (type: string) => {
    setProductType(type);
    if (type === 'cambridge_mug') {
      setUnitSellingPrice(8.99);
    } else if (type === 'black_mug') {
      setUnitSellingPrice(9.99);
    } else if (type === 'tote_bag') {
      setUnitSellingPrice(7.50);
    } else if (type === 'water_bottle') {
      setUnitSellingPrice(14.50);
    }
  };

  // Preview BOM explosion based on selection
  const getBOMPreview = () => {
    if (productType === 'cambridge_mug') {
      const blank = inventory.find(i => i.sku === 'BLANK-MUG-11-WHT');
      const box = inventory.find(i => i.sku === 'BOX-MUG-SMASH-1');
      return {
        productTitle: '11oz Cambridge Ceramic Mug (White)',
        blankSku: 'BLANK-MUG-11-WHT',
        blankName: '11oz Cambridge Ceramic Mug',
        blankStock: blank?.currentStock ?? 14200,
        blankCost: blank?.landedCostPerUnit ?? 0.75,
        boxSku: 'BOX-MUG-SMASH-1',
        boxName: '1-Pack Smashproof Box',
        boxStock: box?.currentStock ?? 9200,
        boxCost: box?.landedCostPerUnit ?? 0.18,
      };
    } else if (productType === 'black_mug') {
      const blank = inventory.find(i => i.sku === 'BLANK-MUG-11-BLK');
      const box = inventory.find(i => i.sku === 'BOX-MUG-SMASH-1');
      return {
        productTitle: '11oz Cambridge Ceramic Mug (Matte Black)',
        blankSku: 'BLANK-MUG-11-BLK',
        blankName: '11oz Cambridge Mug - Matte Black',
        blankStock: blank?.currentStock ?? 4800,
        blankCost: blank?.landedCostPerUnit ?? 0.88,
        boxSku: 'BOX-MUG-SMASH-1',
        boxName: '1-Pack Smashproof Box',
        boxStock: box?.currentStock ?? 9200,
        boxCost: box?.landedCostPerUnit ?? 0.18,
      };
    } else if (productType === 'tote_bag') {
      const blank = inventory.find(i => i.sku === 'BAG-TOTE-CANVAS-NAT');
      const box = inventory.find(i => i.sku === 'BOX-POLY-MAILER-MED');
      return {
        productTitle: '100% Cotton Canvas Tote Bag',
        blankSku: 'BAG-TOTE-CANVAS-NAT',
        blankName: 'Natural Cotton Canvas Tote Bag',
        blankStock: blank?.currentStock ?? 5600,
        blankCost: blank?.landedCostPerUnit ?? 0.92,
        boxSku: 'BOX-POLY-MAILER-MED',
        boxName: 'Grey Poly Mailer Bag',
        boxStock: box?.currentStock ?? 12500,
        boxCost: box?.landedCostPerUnit ?? 0.12,
      };
    } else {
      const blank = inventory.find(i => i.sku === 'BLANK-BOT-500-SIL');
      const box = inventory.find(i => i.sku === 'BOX-POLY-MAILER-MED');
      return {
        productTitle: '500ml Insulated Water Bottle - Silver',
        blankSku: 'BLANK-BOT-500-SIL',
        blankName: '500ml Insulated Water Bottle',
        blankStock: blank?.currentStock ?? 3100,
        blankCost: blank?.landedCostPerUnit ?? 2.10,
        boxSku: 'BOX-POLY-MAILER-MED',
        boxName: 'Grey Poly Mailer Bag',
        boxStock: box?.currentStock ?? 12500,
        boxCost: box?.landedCostPerUnit ?? 0.12,
      };
    }
  };

  const bomPreview = getBOMPreview();
  const estimatedOrderRevenue = Number((unitSellingPrice * orderQuantity).toFixed(2));
  const estimatedUnitLanded = Number((bomPreview.blankCost + bomPreview.boxCost).toFixed(2));
  const estimatedOrderCost = Number((estimatedUnitLanded * orderQuantity).toFixed(2));
  const estimatedOrderProfit = Number((estimatedOrderRevenue - estimatedOrderCost).toFixed(2));
  const estimatedMargin = estimatedOrderRevenue > 0 ? Number(((estimatedOrderProfit / estimatedOrderRevenue) * 100).toFixed(1)) : 0;

  // Run Order Simulation
  const handleSimulateOrder = async () => {
    setIsSimulating(true);
    setSimulationResult(null);
    try {
      const res = await simulateEcommerceOrder({
        platform: selectedPlatform,
        customerName: customerName.trim() || 'Online Customer',
        productType,
        quantity: orderQuantity,
        unitPrice: unitSellingPrice
      });
      setSimulationResult(res);
    } catch (err: any) {
      setSimulationResult({ success: false, message: err.message });
    } finally {
      setIsSimulating(false);
    }
  };

  // Filtered orders list
  const filteredOrders = ecommerceOrders.filter(order => {
    const matchesPlatform = platformFilter === 'all' || order.storeName === platformFilter;
    const matchesSearch = 
      order.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.items?.some(i => i.productTitle.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesPlatform && matchesSearch;
  });

  return (
    <div className="space-y-6">
      
      {/* Section 1: Connections */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-sm font-bold text-slate-900">Connections</h2>
          <span className="text-xs text-slate-500">
            {storeNames.length > 0 ? `${storeNames.length} store${storeNames.length === 1 ? '' : 's'} with orders` : 'No orders yet'}
          </span>
        </div>

        <ShipStationPanel />

        <button
          type="button"
          onClick={() => setShowShopifyDirect(v => !v)}
          aria-expanded={showShopifyDirect}
          className="flex w-full items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left transition-colors hover:bg-slate-50"
        >
          <span className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-900">Shopify direct connection</span>
            <span className="text-xs text-slate-500">
              Superseded by ShipStation, which already carries your Shopify stores. Kept for reference.
            </span>
          </span>
          <span className="text-xs font-semibold text-indigo-600">{showShopifyDirect ? 'Hide' : 'Show'}</span>
        </button>

        {showShopifyDirect && <ShopifyConnectPanel />}

      </section>

      {/* Section 2: Orders */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-sm font-bold text-slate-900">Orders</h2>
          <span className="text-xs text-slate-500">{ecommerceOrders.length} recorded</span>
        </div>

        <div className="space-y-4">
            <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <p className="text-xs text-slate-500">
                  Showing {filteredOrders.length} of {ecommerceOrders.length}
                  {' '}· stock deducted automatically once every line is mapped to a SKU
                </p>

                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      placeholder="Search orders..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none w-36 sm:w-44"
                    />
                  </div>

                  <button
                    onClick={() => refreshAll()}
                    className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition-all"
                    title="Refresh data"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Platform Filter Tabs */}
              <div className="flex items-center space-x-1.5 border-b border-slate-100 pb-2">
                {[
                  { id: 'all', label: 'All stores' },
                  ...storeNames.map(n => ({ id: n, label: n }))
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setPlatformFilter(tab.id as any)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                      platformFilter === tab.id
                        ? 'bg-slate-900 text-white font-bold'
                        : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Orders Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] font-bold text-slate-500">
                      <th scope="col" className="py-2.5 px-3">Order</th>
                      <th scope="col" className="py-2.5 px-3">Store</th>
                      <th scope="col" className="py-2.5 px-3">Customer</th>
                      <th scope="col" className="py-2.5 px-3">Items</th>
                      <th scope="col" className="py-2.5 px-3 text-right">Net</th>
                      <th scope="col" className="py-2.5 px-3 text-right">COGS</th>
                      <th scope="col" className="py-2.5 px-3 text-right">Margin</th>
                      <th scope="col" className="py-2.5 px-3">Stock</th>
                      <th scope="col" className="py-2.5 px-2 text-center">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredOrders.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-slate-400 text-xs">
                          No eCommerce orders found matching the filter criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredOrders.map(order => {
                        const lines = order.items || [];
                        const mappedLines = lines.filter(l => l.matchedBlankId).length;
                        const allMapped = lines.length > 0 && mappedLines === lines.length;
                        const isDeducted = order.stockDeducted === 1;
                        const net = order.subTotal ?? order.totalAmount ?? 0;

                        return (
                          <tr key={order.id} className="hover:bg-slate-50/70 transition-colors">
                            <td className="py-3 px-3">
                              <div className="font-mono font-bold text-slate-900">{order.orderNumber}</div>
                              <div className="text-[10px] text-slate-500">{order.orderDate}</div>
                            </td>

                            <td className="py-3 px-3">
                              <span className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                                {order.storeName || order.platform}
                              </span>
                            </td>

                            <td className="py-3 px-3">
                              <div className="max-w-[150px] truncate font-semibold text-slate-800" title={order.customerName}>
                                {order.customerName}
                              </div>
                            </td>

                            <td className="py-3 px-3 max-w-[260px]">
                              {lines.map((it, idx) => (
                                <div key={idx} className="space-y-0.5 py-0.5">
                                  <div className="truncate font-medium text-slate-800" title={it.productTitle}>
                                    {it.quantity}x {it.productTitle}
                                  </div>
                                  <div className="flex items-center gap-1.5 text-[10px]">
                                    <span className="font-mono text-slate-500">{it.skuSold || 'no SKU'}</span>
                                    {it.matchedBlankSku ? (
                                      <span className="font-medium text-emerald-700">→ {it.matchedBlankSku}</span>
                                    ) : (
                                      <span className="font-semibold text-pink-700">not mapped</span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </td>

                            <td className="py-3 px-3 text-right font-bold tabular-nums text-slate-900">
                              £{net.toFixed(2)}
                            </td>

                            <td className="py-3 px-3 text-right tabular-nums text-amber-700">
                              {allMapped ? `£${(order.totalLandedCost ?? 0).toFixed(2)}` : '—'}
                            </td>

                            <td className="py-3 px-3 text-right">
                              {allMapped ? (
                                <>
                                  <div className="font-bold tabular-nums text-emerald-700">
                                    £{(order.grossProfit ?? 0).toFixed(2)}
                                  </div>
                                  <div className="text-[10px] text-slate-500 tabular-nums">
                                    {order.marginPercent ?? 0}%
                                  </div>
                                </>
                              ) : (
                                <span className="text-[10px] text-slate-500">unknown until mapped</span>
                              )}
                            </td>

                            <td className="py-3 px-3">
                              {isDeducted ? (
                                <span className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                                  <Check className="h-3 w-3" /> Deducted
                                </span>
                              ) : allMapped ? (
                                <span className="inline-flex items-center rounded border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
                                  Ready
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded border border-pink-200 bg-pink-50 px-1.5 py-0.5 text-[10px] font-semibold text-pink-700">
                                  {lines.length - mappedLines} unmapped
                                </span>
                              )}
                            </td>

                            <td className="py-3 px-2 text-center">
                              <button
                                onClick={() => {
                                  if (window.confirm(
                                    `Delete order ${order.orderNumber}? This removes the order record but does not restore the stock it deducted.`
                                  )) deleteEcommerceOrder(order.id);
                                }}
                                className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                                title="Delete test order"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

            </div>
          </div>

      </section>

      {/* Section 3: Testing — secondary, collapsed by default */}
      <section className="space-y-3">
        <button
          type="button"
          onClick={() => setShowSimulator(v => !v)}
          aria-expanded={showSimulator}
          className="flex w-full items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left transition-colors hover:bg-slate-50"
        >
          <span className="flex items-center gap-2">
            <Sliders className="h-4 w-4 text-slate-500" />
            <span className="text-sm font-bold text-slate-900">Order simulator</span>
            <span className="text-xs text-slate-500">
              Create a test order to check BOM explosion and stock deduction
            </span>
          </span>
          <span className="text-xs font-semibold text-indigo-600">{showSimulator ? 'Hide' : 'Show'}</span>
        </button>

        {showSimulator && (
            <div className="space-y-4">
            <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <Sliders className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900">Inbound Order Simulator</h2>
                    <p className="text-[10px] text-slate-500">Test raw blank & box deductions before connecting live stores</p>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                  Sandbox Test
                </span>
              </div>

              {/* Form Controls */}
              <div className="space-y-3.5 text-xs">
                {/* Platform Selector */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Selling Channel / Platform</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'shopify', label: 'Shopify UK', icon: 'SPF' },
                      { id: 'amazon', label: 'Amazon UK', icon: 'AMZ' },
                      { id: 'ebay', label: 'eBay UK', icon: 'EBAY' }
                    ].map(p => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedPlatform(p.id as EcommercePlatform)}
                        className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all text-center ${
                          selectedPlatform === p.id 
                            ? 'bg-indigo-50 border-indigo-300 text-indigo-700 shadow-xs' 
                            : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <span className="block text-[10px] text-slate-400 font-normal">{p.icon}</span>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Customer Name */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Customer / Shipping Name</label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="e.g. John Smith (Manchester)"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-slate-50/50"
                  />
                </div>

                {/* Product Sold Preset */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Finished Product Ordered Online</label>
                  <select
                    value={productType}
                    onChange={(e) => handleProductChange(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white font-medium"
                  >
                    <option value="cambridge_mug">☕ 11oz Cambridge Ceramic Mug (White) - Most Popular</option>
                    <option value="black_mug">☕ 11oz Cambridge Ceramic Mug (Matte Black)</option>
                    <option value="tote_bag">👜 100% Natural Cotton Canvas Tote Bag</option>
                    <option value="water_bottle">💧 500ml Insulated Water Bottle - Silver</option>
                  </select>
                </div>

                {/* Quantity and Selling Price */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Quantity Sold</label>
                    <input
                      type="number"
                      min="1"
                      max="500"
                      value={orderQuantity}
                      onChange={(e) => setOrderQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">Unit Selling Price (£)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.10"
                      value={unitSellingPrice}
                      onChange={(e) => setUnitSellingPrice(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none font-bold text-emerald-700"
                    />
                  </div>
                </div>

                {/* Live BOM Explosion Preview Box */}
                <div className="bg-slate-50/80 rounded-xl p-3.5 border border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-800 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-indigo-600" />
                      Live BOM Explosion Breakdown
                    </span>
                    <span className="text-[10px] text-slate-500 font-medium">Automatic deduction</span>
                  </div>

                  <div className="space-y-1.5 text-[11px]">
                    <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-100">
                      <div className="flex items-center gap-1.5">
                        <Box className="w-3.5 h-3.5 text-indigo-500" />
                        <div>
                          <div className="font-bold text-slate-800">{bomPreview.blankName}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{bomPreview.blankSku}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-rose-600">-{orderQuantity} units</div>
                        <div className="text-[10px] text-slate-400">Stock: {bomPreview.blankStock}</div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-slate-100">
                      <div className="flex items-center gap-1.5">
                        <Box className="w-3.5 h-3.5 text-amber-500" />
                        <div>
                          <div className="font-bold text-slate-800">{bomPreview.boxName}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{bomPreview.boxSku}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-rose-600">-{orderQuantity} units</div>
                        <div className="text-[10px] text-slate-400">Stock: {bomPreview.boxStock}</div>
                      </div>
                    </div>
                  </div>

                  {/* Financial calculation */}
                  <div className="pt-2 border-t border-slate-200/60 grid grid-cols-3 gap-1 text-center text-[10px]">
                    <div className="bg-white p-1.5 rounded-lg border border-slate-100">
                      <span className="text-slate-400 block font-medium">Total Rev</span>
                      <span className="font-bold text-slate-800">£{estimatedOrderRevenue.toFixed(2)}</span>
                    </div>
                    <div className="bg-white p-1.5 rounded-lg border border-slate-100">
                      <span className="text-slate-400 block font-medium">Landed COGS</span>
                      <span className="font-bold text-slate-800">£{estimatedOrderCost.toFixed(2)}</span>
                    </div>
                    <div className="bg-emerald-50 p-1.5 rounded-lg border border-emerald-100">
                      <span className="text-emerald-700 block font-medium">Profit ({estimatedMargin}%)</span>
                      <span className="font-bold text-emerald-800">+£{estimatedOrderProfit.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {/* Simulate Button */}
                <button
                  type="button"
                  onClick={handleSimulateOrder}
                  disabled={isSimulating}
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white font-bold text-xs shadow-md shadow-indigo-500/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                >
                  {isSimulating ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Executing BOM Deduction...</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Simulate {selectedPlatform.toUpperCase()} Sale & Deduct Stock</span>
                    </>
                  )}
                </button>

                {/* Simulation Result Banner */}
                {simulationResult && (
                  <div className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 animate-in fade-in ${
                    simulationResult.success 
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                      : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}>
                    {simulationResult.success ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div className="font-bold">
                        {simulationResult.success ? `Order ${simulationResult.orderNumber} Created!` : 'Simulation Failed'}
                      </div>
                      <div className="text-[11px] mt-0.5">{simulationResult.message}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

        )}
      </section>


    </div>
  );
};
