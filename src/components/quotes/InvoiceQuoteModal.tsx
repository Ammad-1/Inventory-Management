import React, { useEffect, useState } from 'react';
import { X, Loader2, AlertTriangle, ExternalLink, CheckCircle2, Info } from 'lucide-react';
import { Quote } from '../../types';

interface InvoicePreview {
  quoteNumber: string;
  customerName: string;
  accountCode: string;
  taxType: string;
  vatRate: number;
  dueDays: number;
  lines: { description: string; quantity: number; unitAmount: number; lineAmount: number; nonStock: boolean }[];
  netTotal: number;
  vatTotal: number;
  grossTotal: number;
  quoteNetTotal: number;
  quoteGrossTotal: number;
  roundingAdjustment: number;
}

interface PushResult {
  invoiceNumber: string;
  status: string;
  total: number;
  onlineInvoiceUrl: string | null;
  stockDeducted: boolean;
  stockMovements: number;
  deductError: string | null;
  message: string;
}

interface Props {
  quote: Quote;
  onClose: () => void;
  onInvoiced: () => void;
}

/**
 * Shows the operator the exact lines that will be sent to Xero before
 * anything is created, because an invoice in the real books is not
 * something to discover after the fact.
 */
export const InvoiceQuoteModal: React.FC<Props> = ({ quote, onClose, onInvoiced }) => {
  const [preview, setPreview] = useState<InvoicePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [pushing, setPushing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PushResult | null>(null);

  const [status, setStatus] = useState<'DRAFT' | 'AUTHORISED'>('DRAFT');
  const [deductStock, setDeductStock] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/quotes/${quote.id}/invoice-preview`);
        const d = await r.json();
        if (!r.ok) setError(d.error || 'Could not prepare this quote for invoicing.');
        else setPreview(d);
      } catch (e: any) {
        setError(e.message || 'Could not prepare this quote for invoicing.');
      } finally {
        setLoading(false);
      }
    })();
  }, [quote.id]);

  const push = async () => {
    setPushing(true);
    setError(null);
    try {
      const r = await fetch(`/api/quotes/${quote.id}/invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, deductStock })
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.error || 'Xero would not accept the invoice.');
        return;
      }
      setResult(d);
      onInvoiced();
    } catch (e: any) {
      setError(e.message || 'Could not reach Xero.');
    } finally {
      setPushing(false);
    }
  };

  const money = (n: number) => `£${n.toFixed(2)}`;

  return (
    <div className="fixed inset-0 z-[60] bg-slate-900/50 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl my-8">

        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {result ? 'Invoice created' : `Invoice ${quote.quoteNumber} in Xero`}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {result
                ? 'This is now in your Xero books.'
                : 'Nothing is created until you confirm. Check the lines below first.'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 border border-rose-200 text-sm text-rose-800">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /><span>{error}</span>
            </div>
          )}

          {result ? (
            <>
              <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-900">
                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /><span>{result.message}</span>
              </div>
              {result.deductError && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>
                    The invoice was created, but stock was not deducted: {result.deductError}.
                    Deduct it from the Xero Sync page.
                  </span>
                </div>
              )}
              <dl className="text-sm space-y-1.5 rounded-xl border border-slate-200 p-4">
                <div className="flex justify-between"><dt className="text-slate-600">Invoice</dt><dd className="font-bold">{result.invoiceNumber}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-600">Status in Xero</dt><dd className="font-semibold">{result.status}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-600">Total</dt><dd className="font-bold tabular-nums">{money(result.total)}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-600">Stock movements</dt><dd className="tabular-nums">{result.stockMovements}</dd></div>
              </dl>
              {result.onlineInvoiceUrl && (
                <a href={result.onlineInvoiceUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:underline">
                  Open the invoice in Xero <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </>
          ) : loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500 py-8 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> Preparing the invoice…
            </div>
          ) : preview ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                {[
                  ['Customer', preview.customerName],
                  ['Revenue account', preview.accountCode],
                  ['Tax rate', `${preview.taxType} (${preview.vatRate}%)`],
                  ['Payment terms', `${preview.dueDays} days`]
                ].map(([k, v]) => (
                  <div key={k}>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{k}</div>
                    <div className="font-semibold text-slate-800 truncate" title={String(v)}>{v}</div>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="text-left font-bold px-3 py-2">Line</th>
                      <th className="text-right font-bold px-3 py-2 w-16">Qty</th>
                      <th className="text-right font-bold px-3 py-2 w-24">Unit</th>
                      <th className="text-right font-bold px-3 py-2 w-24">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {preview.lines.map((l, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 text-xs text-slate-700">{l.description}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{l.quantity}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{l.unitAmount}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">{money(l.lineAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 text-sm">
                    <tr><td colSpan={3} className="px-3 py-1.5 text-right text-slate-600">Subtotal (ex VAT)</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{money(preview.netTotal)}</td></tr>
                    <tr><td colSpan={3} className="px-3 py-1.5 text-right text-slate-600">VAT ({preview.vatRate}%)</td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{money(preview.vatTotal)}</td></tr>
                    <tr className="font-bold text-slate-900 border-t border-slate-200">
                      <td colSpan={3} className="px-3 py-2 text-right">Total</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(preview.grossTotal)}</td></tr>
                  </tfoot>
                </table>
              </div>

              {preview.roundingAdjustment !== 0 && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
                  <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>
                    Spreading the markup across lines left {money(Math.abs(preview.roundingAdjustment))} adrift,
                    so it is shown as its own adjustment line. The invoice total still matches the quote exactly.
                  </span>
                </div>
              )}

              {preview.grossTotal !== quote.grossTotal && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>
                    The invoice comes to {money(preview.grossTotal)} but the quote was saved at {money(quote.grossTotal)}.
                    Re-save the quote before invoicing so the customer is billed what they agreed.
                  </span>
                </div>
              )}

              <div className="rounded-xl border border-slate-200 p-4 space-y-3">
                <div>
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Create as</div>
                  <div className="flex gap-2">
                    {([['DRAFT', 'Draft', 'Review it in Xero before sending'],
                       ['AUTHORISED', 'Approved', 'Ready to send, counts for VAT straight away']] as const).map(
                      ([value, label, hint]) => (
                        <button key={value} onClick={() => setStatus(value)}
                          className={`flex-1 px-3 py-2 rounded-lg text-left text-xs font-semibold border transition-colors ${
                            status === value ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                                             : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                          }`}>
                          {label}
                          <span className="block text-[10px] font-medium opacity-70 mt-0.5">{hint}</span>
                        </button>
                      ))}
                  </div>
                </div>
                <label className="flex items-start gap-2 text-sm text-slate-700">
                  <input type="checkbox" className="mt-0.5" checked={deductStock}
                    onChange={e => setDeductStock(e.target.checked)} />
                  <span>
                    Deduct the blanks and packaging from stock
                    <span className="block text-[11px] text-slate-500">
                      Writes a movement per item so the ledger explains the change.
                    </span>
                  </span>
                </label>
              </div>
            </>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100">
            {result ? 'Done' : 'Cancel'}
          </button>
          {!result && preview && (
            <button onClick={push} disabled={pushing}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">
              {pushing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Create in Xero
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
