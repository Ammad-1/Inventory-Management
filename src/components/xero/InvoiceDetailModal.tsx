import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { XeroInvoice, XeroLineEdit } from '../../types';
import { X, Check, AlertTriangle, PackageMinus } from 'lucide-react';

interface InvoiceDetailModalProps {
  invoice: XeroInvoice | null;
  onClose: () => void;
}

/** Local, unsaved edit state for one invoice line. */
interface LineDraft {
  blankItemId: string;
  packagingItemId: string;
  quantity: string;
  unitPrice: string;
  nonStock: boolean;
}

const NON_STOCK = '__non_stock__';
const NONE = '';

export const InvoiceDetailModal: React.FC<InvoiceDetailModalProps> = ({ invoice, onClose }) => {
  const { inventory, saveInvoiceLines, deductXeroInvoice } = useInventory();

  const [drafts, setDrafts] = useState<LineDraft[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeducting, setIsDeducting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const isLocked = invoice?.stockDeducted === 1;

  // Seed drafts whenever a different invoice is opened
  useEffect(() => {
    if (!invoice) return;
    setError(null);
    setDrafts(
      (invoice.lines || []).map(line => ({
        blankItemId: line.nonStock ? NON_STOCK : (line.matchedBlankId || NONE),
        packagingItemId: line.matchedBoxId || NONE,
        quantity: String(line.quantity ?? 0),
        unitPrice: String(line.unitPrice ?? 0),
        nonStock: !!line.nonStock
      }))
    );
  }, [invoice?.id]);

  // Escape to close, and keep focus inside the dialog
  useEffect(() => {
    if (!invoice) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href]'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [invoice, onClose]);

  const blanks = useMemo(() => inventory.filter(i => i.category === 'blank'), [inventory]);
  const packaging = useMemo(() => inventory.filter(i => i.category === 'packaging'), [inventory]);
  const itemById = useMemo(() => new Map(inventory.map(i => [i.id, i])), [inventory]);

  // Recompute costs live from the draft, so the figures match what will be saved
  const computed = useMemo(() => {
    let revenue = 0;
    let cogs = 0;
    const perLine = drafts.map(d => {
      const qty = Number(d.quantity) || 0;
      const price = Number(d.unitPrice) || 0;
      const lineRevenue = qty * price;
      revenue += lineRevenue;

      if (d.nonStock) return { lineRevenue, lineCogs: 0, lineProfit: lineRevenue, excluded: true };

      const blank = d.blankItemId && d.blankItemId !== NON_STOCK ? itemById.get(d.blankItemId) : undefined;
      const box = d.packagingItemId ? itemById.get(d.packagingItemId) : undefined;
      const unitCost =
        (blank ? blank.landedCostPerUnit || blank.costPerUnit || 0 : 0) +
        (box ? box.landedCostPerUnit || box.costPerUnit || 0 : 0);
      const lineCogs = unitCost * qty;
      cogs += lineCogs;
      return { lineRevenue, lineCogs, lineProfit: lineRevenue - lineCogs, excluded: false };
    });

    // Revenue excludes VAT, exactly as the invoice list and the server do.
    // Using the gross total here produced a different margin in this dialog
    // than in the table behind it for the same invoice.
    const gross = invoice?.totalAmount ?? 0;
    const vat = invoice?.totalTax ?? 0;
    const netRevenue = invoice?.netRevenue ?? invoice?.subTotal ?? (gross - vat);
    const profit = netRevenue - cogs;

    return {
      perLine,
      lineSum: revenue,
      netRevenue,
      vat,
      gross,
      // Only meaningful once the draft's own line values drift from the net
      lineDrift: Math.abs(netRevenue - revenue) > 0.01,
      cogs,
      profit,
      margin: netRevenue > 0 ? (profit / netRevenue) * 100 : null
    };
  }, [drafts, itemById, invoice?.totalAmount, invoice?.totalTax, invoice?.netRevenue, invoice?.subTotal]);

  // Net stock movement per SKU if this invoice is confirmed
  const stockImpact = useMemo(() => {
    const totals = new Map<string, number>();
    drafts.forEach(d => {
      if (d.nonStock) return;
      const qty = Number(d.quantity) || 0;
      if (qty <= 0) return;
      for (const id of [d.blankItemId, d.packagingItemId]) {
        if (!id || id === NON_STOCK) continue;
        totals.set(id, (totals.get(id) || 0) + qty);
      }
    });
    return [...totals.entries()].map(([id, qty]) => {
      const item = itemById.get(id);
      const current = item?.currentStock ?? 0;
      return {
        id,
        sku: item?.sku || id,
        qty,
        current,
        after: current - qty,
        short: current - qty < 0
      };
    });
  }, [drafts, itemById]);

  const unmatchedCount = drafts.filter(d => !d.nonStock && !d.blankItemId).length;

  if (!invoice) return null;

  const updateDraft = (index: number, patch: Partial<LineDraft>) => {
    setDrafts(prev => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  };

  const buildEdits = (): XeroLineEdit[] =>
    drafts.map((d, index) => ({
      index,
      nonStock: d.nonStock,
      blankItemId: d.nonStock ? null : d.blankItemId || null,
      packagingItemId: d.nonStock ? null : d.packagingItemId || null,
      quantity: Number(d.quantity) || 0,
      unitPrice: Number(d.unitPrice) || 0
    }));

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    const res = await saveInvoiceLines(invoice.id, buildEdits());
    setIsSaving(false);
    if (!res.success) return setError(res.message);
    onClose();
  };

  const handleDeduct = async () => {
    const shortages = stockImpact.filter(s => s.short);
    const warning = shortages.length
      ? `\n\nWARNING: this takes ${shortages.map(s => s.sku).join(', ')} below zero.`
      : '';
    if (
      !window.confirm(
        `Deduct stock for ${invoice.invoiceNumber}?${warning}\n\n` +
          `This writes to the stock ledger and cannot be undone.`
      )
    )
      return;

    setIsDeducting(true);
    setError(null);
    const saved = await saveInvoiceLines(invoice.id, buildEdits());
    if (!saved.success) {
      setIsDeducting(false);
      return setError(saved.message);
    }
    const res = await deductXeroInvoice(invoice.id);
    setIsDeducting(false);
    if (!res.success) return setError(res.message);
    onClose();
  };

  const money = (n: number) =>
    `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/55 p-6"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="invoice-modal-title"
        onClick={e => e.stopPropagation()}
        className="w-full max-w-5xl rounded-2xl bg-white shadow-2xl my-auto flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-5 border-b border-slate-200 px-6 py-4">
          <div className="flex flex-col gap-1.5 min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-0.5 font-mono text-xs font-bold text-indigo-700">
                {invoice.invoiceNumber}
              </span>
              <h2 id="invoice-modal-title" className="truncate text-lg font-bold tracking-tight text-slate-900">
                {invoice.customerName}
              </h2>
              {isLocked ? (
                <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                  Deducted {invoice.deductedAt?.slice(0, 10)}
                </span>
              ) : (
                <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                  {unmatchedCount > 0 ? `${unmatchedCount} line${unmatchedCount === 1 ? '' : 's'} unmatched` : 'Ready to deduct'}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              <span>Issued <strong className="font-semibold text-slate-800">{invoice.invoiceDate}</strong></span>
              <span className="text-slate-300">|</span>
              <span>Due <strong className="font-semibold text-slate-800">{invoice.dueDate || '—'}</strong></span>
              <span className="text-slate-300">|</span>
              <span>{invoice.currency} · {invoice.status} · ACCREC</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close invoice detail"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 gap-5 border-b border-slate-200 bg-slate-50 px-6 py-3.5 sm:grid-cols-5">
          {[
            { label: 'Net of VAT', value: money(computed.netRevenue), tone: 'text-slate-900', sub: `£${computed.gross.toLocaleString('en-GB', { minimumFractionDigits: 2 })} inc. VAT` },
            { label: 'VAT', value: money(computed.vat), tone: 'text-slate-600', sub: 'Collected for HMRC' },
            { label: 'True landed COGS', value: money(computed.cogs), tone: 'text-amber-700' },
            { label: 'Gross profit', value: money(computed.profit), tone: computed.profit >= 0 ? 'text-emerald-700' : 'text-rose-700' },
            {
              label: 'Margin',
              value: computed.margin === null ? '—' : `${computed.margin.toFixed(1)}%`,
              tone: (computed.margin ?? 0) >= 0 ? 'text-emerald-700' : 'text-rose-700',
              sub: 'On net revenue'
            }
          ].map(cell => (
            <div key={cell.label} className="flex flex-col gap-0.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{cell.label}</span>
              <span className={`text-lg font-bold tracking-tight tabular-nums ${cell.tone}`}>{cell.value}</span>
              {cell.sub && <span className="text-xs text-slate-500">{cell.sub}</span>}
            </div>
          ))}
        </div>

        {/* Lines */}
        <div className="flex-1 space-y-3 overflow-y-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">
              Invoice lines <span className="font-medium text-slate-500">— match each to stock</span>
            </h3>
            {isLocked && <span className="text-xs text-slate-500">Locked: stock already deducted</span>}
          </div>

          {drafts.map((draft, i) => {
            const line = invoice.lines[i];
            const calc = computed.perLine[i];
            const needsAttention = !draft.nonStock && !draft.blankItemId;
            const blank = draft.blankItemId && draft.blankItemId !== NON_STOCK ? itemById.get(draft.blankItemId) : undefined;
            const box = draft.packagingItemId ? itemById.get(draft.packagingItemId) : undefined;

            return (
              <div
                key={i}
                className={`overflow-hidden rounded-xl border ${needsAttention ? 'border-pink-200' : 'border-slate-200'}`}
              >
                <div
                  className={`flex items-center gap-2.5 border-b px-3.5 py-2.5 ${
                    needsAttention ? 'border-pink-200 bg-pink-50' : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs font-bold ${
                      needsAttention ? 'bg-pink-100 text-pink-700' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <p className="min-w-0 flex-1 truncate font-mono text-xs text-slate-700" title={line?.description}>
                    {line?.description}
                  </p>
                  {draft.nonStock ? (
                    <span className="shrink-0 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-600">
                      Non-stock
                    </span>
                  ) : needsAttention ? (
                    <span className="shrink-0 rounded-full border border-pink-200 bg-white px-2 py-0.5 text-xs font-semibold text-pink-700">
                      Needs a decision
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                      {line?.manualMatch ? 'Set manually' : 'Auto-matched'}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 px-3.5 py-3 lg:grid-cols-[1.4fr_1.4fr_0.6fr_0.7fr_0.8fr_0.9fr] lg:items-end">
                  <div className="flex flex-col gap-1">
                    <label htmlFor={`blank-${i}`} className="text-xs font-semibold text-slate-600">Blank SKU</label>
                    <select
                      id={`blank-${i}`}
                      disabled={isLocked}
                      value={draft.nonStock ? NON_STOCK : draft.blankItemId}
                      onChange={e => {
                        const v = e.target.value;
                        updateDraft(i, v === NON_STOCK
                          ? { nonStock: true, blankItemId: NON_STOCK, packagingItemId: NONE }
                          : { nonStock: false, blankItemId: v });
                      }}
                      className={`w-full rounded-lg border px-2.5 py-1.5 font-mono text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50 disabled:text-slate-500 ${
                        needsAttention ? 'border-pink-400' : 'border-slate-200'
                      }`}
                    >
                      <option value={NONE}>— select a blank —</option>
                      <option value={NON_STOCK}>Not stock — freight / setup / artwork</option>
                      {blanks.map(b => (
                        <option key={b.id} value={b.id}>{b.sku}</option>
                      ))}
                    </select>
                    <span className="text-xs text-slate-500">
                      {draft.nonStock
                        ? 'Deducts nothing'
                        : blank
                        ? `${blank.currentStock.toLocaleString()} in stock · ${money(blank.landedCostPerUnit || blank.costPerUnit || 0)} landed`
                        : 'No stock will be deducted'}
                    </span>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label htmlFor={`pack-${i}`} className="text-xs font-semibold text-slate-600">Packaging SKU</label>
                    <select
                      id={`pack-${i}`}
                      disabled={isLocked || draft.nonStock}
                      value={draft.packagingItemId}
                      onChange={e => updateDraft(i, { packagingItemId: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50 disabled:text-slate-500"
                    >
                      <option value={NONE}>None</option>
                      {packaging.map(b => (
                        <option key={b.id} value={b.id}>{b.sku}</option>
                      ))}
                    </select>
                    <span className="text-xs text-slate-500">
                      {box
                        ? `${box.currentStock.toLocaleString()} in stock · ${money(box.landedCostPerUnit || box.costPerUnit || 0)} each`
                        : '—'}
                    </span>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label htmlFor={`qty-${i}`} className="text-xs font-semibold text-slate-600">Qty</label>
                    <input
                      id={`qty-${i}`}
                      type="number"
                      min={0}
                      disabled={isLocked}
                      value={draft.quantity}
                      onChange={e => updateDraft(i, { quantity: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-xs tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50 disabled:text-slate-500"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label htmlFor={`price-${i}`} className="text-xs font-semibold text-slate-600">Unit £</label>
                    <input
                      id={`price-${i}`}
                      type="number"
                      min={0}
                      step="0.01"
                      disabled={isLocked}
                      value={draft.unitPrice}
                      onChange={e => updateDraft(i, { unitPrice: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-xs tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50 disabled:text-slate-500"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-slate-600">Line COGS</span>
                    <span className="py-1.5 font-mono text-sm font-bold tabular-nums text-amber-700">
                      {money(calc?.lineCogs ?? 0)}
                    </span>
                  </div>

                  <div className="flex flex-col gap-1 lg:text-right">
                    <span className="text-xs font-semibold text-slate-600">Line profit</span>
                    <span
                      className={`py-1.5 font-mono text-sm font-bold tabular-nums ${
                        (calc?.lineProfit ?? 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {money(calc?.lineProfit ?? 0)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Stock impact preview */}
          {!isLocked && stockImpact.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3">
              <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Stock impact on confirm
              </span>
              {stockImpact.map(s => (
                <span
                  key={s.id}
                  className={`inline-flex items-center gap-2 rounded-lg border bg-white px-2.5 py-1 text-xs ${
                    s.short ? 'border-rose-300' : 'border-slate-200'
                  }`}
                >
                  <span className="font-mono font-semibold text-slate-800">{s.sku}</span>
                  <span className="font-semibold text-rose-700">−{s.qty.toLocaleString()}</span>
                  <span className={s.short ? 'font-semibold text-rose-700' : 'text-slate-500'}>
                    {s.current.toLocaleString()} → {s.after.toLocaleString()}
                  </span>
                </span>
              ))}
            </div>
          )}

          {computed.lineDrift && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                These lines total {money(computed.lineSum)} but the invoice is {money(computed.netRevenue)} net of VAT.
                Profit uses the invoice figure, so check the quantities and prices below match what was billed.
              </span>
            </div>
          )}

          {stockImpact.some(s => s.short) && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                This deduction takes one or more SKUs below zero. Stock will be floored at 0, so the ledger will
                under-record the true usage.
              </span>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-6 py-3.5">
          <span className="text-xs text-slate-500">
            {isLocked
              ? 'This invoice has been deducted. Matching is read-only.'
              : 'Deducting writes to the stock ledger and cannot be undone.'}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
            >
              {isLocked ? 'Close' : 'Cancel'}
            </button>
            {!isLocked && (
              <>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving || isDeducting}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-900 transition-colors hover:bg-slate-50 disabled:opacity-50"
                >
                  {isSaving ? 'Saving…' : 'Save matching only'}
                </button>
                <button
                  type="button"
                  onClick={handleDeduct}
                  disabled={isSaving || isDeducting || unmatchedCount > 0}
                  title={unmatchedCount > 0 ? 'Every line needs a SKU or a non-stock mark first' : undefined}
                  className="inline-flex items-center gap-2 rounded-lg border border-emerald-700 bg-emerald-600 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isDeducting ? <PackageMinus className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                  {isDeducting ? 'Deducting…' : 'Confirm & deduct stock'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
