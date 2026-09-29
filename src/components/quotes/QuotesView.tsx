import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus, Search, Loader2, AlertTriangle, FileText, Trash2, Send, Check, XCircle, Receipt,
  FileDown, Building2, Unlink
} from 'lucide-react';
import { Product, Quote, QuoteReference, QuoteStatus } from '../../types';
import { QuoteBuilder } from './QuoteBuilder';
import { InvoiceQuoteModal } from './InvoiceQuoteModal';
import { CompanyDetailsModal } from './CompanyDetailsModal';
import { takePendingQuoteProduct } from '../../lib/quoteHandoff';
import { useCanSeeFinancials } from '../../context/AuthContext';

const STATUS_STYLES: Record<QuoteStatus, string> = {
  draft: 'bg-slate-100 text-slate-600 border-slate-200',
  sent: 'bg-blue-50 text-blue-700 border-blue-200',
  accepted: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  declined: 'bg-rose-50 text-rose-700 border-rose-200',
  expired: 'bg-amber-50 text-amber-700 border-amber-200'
};

const FILTERS: { id: QuoteStatus | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'draft', label: 'Drafts' },
  { id: 'sent', label: 'Sent' },
  { id: 'accepted', label: 'Accepted' },
  { id: 'declined', label: 'Declined' }
];

