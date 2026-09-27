import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { XeroPushLine, XeroPushLineKind } from '../../types';
import { X, Plus, Trash2, Send, AlertTriangle, RefreshCw, Search } from 'lucide-react';

interface BuildXeroInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface LineDraft {
  kind: XeroPushLineKind;
  poNumber: string;
  orderNumber: string;
  salesRep: string;
  productDescription: string;
  carrier: string;
  trackingNumber: string;
  customDescription: string;
  quantity: string;
  unitPrice: string;
  accountCode: string;
  taxType: string;
  blankItemId: string;
  packagingItemId: string;
}

const emptyLine = (kind: XeroPushLineKind, accountCode: string, taxType: string): LineDraft => ({
  kind,
  poNumber: '',
  orderNumber: '',
  salesRep: '',
  productDescription: '',
  carrier: '',
  trackingNumber: '',
  customDescription: '',
  quantity: kind === 'shipping' ? '1' : '',
  unitPrice: '',
  accountCode,
  taxType,
  blankItemId: '',
  packagingItemId: ''
});

/** Mirrors the server's template logic so the preview matches what will be sent. */
const composeDescription = (line: LineDraft): string => {
  if (line.kind === 'custom') return line.customDescription.trim();
  if (line.kind === 'shipping') {
    if (!line.carrier.trim()) return '';
    return `Shipped with ${line.carrier.trim()}${
      line.trackingNumber.trim() ? ` - ${line.trackingNumber.trim()}` : ''
    }`;
  }
  const parts: string[] = [];
  if (line.poNumber.trim()) parts.push(`PO : ${line.poNumber.trim()}`);
  if (line.orderNumber.trim()) parts.push(`(PO Order ${line.orderNumber.trim()})`);
  if (line.salesRep.trim()) parts.push(`Sales Rep: ${line.salesRep.trim()}`);
  if (line.productDescription.trim()) parts.push(line.productDescription.trim());
  return parts.join(' ').replace(/\s{2,}/g, ' ').trim();
};

