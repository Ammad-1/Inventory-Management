import React, { useState, useRef, useEffect } from 'react';
import { 
  Play, 
  RotateCcw, 
  Ship, 
  Printer, 
  Receipt, 
  RefreshCw, 
  Bell, 
  Terminal, 
  CheckCircle2, 
  AlertCircle,
  XCircle,
  ArrowRight,
  ShieldAlert,
  Sparkles
} from 'lucide-react';

export const ArchitectureView: React.FC = () => {
  const [activeStep, setActiveStep] = useState<number | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [orderQuantity, setOrderQuantity] = useState(5000);
  const [scrapPercent, setScrapPercent] = useState(2.5);
  const [logs, setLogs] = useState<Array<{ text: string; color: string; time: string }>>([
    { time: '09:00:00', text: '// System initialized. Connected to Xero API sandbox & China Shipping Telemetry.', color: 'text-slate-500' },
    { time: '09:00:01', text: '[INIT] Raw stock loaded: 100,000 Grade-A Sublimation Mugs (Container #CN-88421).', color: 'text-slate-400' },
    { time: '09:00:02', text: '[COSTING] Landed cost established: $0.85/unit (includes sea freight, tariff & drayage).', color: 'text-slate-400' },
    { time: '09:00:03', text: '[LISTENER] Listening for Xero webhook: Invoices.Approved ...', color: 'text-slate-400' },
  ]);

  const consoleEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const addLog = (text: string, color: string = 'text-slate-300') => {
    const now = new Date();
    const time = now.toTimeString().split(' ')[0];
    setLogs(prev => [...prev, { time, text, color }]);
  };

  const runSimulation = () => {
    if (isSimulating) return;
    setIsSimulating(true);

    const scrapUnits = Math.ceil(orderQuantity * (scrapPercent / 100));
    const totalDeduction = orderQuantity + scrapUnits;
    const inkVolumeLiters = ((orderQuantity * 2.1) / 1000).toFixed(2);
    const invoiceNum = `INV-2026-${Math.floor(1000 + Math.random() * 9000)}`;

    addLog(`----------------------------------------------------------------------`, 'text-slate-700');
    addLog(`[EVENT] Received live sales request: ${orderQuantity.toLocaleString()} Custom Mugs for 'Apex Global Tech'.`, 'text-cyan-300 font-bold');

    // Step 1
    setActiveStep(1);
    setTimeout(() => {
      addLog(`[STEP 1: INBOUND VERIFICATION] Warehouse batch checked: China container lot #CN-88421 verified on shelf A-12.`, 'text-emerald-400');
    }, 400);

    // Step 2
    setTimeout(() => {
      setActiveStep(2);
      addLog(`[STEP 2: BOM EXPLOSION] Recipe generated: ${orderQuantity.toLocaleString()} finished mugs require ${totalDeduction.toLocaleString()} ceramic blanks (at ${scrapPercent}% scrap) + ${inkVolumeLiters}L CMYK sublimation ink.`, 'text-blue-400');
    }, 1500);

    // Step 3
    setTimeout(() => {
      setActiveStep(3);
      addLog(`[STEP 3: XERO WEBHOOK] Webhook 'Invoices.Approved' received for Invoice #${invoiceNum}. Validation token verified.`, 'text-cyan-400');
    }, 2700);

    // Step 4
    setTimeout(() => {
      setActiveStep(4);
      addLog(`[STEP 4: AUTOMATED DEDUCTION] Decremented ${totalDeduction.toLocaleString()} raw mugs and ${inkVolumeLiters}L ink from ERP master inventory. Reserved WIP status released to dispatched.`, 'text-indigo-400');
    }, 3900);

    // Step 5
    setTimeout(() => {
      setActiveStep(5);
      const daysRemaining = Math.max(12, Math.floor(45 - (orderQuantity / 400)));
      addLog(`[STEP 5: AI FORECAST ENGINE] Daily velocity updated to 615 mugs/day. Recalculated 45-day sea transit window. Reorder alert scheduled in ${daysRemaining} days.`, 'text-purple-300 font-bold');
      setIsSimulating(false);
    }, 5200);
  };

  const clearLogs = () => {
    setLogs([
      { time: '09:00:00', text: '// Console cleared. System online and ready.', color: 'text-slate-500' }
    ]);
    setActiveStep(null);
  };

  return (
    <div className="space-y-6">
      
      {/* View Heading */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
        <div>
          <h2 className="text-xl sm:text-2xl font-heading font-extrabold text-white flex items-center gap-2">
            <span>Automated Factory Architecture Diagram</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Step-by-step visual sequence: From China sea freight receipt &rarr; Shop-floor production &rarr; Xero Invoicing &rarr; Smart BOM Deduction &rarr; AI Predictive Alert.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Custom controls */}
          <div className="flex items-center space-x-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
            <span className="text-slate-400">Order:</span>
            <select
              value={orderQuantity}
              onChange={(e) => setOrderQuantity(Number(e.target.value))}
              disabled={isSimulating}
              className="bg-transparent text-white font-semibold focus:outline-none cursor-pointer"
            >
              <option value="2500" className="bg-slate-900">2,500 Mugs</option>
              <option value="5000" className="bg-slate-900">5,000 Mugs</option>
              <option value="10000" className="bg-slate-900">10,000 Mugs</option>
              <option value="20000" className="bg-slate-900">20,000 Mugs</option>
            </select>
          </div>

          <button
            id="simulateFlowBtn"
            onClick={runSimulation}
            disabled={isSimulating}
            className={`px-4 py-2 rounded-xl text-xs font-bold text-white shadow-lg transition flex items-center gap-2 ${
              isSimulating
                ? 'bg-slate-700 cursor-not-allowed text-slate-400'
                : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30'
            }`}
          >
            <Play className={`w-3.5 h-3.5 ${isSimulating ? 'animate-spin' : ''}`} />
            <span>{isSimulating ? 'Executing Sequence...' : `Animate Order Flow (${orderQuantity.toLocaleString()} Mugs)`}</span>
          </button>
        </div>
      </div>

      <div className="bg-slate-950 border border-slate-800 rounded-3xl p-6 sm:p-8 space-y-8 shadow-2xl">
        
        {/* Interactive 5-Step Pipeline Strip */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 relative">
          
          {/* Step 1 */}
          <div className={`step-card bg-slate-900 border rounded-2xl p-4 transition-all duration-300 text-left ${
            activeStep === 1 
              ? 'border-emerald-500 ring-2 ring-emerald-500/40 bg-emerald-950/30 shadow-lg shadow-emerald-500/20 transform -translate-y-1'
              : 'border-slate-800'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Step 1</span>
              <Ship className="w-4 h-4 text-emerald-400" />
            </div>
            <h4 className="text-sm font-heading font-bold text-white">100k Mugs Inbound</h4>
            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
              Arrival at warehouse. System calculates True Landed Cost ($0.85/mug) factoring freight &amp; customs.
            </p>
            <div className="mt-3 text-[11px] bg-slate-950 p-2 rounded-lg border border-slate-800/80 font-mono text-emerald-300 flex items-center justify-between">
              <span>Stock Ledger</span>
              <span className="font-bold">+100,000 Raw</span>
            </div>
          </div>

          {/* Step 2 */}
          <div className={`step-card bg-slate-900 border rounded-2xl p-4 transition-all duration-300 text-left ${
            activeStep === 2 
              ? 'border-blue-500 ring-2 ring-blue-500/40 bg-blue-950/30 shadow-lg shadow-blue-500/20 transform -translate-y-1'
              : 'border-slate-800'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">Step 2</span>
              <Printer className="w-4 h-4 text-blue-400" />
            </div>
            <h4 className="text-sm font-heading font-bold text-white">Factory Printing</h4>
            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
              Production runs {orderQuantity.toLocaleString()} custom mugs. Sublimation heat press runs with scrap compensation.
            </p>
            <div className="mt-3 text-[11px] bg-slate-950 p-2 rounded-lg border border-slate-800/80 font-mono text-blue-300 flex items-center justify-between">
              <span>Heat Defect Scrap</span>
              <span className="font-bold">+{scrapPercent}% factored</span>
            </div>
          </div>

          {/* Step 3 */}
          <div className={`step-card bg-slate-900 border rounded-2xl p-4 transition-all duration-300 text-left ${
            activeStep === 3 
              ? 'border-cyan-500 ring-2 ring-cyan-500/40 bg-cyan-950/30 shadow-lg shadow-cyan-500/20 transform -translate-y-1'
              : 'border-slate-800'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">Step 3</span>
              <Receipt className="w-4 h-4 text-cyan-400" />
            </div>
            <h4 className="text-sm font-heading font-bold text-white">Xero Invoicing</h4>
            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
              Sales rep clicks "Approve" in Xero. Encrypted webhook fires to our app within 400ms.
            </p>
            <div className="mt-3 text-[11px] bg-slate-950 p-2 rounded-lg border border-slate-800/80 font-mono text-cyan-300 flex items-center justify-between">
              <span>Webhook Payload</span>
              <span className="font-bold">#INV-2026-OK</span>
            </div>
          </div>

          {/* Step 4 */}
          <div className={`step-card bg-slate-900 border rounded-2xl p-4 transition-all duration-300 text-left ${
            activeStep === 4 
              ? 'border-indigo-500 ring-2 ring-indigo-500/40 bg-indigo-950/30 shadow-lg shadow-indigo-500/20 transform -translate-y-1'
              : 'border-slate-800'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">Step 4</span>
              <RefreshCw className="w-4 h-4 text-indigo-400" />
            </div>
            <h4 className="text-sm font-heading font-bold text-white">Smart BOM Deduction</h4>
            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
              Decomposes finished goods into raw blanks ({Math.ceil(orderQuantity * (1 + scrapPercent / 100)).toLocaleString()}) &amp; ink volume.
            </p>
            <div className="mt-3 text-[11px] bg-slate-950 p-2 rounded-lg border border-slate-800/80 font-mono text-indigo-300 flex items-center justify-between">
              <span>Auto-Deducted</span>
              <span className="font-bold">-{Math.ceil(orderQuantity * (1 + scrapPercent / 100)).toLocaleString()} Blanks</span>
            </div>
          </div>

          {/* Step 5 */}
          <div className={`step-card bg-slate-900 border rounded-2xl p-4 transition-all duration-300 text-left ${
            activeStep === 5 
              ? 'border-purple-500 ring-2 ring-purple-500/40 bg-purple-950/30 shadow-lg shadow-purple-500/20 transform -translate-y-1'
              : 'border-slate-800'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30">Step 5</span>
              <Bell className="w-4 h-4 text-purple-400" />
            </div>
            <h4 className="text-sm font-heading font-bold text-white">AI Demand Alert</h4>
            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
              Recalculates velocity. Back-calculates China 45-day sea transit time to alert CEO for next PO.
            </p>
            <div className="mt-3 text-[11px] bg-slate-950 p-2 rounded-lg border border-slate-800/80 font-mono text-purple-300 flex items-center justify-between">
              <span>Next PO Window</span>
              <span className="font-bold">In 34 Days</span>
            </div>
          </div>

        </div>

        {/* Visual Flow Tracker & Live Console */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse"></div>
              <span className="text-xs font-heading font-bold tracking-wider text-slate-200 uppercase flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-indigo-400" />
                Live Integration Event Stream
              </span>
            </div>
            
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400 hidden sm:inline">
                {isSimulating ? 'Processing webhook transaction...' : 'Idle &bull; Ready for next Xero trigger'}
              </span>
              <button
                onClick={clearLogs}
                className="text-xs text-slate-400 hover:text-white transition flex items-center gap-1 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            </div>
          </div>
          
          <div className="bg-black/80 rounded-xl p-4 font-mono text-xs text-slate-300 space-y-1.5 h-52 overflow-y-auto border border-slate-800/80 shadow-inner">
            {logs.map((item, idx) => (
              <div key={idx} className="flex items-start gap-2.5 leading-relaxed">
                <span className="text-slate-600 select-none text-[11px]">{item.time}</span>
                <span className={item.color}>{item.text}</span>
              </div>
            ))}
            <div ref={consoleEndRef} />
          </div>
        </div>

        {/* Comparative Matrix: Why Native Xero Fails vs. Custom AI System */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-heading font-bold text-white flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              <span>Comparative Analysis: Native Xero vs. SmartPrint AI Architecture</span>
            </h3>
            <span className="text-xs text-slate-400">Technical Justification Matrix</span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900 text-slate-300 uppercase font-heading font-bold border-b border-slate-800">
                <tr>
                  <th className="p-3.5 w-1/4">Manufacturing Challenge</th>
                  <th className="p-3.5 text-rose-400 w-3/8">Standard Xero Limitation</th>
                  <th className="p-3.5 text-emerald-400 w-3/8">SmartPrint AI Solution</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 bg-slate-900/40 text-slate-300">
                <tr className="hover:bg-slate-850/50 transition">
                  <td className="p-3.5 font-semibold text-white">Bill of Materials (BOM)</td>
                  <td className="p-3.5 text-slate-400">
                    Cannot decompose 1 "Custom Mug" invoice line into 1 Blank Mug + 2.1ml Ink + Packaging Box.
                  </td>
                  <td className="p-3.5 text-emerald-300 font-medium">
                    Automatic multi-component recipe explosion: deducts exact raw stock components atomically.
                  </td>
                </tr>
                <tr className="hover:bg-slate-850/50 transition">
                  <td className="p-3.5 font-semibold text-white">Factory Scrap &amp; Heat Defect Waste</td>
                  <td className="p-3.5 text-slate-400">
                    Stock ledger shows 1,000 mugs on paper; floor only has 950 due to thermal press misprints.
                  </td>
                  <td className="p-3.5 text-emerald-300 font-medium">
                    Dynamic scrap rate (e.g. 2.5%) factored into every production deduction automatically.
                  </td>
                </tr>
                <tr className="hover:bg-slate-850/50 transition">
                  <td className="p-3.5 font-semibold text-white">China Sea Freight Lead Time</td>
                  <td className="p-3.5 text-slate-400">
                    Only triggers alert when stock touches static minimum. By then, 45-day ocean transit guarantees a stockout.
                  </td>
                  <td className="p-3.5 text-emerald-300 font-medium">
                    AI engine models current sales burn rate against the 45-day shipping window to issue PO before stockout.
                  </td>
                </tr>
                <tr className="hover:bg-slate-850/50 transition">
                  <td className="p-3.5 font-semibold text-white">True Landed Costing &amp; Margin</td>
                  <td className="p-3.5 text-slate-400">
                    Requires manual spreadsheet calculations; risk of underpricing finished print jobs.
                  </td>
                  <td className="p-3.5 text-emerald-300 font-medium">
                    Auto-distributes container ocean freight, customs tariffs, and local drayage into unit cost.
                  </td>
                </tr>
                <tr className="hover:bg-slate-850/50 transition">
                  <td className="p-3.5 font-semibold text-white">Double-Selling Protection</td>
                  <td className="p-3.5 text-slate-400">
                    Physical stock in warehouse looks available even though another rep closed a 10,000 unit contract.
                  </td>
                  <td className="p-3.5 text-emerald-300 font-medium">
                    Instantly allocates raw blanks as "Committed / WIP" the moment an invoice or work order is approved.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>

    </div>
  );
};