export const QuotesView: React.FC = () => {
  const showMoney = useCanSeeFinancials();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [reference, setReference] = useState<QuoteReference | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useState<QuoteStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const [builderOpen, setBuilderOpen] = useState(false);
  const [editing, setEditing] = useState<Quote | null>(null);
  const [invoicing, setInvoicing] = useState<Quote | null>(null);
  const [companyOpen, setCompanyOpen] = useState(false);
  const [startProductId, setStartProductId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [q, r, p] = await Promise.all([
        fetch('/api/quotes').then(x => x.json()),
        fetch('/api/quotes/reference').then(x => x.json()),
        fetch('/api/products').then(x => x.json())
      ]);
      if (q.error) throw new Error(q.error);
      setQuotes(q);
      setReference(r);
      setProducts(Array.isArray(p) ? p : []);
    } catch (e: any) {
      setError(e.message || 'Could not load quotes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Opened by "Create quote" on the product page: start a quote for it
  useEffect(() => {
    const pending = takePendingQuoteProduct();
    if (!pending) return;
    setStartProductId(pending);
    setEditing(null);
    setBuilderOpen(true);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return quotes.filter(x =>
      (status === 'all' || x.status === status) &&
      (!q || x.quoteNumber.toLowerCase().includes(q) ||
        x.customerName.toLowerCase().includes(q) ||
        (x.customerReference || '').toLowerCase().includes(q))
    );
  }, [quotes, status, search]);

  const pipeline = useMemo(() => {
    const open = quotes.filter(q => q.status === 'sent');
    const won = quotes.filter(q => q.status === 'accepted');
    const toInvoice = won.filter(q => !q.xeroInvoiceId);
    return {
      openCount: open.length,
      openValue: open.reduce((s, q) => s + q.grossTotal, 0),
      wonValue: won.reduce((s, q) => s + q.netTotal, 0),
      wonProfit: won.reduce((s, q) => s + q.profit, 0),
      toInvoiceCount: toInvoice.length,
      toInvoiceValue: toInvoice.reduce((s, q) => s + q.grossTotal, 0)
    };
  }, [quotes]);

  const setQuoteStatus = async (q: Quote, next: QuoteStatus) => {
    setBusyId(q.id);
    setError(null);
    try {
      const r = await fetch(`/api/quotes/${q.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      await load();
    } catch (e: any) {
      setError(e.message || 'Could not update that quote.');
    } finally {
      setBusyId(null);
    }
  };

  /**
   * Release a quote whose Xero invoice has been deleted. The server checks
   * with Xero first, so a live invoice cannot be detached by mistake.
   */
  const unlink = async (q: Quote) => {
    if (!window.confirm(
      `Release ${q.quoteNumber} from invoice ${q.xeroInvoiceNumber}?\n\n` +
      'Only works if that invoice has been deleted or voided in Xero. ' +
      'The quote then becomes editable and deletable again.'
    )) return;

    setBusyId(q.id);
    setError(null);
    try {
      const r = await fetch(`/api/quotes/${q.id}/unlink-invoice`, { method: 'POST' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      await load();
    } catch (e: any) {
      setError(e.message || 'Could not release that quote.');
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (q: Quote) => {
    if (!window.confirm(`Delete ${q.quoteNumber} for ${q.customerName}? This cannot be undone.`)) return;
    setBusyId(q.id);
    setError(null);
    try {
      const r = await fetch(`/api/quotes/${q.id}`, { method: 'DELETE' });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      await load();
    } catch (e: any) {
      setError(e.message || 'Could not delete that quote.');
    } finally {
      setBusyId(null);
    }
  };

  const money = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-5 pt-6">

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {loading ? ' ' : `${filtered.length} of ${quotes.length} quote${quotes.length === 1 ? '' : 's'}`}
        </p>
        <div className="flex items-center gap-2">
          <button onClick={() => setCompanyOpen(true)}
            className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"
            title="The letterhead on every quote PDF">
            <Building2 className="w-4 h-4" /> Company details
          </button>
          <button onClick={() => { setEditing(null); setBuilderOpen(true); }}
            className="px-3.5 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 flex items-center gap-1.5 shadow-sm">
            <Plus className="w-4 h-4" /> Create quote
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /><span>{error}</span>
        </div>
      )}

      {quotes.length > 0 && (
        <div className={`grid grid-cols-2 gap-3 ${showMoney ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Out with customers</div>
            <div className="text-lg font-bold text-slate-900 tabular-nums mt-0.5">{money(pipeline.openValue)}</div>
            <div className="text-[11px] text-slate-500">{pipeline.openCount} quote{pipeline.openCount === 1 ? '' : 's'} awaiting a decision, inc. VAT</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Accepted, ex VAT</div>
            <div className="text-lg font-bold text-slate-900 tabular-nums mt-0.5">{money(pipeline.wonValue)}</div>
            <div className="text-[11px] text-slate-500">Revenue net of VAT</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Won, not yet invoiced</div>
            <div className={`text-lg font-bold tabular-nums mt-0.5 ${pipeline.toInvoiceCount > 0 ? 'text-amber-600' : 'text-slate-900'}`}>
              {money(pipeline.toInvoiceValue)}
            </div>
            <div className="text-[11px] text-slate-500">
              {pipeline.toInvoiceCount === 0
                ? 'Everything accepted has been billed'
                : `${pipeline.toInvoiceCount} accepted quote${pipeline.toInvoiceCount === 1 ? '' : 's'} still to invoice`}
            </div>
          </div>
          {showMoney && <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Profit on accepted</div>
            <div className="text-lg font-bold text-emerald-600 tabular-nums mt-0.5">{money(pipeline.wonProfit)}</div>
            <div className="text-[11px] text-slate-500">
              {pipeline.wonValue > 0 ? `${((pipeline.wonProfit / pipeline.wonValue) * 100).toFixed(1)}% margin` : 'No accepted quotes yet'}
            </div>
          </div>}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
            placeholder="Search quote number, customer or their PO"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1.5">
          {FILTERS.map(f => (
            <button key={f.id} onClick={() => setStatus(f.id)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                status === f.id ? 'bg-slate-800 text-white border-slate-800'
                                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
              }`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-12 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading quotes…
        </div>
      ) : quotes.length === 0 ? (
        <div className="text-center py-16 rounded-2xl border border-dashed border-slate-200 bg-white">
          <FileText className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-800">No quotes yet</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
            Build a quote from the product catalogue. It prices against real landed cost and
            shows the customer what they pay with and without VAT.
          </p>
          <button onClick={() => { setEditing(null); setBuilderOpen(true); }}
            className="mt-4 px-3.5 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 inline-flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> Create the first quote
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-sm text-slate-500 rounded-2xl border border-dashed border-slate-200 bg-white">
          Nothing matches that search.
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="text-left font-bold px-4 py-2.5">Quote</th>
                  <th className="text-left font-bold px-4 py-2.5">Customer</th>
                  <th className="text-left font-bold px-4 py-2.5">Date</th>
                  <th className="text-right font-bold px-4 py-2.5">Ex VAT</th>
                  <th className="text-right font-bold px-4 py-2.5">To pay</th>
                  {showMoney && <th className="text-right font-bold px-4 py-2.5">Margin</th>}
                  <th className="text-left font-bold px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(q => (
                  <tr key={q.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3">
                      <button onClick={() => { setEditing(q); setBuilderOpen(true); }}
                        className="font-mono text-xs font-bold text-indigo-600 hover:underline">
                        {q.quoteNumber}
                      </button>
                      <div className="text-[11px] text-slate-500">
                        {q.lines.length} item{q.lines.length === 1 ? '' : 's'}
                        {q.salesRep ? ` · ${q.salesRep}` : ''}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-800">{q.customerName}</div>
                      {q.customerReference && (
                        <div className="text-[11px] text-slate-500">PO {q.customerReference}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {q.quoteDate}
                      {q.validUntil && <div className="text-[11px] text-slate-400">until {q.validUntil}</div>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">{money(q.netTotal)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-bold text-slate-900">
                      {money(q.grossTotal)}
                      <div className="text-[10px] font-medium text-slate-400">inc. {money(q.vatTotal)} VAT</div>
                    </td>
                    {showMoney && (
                      <td className="px-4 py-3 text-right tabular-nums">
                        <span className={q.marginPct >= 20 ? 'text-emerald-600 font-semibold' : 'text-amber-600 font-semibold'}>
                          {q.marginPct}%
                        </span>
                        <div className="text-[10px] text-slate-400">{q.markupPct}% markup</div>
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide border ${STATUS_STYLES[q.status]}`}>
                        {q.status}
                      </span>
                      {q.xeroInvoiceNumber && (
                        <div className="text-[10px] text-slate-500 mt-0.5">Invoiced {q.xeroInvoiceNumber}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {busyId === q.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />
                        ) : (
                          <>
                            <a href={`/api/quotes/${q.id}/pdf`} title="Download the quote as a PDF"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50">
                              <FileDown className="w-3.5 h-3.5" />
                            </a>
                            {q.status === 'draft' && (
                              <button onClick={() => setQuoteStatus(q, 'sent')} title="Mark as sent"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50">
                                <Send className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {q.status === 'accepted' && !q.xeroInvoiceId && (
                              <button onClick={() => setInvoicing(q)} title="Create the invoice in Xero"
                                className="px-2 py-1 rounded-lg text-[11px] font-bold text-indigo-600 hover:bg-indigo-50 flex items-center gap-1">
                                <Receipt className="w-3.5 h-3.5" /> Invoice
                              </button>
                            )}
                            {q.status === 'sent' && (
                              <>
                                <button onClick={() => setQuoteStatus(q, 'accepted')} title="Customer accepted"
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50">
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => setQuoteStatus(q, 'declined')} title="Customer declined"
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50">
                                  <XCircle className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                            {q.xeroInvoiceId && (
                              <button onClick={() => unlink(q)}
                                title={`Release from ${q.xeroInvoiceNumber} if that invoice was deleted in Xero`}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50">
                                <Unlink className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {!q.xeroInvoiceId && (
                              <button onClick={() => remove(q)} title="Delete quote"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {companyOpen && (
        <CompanyDetailsModal onClose={() => setCompanyOpen(false)} onSaved={() => {}} />
      )}

      {invoicing && (
        <InvoiceQuoteModal
          quote={invoicing}
          onClose={() => setInvoicing(null)}
          onInvoiced={load}
        />
      )}

      {builderOpen && (
        <QuoteBuilder
          quote={editing}
          reference={reference}
          products={products}
          startProductId={startProductId}
          onClose={() => { setBuilderOpen(false); setStartProductId(null); }}
          onSaved={load}
        />
      )}
    </div>
  );
};