export const BuildXeroInvoiceModal: React.FC<BuildXeroInvoiceModalProps> = ({ isOpen, onClose }) => {
  const {
    inventory,
    xeroReference,
    xeroInvoiceSettings,
    xeroStatus,
    syncXeroReference,
    pushXeroInvoice
  } = useInventory();

  const today = new Date().toISOString().slice(0, 10);
  const settings = xeroInvoiceSettings;
  const defaultAccount = settings?.defaultAccountCode || '';
  const defaultTax = settings?.defaultTaxType || '';

  const [contactId, setContactId] = useState('');
  const [contactQuery, setContactQuery] = useState('');
  const [reference, setReference] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [dueDate, setDueDate] = useState('');
  const [status, setStatus] = useState<'DRAFT' | 'AUTHORISED'>('DRAFT');
  const [deductStock, setDeductStock] = useState(false);
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [isPushing, setIsPushing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Reset the form each time the modal opens
  useEffect(() => {
    if (!isOpen) return;
    setContactId('');
    setContactQuery('');
    setReference('');
    setInvoiceDate(today);
    setDueDate(
      new Date(Date.now() + (settings?.defaultDueDays ?? 30) * 86400000).toISOString().slice(0, 10)
    );
    setStatus('DRAFT');
    setDeductStock(false);
    setLines([emptyLine('product', defaultAccount, defaultTax)]);
    setError(null);
    setResult(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [isOpen, onClose]);

  const contacts = xeroReference?.contacts || [];
  const accounts = xeroReference?.accounts || [];
  const taxRates = xeroReference?.taxRates || [];
  const blanks = useMemo(() => inventory.filter(i => i.category === 'blank'), [inventory]);
  const packaging = useMemo(() => inventory.filter(i => i.category === 'packaging'), [inventory]);
  const taxByType = useMemo(() => new Map(taxRates.map(t => [t.taxType, t])), [taxRates]);

  const filteredContacts = useMemo(() => {
    const q = contactQuery.trim().toLowerCase();
    if (!q) return contacts.slice(0, 50);
    return contacts.filter(c => c.name.toLowerCase().includes(q)).slice(0, 50);
  }, [contacts, contactQuery]);

  const selectedContact = contacts.find(c => c.contactId === contactId);

  const totals = useMemo(() => {
    let subTotal = 0;
    let tax = 0;
    lines.forEach(l => {
      const amount = (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0);
      subTotal += amount;
      tax += amount * ((taxByType.get(l.taxType)?.rate || 0) / 100);
    });
    const inclusive = (settings?.lineAmountTypes || 'Exclusive') === 'Inclusive';
    return inclusive
      ? { subTotal: subTotal - tax, tax, total: subTotal }
      : { subTotal, tax, total: subTotal + tax };
  }, [lines, taxByType, settings?.lineAmountTypes]);

  if (!isOpen) return null;

  const update = (i: number, patch: Partial<LineDraft>) =>
    setLines(prev => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const money = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const handleImport = async () => {
    setIsImporting(true);
    setError(null);
    const res = await syncXeroReference();
    setIsImporting(false);
    if (!res.success) setError(res.message);
    else setResult(res.message);
  };

  const handlePush = async () => {
    setError(null);
    setResult(null);

    if (!contactId) return setError('Choose a customer first.');
    if (lines.length === 0) return setError('Add at least one line.');
    for (let i = 0; i < lines.length; i++) {
      if (!composeDescription(lines[i])) return setError(`Line ${i + 1}: description is empty.`);
      if (!(Number(lines[i].quantity) > 0)) return setError(`Line ${i + 1}: quantity must be greater than zero.`);
      if (!lines[i].accountCode) return setError(`Line ${i + 1}: choose a revenue account.`);
    }

    if (
      status === 'AUTHORISED' &&
      !window.confirm(
        'Create this invoice as AUTHORISED in Xero?\n\n' +
          'An authorised invoice is a live accounting record your customer can be sent. ' +
          'Use Draft if you want to review it in Xero first.'
      )
    )
      return;

    setIsPushing(true);
    const payload = {
      contactId,
      reference: reference.trim() || undefined,
      invoiceDate,
      dueDate,
      status,
      deductStock,
      lines: lines.map<XeroPushLine>(l => ({
        kind: l.kind,
        description: l.kind === 'custom' ? l.customDescription.trim() : undefined,
        poNumber: l.poNumber.trim() || undefined,
        orderNumber: l.orderNumber.trim() || undefined,
        salesRep: l.salesRep.trim() || undefined,
        productDescription: l.productDescription.trim() || undefined,
        carrier: l.carrier.trim() || undefined,
        trackingNumber: l.trackingNumber.trim() || undefined,
        quantity: Number(l.quantity) || 0,
        unitPrice: Number(l.unitPrice) || 0,
        accountCode: l.accountCode,
        taxType: l.taxType || undefined,
        blankItemId: l.blankItemId || null,
        packagingItemId: l.packagingItemId || null
      }))
    };
    const res = await pushXeroInvoice(payload);
    setIsPushing(false);
    if (!res.success) return setError(res.message);
    setResult(`${res.message} Total ${money(res.total || 0)}.`);
    setLines([]);
  };

  const notConnected = !xeroStatus?.connected;
  const noReference = contacts.length === 0;

  const field =
    'w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500';
  const labelCls = 'text-xs font-semibold text-slate-600';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/55 p-6" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="build-invoice-title"
        onClick={e => e.stopPropagation()}
        className="my-auto flex max-h-[92vh] w-full max-w-6xl flex-col rounded-2xl bg-white shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div>
            <h2 id="build-invoice-title" className="text-lg font-bold tracking-tight text-slate-900">
              New invoice to Xero
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Builds a real ACCREC invoice in {xeroStatus?.organisationName || 'your Xero organisation'}. Xero assigns the invoice number.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close invoice builder"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {notConnected && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Xero is not connected. Connect it on the Xero Sync screen before creating invoices.</span>
            </div>
          )}

          {noReference && !notConnected && (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2.5 text-xs text-indigo-900">
              <span>No customers imported yet. Import your customers, revenue accounts and tax rates from Xero.</span>
              <button
                type="button"
                onClick={handleImport}
                disabled={isImporting}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isImporting ? 'animate-spin' : ''}`} />
                {isImporting ? 'Importing…' : 'Import from Xero'}
              </button>
            </div>
          )}

          {/* Invoice header fields */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr]">
            <div className="flex flex-col gap-1">
              <label htmlFor="customer" className={labelCls}>Customer *</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  id="customer-search"
                  type="text"
                  value={contactQuery}
                  onChange={e => setContactQuery(e.target.value)}
                  placeholder={`Search ${contacts.length} customers…`}
                  aria-label="Search customers"
                  className={`${field} pl-8`}
                />
              </div>
              <select
                id="customer"
                value={contactId}
                onChange={e => setContactId(e.target.value)}
                size={1}
                className={field}
              >
                <option value="">— select a customer —</option>
                {filteredContacts.map(c => (
                  <option key={c.contactId} value={c.contactId}>{c.name}</option>
                ))}
              </select>
              {selectedContact && (
                <span className="text-xs text-slate-500">{selectedContact.email || 'No email on file'}</span>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="reference" className={labelCls}>Reference</label>
              <input id="reference" type="text" value={reference} onChange={e => setReference(e.target.value)} placeholder="Optional" className={field} />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="inv-date" className={labelCls}>Invoice date</label>
              <input id="inv-date" type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} className={field} />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="due-date" className={labelCls}>Due date</label>
              <input id="due-date" type="date" value={dueDate} min={invoiceDate} onChange={e => setDueDate(e.target.value)} className={field} />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="status" className={labelCls}>Status in Xero</label>
              <select id="status" value={status} onChange={e => setStatus(e.target.value as 'DRAFT' | 'AUTHORISED')} className={field}>
                <option value="DRAFT">Draft</option>
                <option value="AUTHORISED">Authorised</option>
              </select>
              <span className="text-xs text-slate-500">
                {status === 'DRAFT' ? 'Review in Xero before sending' : 'Live accounting record'}
              </span>
            </div>
          </div>

          {/* Lines */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Invoice lines</h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setLines(p => [...p, emptyLine('product', defaultAccount, defaultTax)])}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Plus className="h-3.5 w-3.5" /> Product line
                </button>
                <button
                  type="button"
                  onClick={() => setLines(p => [...p, emptyLine('shipping', defaultAccount, defaultTax)])}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Plus className="h-3.5 w-3.5" /> Shipping line
                </button>
                <button
                  type="button"
                  onClick={() => setLines(p => [...p, emptyLine('custom', defaultAccount, defaultTax)])}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Plus className="h-3.5 w-3.5" /> Free text
                </button>
              </div>
            </div>

            {lines.map((line, i) => {
              const preview = composeDescription(line);
              const amount = (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0);

              return (
                <div key={i} className="overflow-hidden rounded-xl border border-slate-200">
                  <div className="flex items-center gap-2.5 border-b border-slate-200 bg-slate-50 px-3.5 py-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded bg-slate-200 text-xs font-bold text-slate-600">{i + 1}</span>
                    <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold capitalize text-slate-600">{line.kind}</span>
                    <p className="min-w-0 flex-1 truncate font-mono text-xs text-slate-700" title={preview}>
                      {preview || <span className="italic text-slate-400">Description builds here as you type</span>}
                    </p>
                    <span className="shrink-0 font-mono text-xs font-bold tabular-nums text-slate-800">{money(amount)}</span>
                    <button
                      type="button"
                      onClick={() => setLines(p => p.filter((_, idx) => idx !== i))}
                      aria-label={`Remove line ${i + 1}`}
                      className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="space-y-3 px-3.5 py-3">
                    {line.kind === 'product' && (
                      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <div className="flex flex-col gap-1">
                          <label htmlFor={`po-${i}`} className={labelCls}>PO number</label>
                          <input id={`po-${i}`} type="text" value={line.poNumber} onChange={e => update(i, { poNumber: e.target.value })} placeholder="PO040956" className={field} />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label htmlFor={`ord-${i}`} className={labelCls}>PB order number</label>
                          <input id={`ord-${i}`} type="text" value={line.orderNumber} onChange={e => update(i, { orderNumber: e.target.value })} placeholder="17711" className={field} />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label htmlFor={`rep-${i}`} className={labelCls}>Sales rep</label>
                          <input id={`rep-${i}`} type="text" value={line.salesRep} onChange={e => update(i, { salesRep: e.target.value })} placeholder="Ethan Fahy" className={field} />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label htmlFor={`prod-${i}`} className={labelCls}>Product description *</label>
                          <input id={`prod-${i}`} type="text" value={line.productDescription} onChange={e => update(i, { productDescription: e.target.value })} placeholder="Printed White 11oz Cambridge Mug" className={field} />
                        </div>
                      </div>
                    )}

                    {line.kind === 'shipping' && (
                      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <div className="flex flex-col gap-1">
                          <label htmlFor={`car-${i}`} className={labelCls}>Carrier *</label>
                          <input id={`car-${i}`} type="text" value={line.carrier} onChange={e => update(i, { carrier: e.target.value })} placeholder="FedEx" className={field} />
                        </div>
                        <div className="flex flex-col gap-1">
                          <label htmlFor={`trk-${i}`} className={labelCls}>Tracking number</label>
                          <input id={`trk-${i}`} type="text" value={line.trackingNumber} onChange={e => update(i, { trackingNumber: e.target.value })} placeholder="877755119569" className={field} />
                        </div>
                      </div>
                    )}

                    {line.kind === 'custom' && (
                      <div className="flex flex-col gap-1">
                        <label htmlFor={`desc-${i}`} className={labelCls}>Description *</label>
                        <input id={`desc-${i}`} type="text" value={line.customDescription} onChange={e => update(i, { customDescription: e.target.value })} placeholder="Artwork setup charge" className={field} />
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
                      <div className="flex flex-col gap-1">
                        <label htmlFor={`qty-${i}`} className={labelCls}>Qty *</label>
                        <input id={`qty-${i}`} type="number" min={0} value={line.quantity} onChange={e => update(i, { quantity: e.target.value })} className={`${field} font-mono tabular-nums`} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label htmlFor={`price-${i}`} className={labelCls}>Unit £ *</label>
                        <input id={`price-${i}`} type="number" min={0} step="0.01" value={line.unitPrice} onChange={e => update(i, { unitPrice: e.target.value })} className={`${field} font-mono tabular-nums`} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label htmlFor={`acct-${i}`} className={labelCls}>Revenue account *</label>
                        <select id={`acct-${i}`} value={line.accountCode} onChange={e => update(i, { accountCode: e.target.value })} className={field}>
                          <option value="">— select —</option>
                          {accounts.map(a => (
                            <option key={a.accountId} value={a.code}>{a.code} · {a.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label htmlFor={`tax-${i}`} className={labelCls}>Tax code</label>
                        <select id={`tax-${i}`} value={line.taxType} onChange={e => update(i, { taxType: e.target.value })} className={field}>
                          <option value="">Account default</option>
                          {taxRates.map(t => (
                            <option key={t.taxType} value={t.taxType}>{t.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label htmlFor={`blank-${i}`} className={labelCls}>Blank SKU (stock)</label>
                        <select id={`blank-${i}`} value={line.blankItemId} onChange={e => update(i, { blankItemId: e.target.value })} className={`${field} font-mono`}>
                          <option value="">None</option>
                          {blanks.map(b => <option key={b.id} value={b.id}>{b.sku}</option>)}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label htmlFor={`pack-${i}`} className={labelCls}>Packaging SKU</label>
                        <select id={`pack-${i}`} value={line.packagingItemId} onChange={e => update(i, { packagingItemId: e.target.value })} className={`${field} font-mono`}>
                          <option value="">None</option>
                          {packaging.map(b => <option key={b.id} value={b.id}>{b.sku}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {lines.length === 0 && (
              <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-xs text-slate-500">
                No lines yet — add a product, shipping or free-text line above.
              </p>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {result && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-semibold text-emerald-800">
              {result}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 bg-slate-50 px-6 py-3.5">
          <div className="flex items-center gap-5 text-xs">
            <span className="text-slate-500">Subtotal <strong className="ml-1 font-mono text-sm text-slate-900 tabular-nums">{money(totals.subTotal)}</strong></span>
            <span className="text-slate-500">VAT <strong className="ml-1 font-mono text-sm text-slate-900 tabular-nums">{money(totals.tax)}</strong></span>
            <span className="text-slate-500">Total <strong className="ml-1 font-mono text-base font-bold text-slate-900 tabular-nums">{money(totals.total)}</strong></span>
            <span className="text-slate-400">({settings?.lineAmountTypes || 'Exclusive'} of tax)</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-600">
              <input type="checkbox" checked={deductStock} onChange={e => setDeductStock(e.target.checked)} className="h-3.5 w-3.5 accent-indigo-600" />
              Deduct stock now
            </label>
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
              Cancel
            </button>
            <button
              type="button"
              onClick={handlePush}
              disabled={isPushing || notConnected || lines.length === 0}
              className="inline-flex items-center gap-2 rounded-lg border border-indigo-700 bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              {isPushing ? 'Creating in Xero…' : `Create ${status === 'DRAFT' ? 'draft' : 'authorised'} invoice`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
