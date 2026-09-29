import crypto from 'node:crypto';
import { db } from '../db';

/**
 * Shared Xero plumbing for anything that creates an ACCREC invoice.
 *
 * Extracted so the manual invoice builder and the quote converter send
 * requests, read failures and mirror results the same way. Nothing here
 * records an invoice locally until Xero has returned an InvoiceID.
 */

export interface XeroAuth {
  accessToken: string;
  tenantId: string;
}

export const XERO_API = 'https://api.xero.com/api.xro/2.0';

export const xeroFetch = (auth: XeroAuth, path: string, init: RequestInit = {}) =>
  fetch(`${XERO_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      'xero-tenant-id': auth.tenantId,
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {})
    }
  });

/**
 * Xero reports validation problems nested inside Elements, which is no use
 * to an operator. Pull out the messages people can act on.
 */
export function describeXeroError(bodyText: string): string {
  try {
    const parsed = JSON.parse(bodyText);
    const problems = (parsed.Elements || [])
      .flatMap((e: any) => e.ValidationErrors || [])
      .map((v: any) => v.Message);
    if (problems.length) return problems.join('; ');
    if (parsed.Message) return parsed.Message;
  } catch {
    /* fall through to the raw text */
  }
  return bodyText.slice(0, 400);
}

/** The revenue tax type matching a VAT rate, or the configured default. */
export function taxTypeForRate(rate: number, fallback?: string | null): string | null {
  const row = db.prepare(`
    SELECT tax_type FROM xero_tax_rates
    WHERE can_apply_to_revenue = 1 AND status = 'ACTIVE' AND rate = ?
    ORDER BY CASE tax_type WHEN 'OUTPUT2' THEN 0 WHEN 'ZERORATEDOUTPUT' THEN 1 ELSE 2 END
    LIMIT 1
  `).get(rate) as any;
  return row?.tax_type || fallback || null;
}

export interface MirrorInput {
  created: any;
  fallbackCustomerName: string;
  fallbackDate: string;
  fallbackDueDate: string;
  fallbackStatus: string;
  localLines: any[];
}

/** Write the invoice Xero just accepted into our own table. */
export function mirrorInvoiceLocally(input: MirrorInput): { id: string; invoiceNumber: string } {
  const { created, fallbackCustomerName, fallbackDate, fallbackDueDate, fallbackStatus, localLines } = input;
  const localId = `inv-${crypto.randomUUID().slice(0, 8)}`;
  const stamp = new Date().toISOString();
  const invoiceNumber = created.InvoiceNumber || `XERO-${created.InvoiceID.slice(0, 8)}`;

  db.prepare(`
    INSERT INTO xero_invoices (
      id, invoice_number, type, customer_name, invoice_date, due_date,
      total_amount, sub_total, total_tax, currency, status, line_items_json,
      stock_deducted, deducted_at, created_at
    ) VALUES (?, ?, 'ACCREC', ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, null, ?)
    ON CONFLICT(invoice_number) DO UPDATE SET
      total_amount = excluded.total_amount,
      sub_total = excluded.sub_total,
      total_tax = excluded.total_tax,
      status = excluded.status
  `).run(
    localId,
    invoiceNumber,
    created.Contact?.Name || fallbackCustomerName,
    (created.DateString || fallbackDate).slice(0, 10),
    (created.DueDateString || fallbackDueDate).slice(0, 10),
    Number(created.Total ?? 0),
    created.SubTotal ?? null,
    created.TotalTax ?? null,
    created.CurrencyCode || 'GBP',
    created.Status || fallbackStatus,
    JSON.stringify(localLines),
    stamp
  );

  const stored = db.prepare('SELECT id FROM xero_invoices WHERE invoice_number = ?').get(invoiceNumber) as any;
  return { id: stored?.id || localId, invoiceNumber };
}

export interface DeductionLine {
  quantity: number;
  blankItemId?: string | null;
  packagingItemId?: string | null;
}

/**
 * Deduct the blanks and packaging an invoice consumed, writing a movement
 * for each. All or nothing: a partial deduction would leave the ledger
 * disagreeing with the stock count.
 */
export function deductForInvoice(
  lines: DeductionLine[],
  invoiceNumber: string,
  localInvoiceId: string,
  note: string
): { deducted: number; error: string | null } {
  const stamp = new Date().toISOString();
  let deducted = 0;

  try {
    db.exec('BEGIN');
    for (const line of lines) {
      for (const itemId of [line.blankItemId, line.packagingItemId]) {
        if (!itemId) continue;
        const item = db.prepare('SELECT * FROM inventory_items WHERE id = ?').get(itemId) as any;
        if (!item) continue;

        const newStock = Math.max(0, item.current_stock - line.quantity);
        db.prepare('UPDATE inventory_items SET current_stock = ?, updated_at = ? WHERE id = ?')
          .run(newStock, stamp, item.id);
        db.prepare(`
          INSERT INTO stock_movements (
            id, item_id, sku, item_name, movement_type, quantity_delta,
            resulting_stock, unit_cost, reference_id, operator_name, notes, created_at
          ) VALUES (?, ?, ?, ?, 'xero_sale_deduct', ?, ?, ?, ?, 'Invoice push', ?, ?)
        `).run(
          `mov-${crypto.randomUUID().slice(0, 8)}`,
          item.id, item.sku, item.name,
          -line.quantity, newStock,
          item.landed_cost_per_unit || item.cost_per_unit || 0,
          invoiceNumber, note, stamp
        );
        deducted++;
      }
    }
    db.prepare('UPDATE xero_invoices SET stock_deducted = 1, deducted_at = ? WHERE id = ?')
      .run(stamp, localInvoiceId);
    db.exec('COMMIT');
    return { deducted, error: null };
  } catch (e: any) {
    db.exec('ROLLBACK');
    return { deducted: 0, error: e.message };
  }
}
