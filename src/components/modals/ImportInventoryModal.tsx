import React, { useState, useEffect, useRef } from 'react';
import { useInventory } from '../../context/InventoryContext';
import { ImportMode, ImportPreview } from '../../types';
import { X, Upload, Download, AlertTriangle, CheckCircle2, FileSpreadsheet } from 'lucide-react';

interface ImportInventoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ImportInventoryModal: React.FC<ImportInventoryModalProps> = ({ isOpen, onClose }) => {
  const { previewImport, commitImport } = useInventory();

  const [mode, setMode] = useState<ImportMode>('catalogue');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [filename, setFilename] = useState('');
  const [isReading, setIsReading] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setMode('catalogue');
    setPreview(null);
    setFilename('');
    setError(null);
    setDone(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleFile = async (file: File) => {
    setIsReading(true);
    setError(null);
    setDone(null);
    setPreview(null);
    setFilename(file.name);
    const res = await previewImport(file, mode);
    setIsReading(false);
    if (!res.success) return setError(res.message || 'Could not read the file');
    setPreview(res.preview || null);
  };

  const handleCommit = async () => {
    if (!preview) return;
    const usable = preview.rows.filter(r => r.action !== 'skip');
    if (
      !window.confirm(
        mode === 'stocktake'
          ? `Apply this stocktake to ${usable.length} SKU${usable.length === 1 ? '' : 's'}?\n\n` +
            `Each change is written to the stock ledger as a stocktake movement.`
          : `Import ${preview.toCreate} new and ${preview.toUpdate} updated SKU${preview.toUpdate === 1 ? '' : 's'}?`
      )
    )
      return;

    setIsCommitting(true);
    setError(null);
    const res = await commitImport(mode, preview.rows, 'Spreadsheet import');
    setIsCommitting(false);
    if (!res.success) return setError(res.message);
    setDone(res.message);
    setPreview(null);
  };

  const modeCopy =
    mode === 'catalogue'
      ? 'Creates and updates SKU master data — names, categories, costs, reorder points. Stock levels are ignored.'
      : 'Sets counted stock levels against existing SKUs. Every change is written to the ledger as a stocktake movement.';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/55 p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-title"
        onClick={e => e.stopPropagation()}
        className="my-auto flex max-h-[92vh] w-full max-w-5xl flex-col rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div>
            <h2 id="import-title" className="text-lg font-bold tracking-tight text-slate-900">Import from spreadsheet</h2>
            <p className="mt-0.5 text-xs text-slate-500">Accepts .xlsx and .csv. Nothing is written until you review the preview.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close import" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-4">
          {/* Mode */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-600">Import type</span>
            {(['catalogue', 'stocktake'] as ImportMode[]).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setPreview(null); setDone(null); }}
                aria-pressed={mode === m}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                  mode === m ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {m === 'catalogue' ? 'SKU catalogue' : 'Stocktake'}
              </button>
            ))}
            <a
              href={`/api/inventory/import/template?mode=${mode}`}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 no-underline hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5" /> Download template
            </a>
          </div>
          <p className="text-xs text-slate-500">{modeCopy}</p>

          {/* Upload */}
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center">
            <FileSpreadsheet className="mx-auto mb-2 h-6 w-6 text-slate-400" />
            <input
              ref={fileRef}
              id="import-file"
              type="file"
              accept=".csv,.xlsx,.xls"
              className="sr-only"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
            <label
              htmlFor="import-file"
              className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-indigo-700 bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700"
            >
              <Upload className="h-3.5 w-3.5" />
              {isReading ? 'Reading…' : 'Choose a file'}
            </label>
            {filename && <p className="mt-2 font-mono text-xs text-slate-600">{filename}</p>}
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {done && (
            <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-semibold text-emerald-800">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{done}</span>
            </div>
          )}

          {preview && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: 'New SKUs', value: preview.toCreate, tone: 'text-emerald-700' },
                  { label: 'Updates', value: preview.toUpdate, tone: 'text-indigo-700' },
                  { label: 'Skipped (errors)', value: preview.toSkip, tone: preview.toSkip ? 'text-rose-700' : 'text-slate-500' },
                  { label: 'Warnings', value: preview.withWarnings, tone: preview.withWarnings ? 'text-amber-700' : 'text-slate-500' }
                ].map(c => (
                  <div key={c.label} className="rounded-xl border border-slate-200 px-3 py-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{c.label}</div>
                    <div className={`text-xl font-bold tabular-nums ${c.tone}`}>{c.value}</div>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                <span>Columns read: <strong className="font-semibold text-slate-700">{preview.recognisedFields.join(', ')}</strong></span>
                {preview.ignoredColumns.length > 0 && (
                  <span>Ignored: <strong className="font-semibold text-slate-700">{preview.ignoredColumns.join(', ')}</strong></span>
                )}
                {preview.sheetUsed && <span>Sheet: <strong className="font-semibold text-slate-700">{preview.sheetUsed}</strong></span>}
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-slate-50">
                      <tr className="border-b border-slate-200">
                        <th scope="col" className="px-3 py-2 font-semibold uppercase tracking-wide text-slate-500">Row</th>
                        <th scope="col" className="px-3 py-2 font-semibold uppercase tracking-wide text-slate-500">Action</th>
                        <th scope="col" className="px-3 py-2 font-semibold uppercase tracking-wide text-slate-500">SKU</th>
                        <th scope="col" className="px-3 py-2 font-semibold uppercase tracking-wide text-slate-500">
                          {mode === 'stocktake' ? 'Counted' : 'Name'}
                        </th>
                        <th scope="col" className="px-3 py-2 font-semibold uppercase tracking-wide text-slate-500">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.map(r => (
                        <tr key={r.rowNumber} className={`border-b border-slate-100 last:border-0 ${r.action === 'skip' ? 'bg-rose-50/50' : ''}`}>
                          <td className="px-3 py-1.5 tabular-nums text-slate-500">{r.rowNumber}</td>
                          <td className="px-3 py-1.5">
                            <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                              r.action === 'create' ? 'bg-emerald-50 text-emerald-700'
                                : r.action === 'update' ? 'bg-indigo-50 text-indigo-700'
                                : 'bg-rose-100 text-rose-700'
                            }`}>
                              {r.action}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 font-mono text-slate-800">{r.values.sku || '—'}</td>
                          <td className="px-3 py-1.5 text-slate-700">
                            {mode === 'stocktake'
                              ? <span className="font-mono tabular-nums">{r.values.currentStock ?? '—'}</span>
                              : <span className="block max-w-[220px] truncate">{r.values.name || '—'}</span>}
                          </td>
                          <td className="px-3 py-1.5">
                            {r.errors.length > 0 && <span className="text-rose-700">{r.errors.join(' · ')}</span>}
                            {r.errors.length === 0 && r.warnings.length > 0 && <span className="text-amber-700">{r.warnings.join(' · ')}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-slate-200 bg-slate-50 px-6 py-3.5">
          <span className="text-xs text-slate-500">
            {preview ? `Rows with errors are never written.` : 'Choose a file to see a preview.'}
          </span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
              Close
            </button>
            <button
              type="button"
              onClick={handleCommit}
              disabled={!preview || isCommitting || preview.toCreate + preview.toUpdate === 0}
              className="rounded-lg border border-indigo-700 bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isCommitting ? 'Importing…' : preview ? `Import ${preview.toCreate + preview.toUpdate} row${preview.toCreate + preview.toUpdate === 1 ? '' : 's'}` : 'Import'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
