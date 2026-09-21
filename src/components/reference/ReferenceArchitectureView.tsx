import React from 'react';
import { 
  Network, 
  Layers, 
  Ship, 
  FlaskConical, 
  Printer, 
  FileText, 
  History, 
  ArrowRight, 
  Sparkles, 
  ShieldCheck,
  CheckCircle2
} from 'lucide-react';
import { useInventory } from '../../context/InventoryContext';

export const ReferenceArchitectureView: React.FC = () => {
  const { setActiveView } = useInventory();

  const pipelineStages = [
    {
      step: '01',
      title: 'Overseas Container Inbound',
      subtitle: '40ft HQ Shipments & Customs',
      desc: 'Blanks imported from Zibo, China. Tracks 45-day ocean voyage, allocates ocean freight, import duties, and port drayage to derive true landed unit cost.',
      icon: Ship,
      actionTab: 'shipments' as const,
      color: 'cyan',
    },
    {
      step: '02',
      title: 'BOM Explosion & Recipe Studio',
      subtitle: 'Formulas, Inks & Scrap Factor',
      desc: 'Defines multi-component drinkware recipes. Factoring raw blanks, ink ml, box packaging, labor, and machine scrap allowances (+2.5%).',
      icon: FlaskConical,
      actionTab: 'bom' as const,
      color: 'indigo',
    },
    {
      step: '03',
      title: 'Heat Press Shop Floor Jobs',
      subtitle: 'Work Orders & QC Inspection',
      desc: 'Dispatches job cards to pneumatic press lines. Dynamically reserves inventory, tracks scrap counts during QC, and posts finished mugs to stock.',
      icon: Printer,
      actionTab: 'production' as const,
      color: 'purple',
    },
    {
      step: '04',
      title: 'Sales & Xero 2-Way Sync',
      subtitle: 'Invoice Generation & Dispatch',
      desc: 'B2B customer orders calculate live gross margin. 2-way sync creates Xero invoices with COGS journal entries and triggers warehouse dispatch.',
      icon: FileText,
      actionTab: 'orders' as const,
      color: 'emerald',
    },
    {
      step: '05',
      title: 'AI Predictive Reorder Engine',
      subtitle: 'Burn Velocity vs. 45-Day Lead Time',
      desc: 'Continuously monitors warehouse burn rates against supplier lead times and calculates container batch sizing to prevent stockouts.',
      icon: Sparkles,
      actionTab: 'forecasting' as const,
      color: 'rose',
    },
  ];

  return (
    <div id="architecture-view-container" className="space-y-6 pb-12">
      
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <Network className="w-5 h-5 text-indigo-400" />
          SmartPrint IQ System Architecture & Data Flow
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          How overseas procurement, multi-level BOMs, shop floor work orders, and Xero accounting interconnect seamlessly
        </p>
      </div>

      {/* Interactive Process Pipeline */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {pipelineStages.map((stage, idx) => {
          const Icon = stage.icon;

          return (
            <div 
              key={stage.step}
              onClick={() => setActiveView(stage.actionTab)}
              className="bg-slate-900 border border-slate-800 hover:border-indigo-500/50 rounded-xl p-4 flex flex-col justify-between transition group cursor-pointer"
            >
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <span className="text-[10px] font-mono font-bold text-slate-500">PHASE {stage.step}</span>
                  <div className="w-8 h-8 rounded-lg bg-slate-800 group-hover:bg-indigo-600/20 text-slate-300 group-hover:text-indigo-300 flex items-center justify-center transition">
                    <Icon className="w-4 h-4" />
                  </div>
                </div>

                <h3 className="text-xs font-bold text-white mt-3 group-hover:text-cyan-300 transition">
                  {stage.title}
                </h3>
                <h4 className="text-[10px] text-slate-400 font-medium mt-0.5">
                  {stage.subtitle}
                </h4>

                <p className="text-[11px] text-slate-400 leading-relaxed mt-2.5">
                  {stage.desc}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center text-[10px] font-semibold text-indigo-400 group-hover:text-indigo-300">
                <span>Explore Module</span>
                <ArrowRight className="w-3 h-3 ml-1 group-hover:translate-x-1 transition" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Technical Specifications Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center space-x-2 text-cyan-400">
            <Ship className="w-4 h-4" />
            <h4 className="text-xs font-bold uppercase tracking-wider">True Landed Cost Engine</h4>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Standard accounting tools only store purchase FOB price. SmartPrint IQ captures container shipping costs ($4,600), customs duties (8.7%), and port drayage ($1,200), automatically distributing them on a per-unit basis so product margins are 100% accurate.
          </p>
          <div className="bg-slate-800/60 p-3 rounded-lg text-xs font-mono text-cyan-300 border border-slate-700/60">
            Landed Unit = FOB + (Freight + Tariffs + Drayage) / Batch Qty
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center space-x-2 text-indigo-400">
            <Layers className="w-4 h-4" />
            <h4 className="text-xs font-bold uppercase tracking-wider">BOM Scrap & Reservation</h4>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Printing has machine fallout and misprints (cracked ceramics, uneven heat distribution). BOM recipes account for realistic 2.5% scrap allowances. When production is scheduled, stock is reserved in real-time so other jobs don't over-promise.
          </p>
          <div className="bg-slate-800/60 p-3 rounded-lg text-xs font-mono text-indigo-300 border border-slate-700/60">
            Allocation = Target Units × Ratio × (1 + ScrapRate%)
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center space-x-2 text-emerald-400">
            <ShieldCheck className="w-4 h-4" />
            <h4 className="text-xs font-bold uppercase tracking-wider">Xero 2-Way Sync & Reconciliation</h4>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Sales orders generate matching Xero accounts receivable invoices with invoice numbers and tax breakdowns. Dispatching goods logs an automated inventory credit and COGS debit to maintain accurate financial balance sheets.
          </p>
          <div className="bg-slate-800/60 p-3 rounded-lg text-xs font-mono text-emerald-300 border border-slate-700/60">
            COGS = Real Landed Unit Cost × Dispatched Units
          </div>
        </div>

      </div>

    </div>
  );
};
