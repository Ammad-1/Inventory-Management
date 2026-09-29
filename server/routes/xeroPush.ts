import { Router, Request, Response } from 'express';
import { db } from '../db';
import {
  XeroAuth, xeroFetch, describeXeroError, mirrorInvoiceLocally, deductForInvoice
} from '../services/xeroInvoice';

/**
 * Outbound half of the Xero integration: mirroring reference data (contacts,
 * revenue accounts, tax rates) and creating real ACCREC invoices in Xero.
 *
 * Nothing here fabricates a "pushed" result — an invoice is only stored
 * locally after Xero has accepted it and returned an InvoiceID.
 */
export function createXeroPushRouter(
  getValidAccessToken: () => Promise<XeroAuth | null>
) {
  const router = Router();

  // ---------------------------------------------------------------- settings

  const getSettings = () =>
    db.prepare('SELECT * FROM invoice_settings WHERE id = ?').get('primary') as any;

  router.get('/settings', (_req: Request, res: Response) => {
    try {
      const s = getSettings();
      res.json({
        descriptionTemplate: s?.description_template || '',
        shippingTemplate: s?.shipping_template || '',
        defaultAccountCode: s?.default_account_code || null,
        defaultTaxType: s?.default_tax_type || null,
        defaultDueDays: s?.default_due_days ?? 30,
        lineAmountTypes: s?.line_amount_types || 'Exclusive'
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.put('/settings', (req: Request, res: Response) => {
    try {
      const {
        descriptionTemplate,
        shippingTemplate,
        defaultAccountCode,
        defaultTaxType,
        defaultDueDays,
        lineAmountTypes
      } = req.body || {};

      if (lineAmountTypes && !['Exclusive', 'Inclusive', 'NoTax'].includes(lineAmountTypes)) {
        return res.status(400).json({ error: 'lineAmountTypes must be Exclusive, Inclusive or NoTax' });
      }
      const dueDays = defaultDueDays === undefined ? undefined : Number(defaultDueDays);
      if (dueDays !== undefined && (!Number.isInteger(dueDays) || dueDays < 0 || dueDays > 365)) {
        return res.status(400).json({ error: 'defaultDueDays must be a whole number between 0 and 365' });
      }

      const current = getSettings();
      db.prepare(`
        UPDATE invoice_settings SET
          description_template = COALESCE(?, description_template),
          shipping_template = COALESCE(?, shipping_template),
          default_account_code = ?,
          default_tax_type = ?,
          default_due_days = COALESCE(?, default_due_days),
          line_amount_types = COALESCE(?, line_amount_types),
          updated_at = ?
        WHERE id = 'primary'
      `).run(
        descriptionTemplate ?? null,
        shippingTemplate ?? null,
        defaultAccountCode ?? current?.default_account_code ?? null,
        defaultTaxType ?? current?.default_tax_type ?? null,
        dueDays ?? null,
        lineAmountTypes ?? null,
        new Date().toISOString()
      );

      res.json({ success: true, message: 'Invoice settings saved' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ------------------------------------------------------- reference mirrors

  router.get('/reference', (_req: Request, res: Response) => {
    try {
      res.json({
        contacts: db
          .prepare('SELECT contact_id as contactId, name, email, default_account_code as defaultAccountCode FROM xero_contacts ORDER BY name ASC')
          .all(),
        accounts: db
          .prepare("SELECT account_id as accountId, code, name, type, tax_type as taxType FROM xero_accounts WHERE status = 'ACTIVE' ORDER BY code ASC")
          .all(),
        taxRates: db
          .prepare("SELECT tax_type as taxType, name, rate FROM xero_tax_rates WHERE status = 'ACTIVE' AND can_apply_to_revenue = 1 ORDER BY name ASC")
          .all(),
        lastSyncedAt:
          (db.prepare('SELECT MAX(updated_at) as t FROM xero_contacts').get() as any)?.t || null
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /** Pull contacts, revenue accounts and tax rates from Xero into local mirrors. */
  router.post('/reference/sync', async (_req: Request, res: Response) => {
    try {
      const auth = await getValidAccessToken();
      if (!auth) return res.status(401).json({ error: 'Xero not connected. Connect your Xero account first.' });

      const now = new Date().toISOString();
      const counts = { contacts: 0, accounts: 0, taxRates: 0 };

      // --- Contacts (paged; customers only) ---
      const upsertContact = db.prepare(`
        INSERT INTO xero_contacts (contact_id, name, email, is_customer, default_account_code, tax_number, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(contact_id) DO UPDATE SET
          name = excluded.name, email = excluded.email,
          is_customer = excluded.is_customer,
          default_account_code = excluded.default_account_code,
          tax_number = excluded.tax_number, updated_at = excluded.updated_at
      `);

      for (let page = 1; page <= 20; page++) {
        const r = await xeroFetch(auth, `/Contacts?page=${page}&where=${encodeURIComponent('IsCustomer==true')}`);
        if (!r.ok) {
          const text = await r.text();
          return res.status(r.status).json({ error: `Xero Contacts error: ${text.slice(0, 200)}` });
        }
        const batch = ((await r.json()) as any).Contacts || [];
        for (const c of batch) {
          upsertContact.run(
            c.ContactID,
            c.Name || 'Unnamed contact',
            c.EmailAddress || null,
            c.IsCustomer === false ? 0 : 1,
            c.SalesDefaultAccountCode || null,
            c.TaxNumber || null,
            now
          );
          counts.contacts++;
        }
        if (batch.length < 100) break;
      }

      // --- Accounts (revenue only: what a sales line can post to) ---
      const accRes = await xeroFetch(auth, '/Accounts');
      if (!accRes.ok) {
        const text = await accRes.text();
        return res.status(accRes.status).json({ error: `Xero Accounts error: ${text.slice(0, 200)}` });
      }
      const upsertAccount = db.prepare(`
        INSERT INTO xero_accounts (account_id, code, name, type, tax_type, class, status, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(account_id) DO UPDATE SET
          code = excluded.code, name = excluded.name, type = excluded.type,
          tax_type = excluded.tax_type, class = excluded.class,
          status = excluded.status, updated_at = excluded.updated_at
      `);
      for (const a of ((await accRes.json()) as any).Accounts || []) {
        // A sales invoice line can only post to a revenue account
        if (a.Class !== 'REVENUE') continue;
        upsertAccount.run(
          a.AccountID,
          a.Code || '',
          a.Name || '',
          a.Type || null,
          a.TaxType || null,
          a.Class || null,
          a.Status || 'ACTIVE',
          now
        );
        counts.accounts++;
      }

      // --- Tax rates ---
      const taxRes = await xeroFetch(auth, '/TaxRates');
      if (!taxRes.ok) {
        const text = await taxRes.text();
        return res.status(taxRes.status).json({ error: `Xero TaxRates error: ${text.slice(0, 200)}` });
      }
      const upsertTax = db.prepare(`
        INSERT INTO xero_tax_rates (tax_type, name, rate, status, can_apply_to_revenue, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(tax_type) DO UPDATE SET
          name = excluded.name, rate = excluded.rate, status = excluded.status,
          can_apply_to_revenue = excluded.can_apply_to_revenue, updated_at = excluded.updated_at
      `);
      for (const t of ((await taxRes.json()) as any).TaxRates || []) {
        upsertTax.run(
          t.TaxType,
          t.Name || t.TaxType,
          Number(t.EffectiveRate ?? t.DisplayTaxRate ?? 0),
          t.Status || 'ACTIVE',
          t.CanApplyToRevenue === false ? 0 : 1,
          now
        );
        counts.taxRates++;
      }

      res.json({
        success: true,
        ...counts,
        message: `Imported ${counts.contacts} customers, ${counts.accounts} revenue accounts and ${counts.taxRates} tax rates.`
      });
    } catch (err: any) {
      console.error('[Xero Reference Sync]', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ------------------------------------------------------ description builder

  const TOKENS = [
    'poNumber',
    'orderNumber',
    'salesRep',
    'productDescription',
    'carrier',
    'trackingNumber',
    'sku'
  ] as const;

  /**
   * Fill a token template, dropping any clause whose token is empty so a
   * missing sales rep does not leave "Sales Rep:" dangling.
   */
  function buildDescription(template: string, values: Record<string, string>): string {
    let out = template;

    // Remove a labelled clause entirely when its token has no value
    const labelled: Array<[RegExp, string]> = [
      [/PO\s*:\s*\{poNumber\}\s*/gi, 'poNumber'],
      [/\(PO Order \{orderNumber\}\)\s*/gi, 'orderNumber'],
      [/Sales Rep:\s*\{salesRep\}\s*/gi, 'salesRep'],
      [/Shipped with \{carrier\}\s*/gi, 'carrier'],
      [/-\s*\{trackingNumber\}\s*/gi, 'trackingNumber']
    ];
    for (const [pattern, token] of labelled) {
      if (!values[token]?.trim()) out = out.replace(pattern, '');
    }

    for (const token of TOKENS) {
      out = out.replace(new RegExp(`\\{${token}\\}`, 'g'), values[token]?.trim() || '');
    }

    return out.replace(/\s{2,}/g, ' ').trim();
  }

  router.post('/description/preview', (req: Request, res: Response) => {
    try {
      const s = getSettings();
      const { kind = 'line', values = {} } = req.body || {};
      const template = kind === 'shipping' ? s.shipping_template : s.description_template;
      res.json({ description: buildDescription(template, values) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ------------------------------------------------------------ invoice push

  /**
   * Create a real ACCREC invoice in Xero from an order, then mirror it locally
   * and optionally deduct the stock its lines consume.
   */
  router.post('/invoices/push', async (req: Request, res: Response) => {
    try {
      const auth = await getValidAccessToken();
      if (!auth) return res.status(401).json({ error: 'Xero not connected. Connect your Xero account first.' });

      const settings = getSettings();
      const {
        contactId,
        reference,
        invoiceDate,
        dueDate,
        status = 'DRAFT',
        lineAmountTypes = settings.line_amount_types || 'Exclusive',
        deductStock = false,
        lines = []
      } = req.body as {
        contactId?: string;
        reference?: string;
        invoiceDate?: string;
        dueDate?: string;
        status?: 'DRAFT' | 'AUTHORISED';
        lineAmountTypes?: string;
        deductStock?: boolean;
        lines?: Array<{
          kind?: 'product' | 'shipping' | 'custom';
          description?: string;
          poNumber?: string;
          orderNumber?: string;
          salesRep?: string;
          productDescription?: string;
          carrier?: string;
          trackingNumber?: string;
          quantity: number;
          unitPrice: number;
          accountCode?: string;
          taxType?: string;
          blankItemId?: string | null;
          packagingItemId?: string | null;
        }>;
      };

      // ---- validate ----
      if (!contactId) return res.status(400).json({ error: 'A Xero customer is required' });
      const contact = db.prepare('SELECT * FROM xero_contacts WHERE contact_id = ?').get(contactId) as any;
      if (!contact) return res.status(400).json({ error: 'Unknown customer — re-import customers from Xero' });

      if (!Array.isArray(lines) || lines.length === 0) {
        return res.status(400).json({ error: 'At least one invoice line is required' });
      }
      if (!['DRAFT', 'AUTHORISED'].includes(status)) {
        return res.status(400).json({ error: 'status must be DRAFT or AUTHORISED' });
      }

      const builtLines = lines.map((line, i) => {
        const qty = Number(line.quantity);
        const price = Number(line.unitPrice);
        if (!Number.isFinite(qty) || qty <= 0) throw new Error(`Line ${i + 1}: quantity must be greater than zero`);
        if (!Number.isFinite(price) || price < 0) throw new Error(`Line ${i + 1}: unit price must be zero or more`);

        const template =
          line.kind === 'shipping' ? settings.shipping_template : settings.description_template;

        const description =
          line.description?.trim() ||
          buildDescription(template, {
            poNumber: line.poNumber || '',
            orderNumber: line.orderNumber || '',
            salesRep: line.salesRep || '',
            productDescription: line.productDescription || '',
            carrier: line.carrier || '',
            trackingNumber: line.trackingNumber || ''
          });

        if (!description) throw new Error(`Line ${i + 1}: description is empty — fill the order fields or type one`);

        const accountCode = line.accountCode || settings.default_account_code;
        if (!accountCode) throw new Error(`Line ${i + 1}: no revenue account code set`);

        for (const itemId of [line.blankItemId, line.packagingItemId]) {
          if (itemId && !db.prepare('SELECT 1 FROM inventory_items WHERE id = ?').get(itemId)) {
            throw new Error(`Line ${i + 1}: unknown inventory item ${itemId}`);
          }
        }

        return {
          xero: {
            Description: description.slice(0, 4000),
            Quantity: qty,
            UnitAmount: price,
            AccountCode: String(accountCode),
            ...(line.taxType || settings.default_tax_type
              ? { TaxType: line.taxType || settings.default_tax_type }
              : {})
          },
          local: {
            description,
            quantity: qty,
            unitPrice: price,
            matchedBlankId: line.blankItemId || null,
            matchedBoxId: line.packagingItemId || null,
            nonStock: line.kind === 'shipping' && !line.blankItemId,
            manualMatch: true,
            matchConfidence: 'manual' as const,
            deducted: false
          }
        };
      });

      const issueDate = invoiceDate || new Date().toISOString().slice(0, 10);
      const due =
        dueDate ||
        new Date(Date.now() + (settings.default_due_days ?? 30) * 86400000).toISOString().slice(0, 10);

      const payload = {
        Invoices: [
          {
            Type: 'ACCREC',
            Contact: { ContactID: contactId },
            Date: issueDate,
            DueDate: due,
            LineAmountTypes: lineAmountTypes,
            Status: status,
            ...(reference ? { Reference: String(reference).slice(0, 255) } : {}),
            LineItems: builtLines.map(l => l.xero)
          }
        ]
      };

      // ---- send to Xero ----
      const pushRes = await xeroFetch(auth, '/Invoices', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      const bodyText = await pushRes.text();
      if (!pushRes.ok) {
        console.error('[Xero Invoice Push Failed]', bodyText);
        return res.status(pushRes.status).json({
          error: `Xero rejected the invoice: ${describeXeroError(bodyText)}`
        });
      }

      const created = (JSON.parse(bodyText).Invoices || [])[0];
      if (!created?.InvoiceID) {
        return res.status(502).json({ error: 'Xero accepted the request but returned no invoice' });
      }

      // ---- mirror locally, only now that Xero has it ----
      const stored = mirrorInvoiceLocally({
        created,
        fallbackCustomerName: contact.name,
        fallbackDate: issueDate,
        fallbackDueDate: due,
        fallbackStatus: status,
        localLines: builtLines.map(l => l.local)
      });
      const invoiceNumber = stored.invoiceNumber;

      // Optional stock deduction. Done here rather than reported and skipped:
      // the caller asked for it, so either it happens or the response says why.
      let deducted = 0;
      let deductError: string | null = null;
      if (deductStock) {
        const result = deductForInvoice(
          builtLines
            .filter(l => !l.local.nonStock)
            .map(l => ({
              quantity: l.local.quantity,
              blankItemId: l.local.matchedBlankId,
              packagingItemId: l.local.matchedBoxId
            })),
          invoiceNumber,
          stored.id,
          `Deducted when invoice ${invoiceNumber} was created from the app`
        );
        deducted = result.deducted;
        deductError = result.error;
      }

      res.status(201).json({
        success: true,
        invoiceId: stored.id,
        xeroInvoiceId: created.InvoiceID,
        invoiceNumber,
        status: created.Status || status,
        total: Number(created.Total ?? 0),
        subTotal: Number(created.SubTotal ?? 0),
        totalTax: Number(created.TotalTax ?? 0),
        onlineInvoiceUrl: created.OnlineInvoiceUrl || null,
        stockDeducted: deductStock && !deductError,
        stockMovements: deducted,
        deductError,
        message:
          `Invoice ${invoiceNumber} created in Xero as ${created.Status || status}.` +
          (deductStock
            ? deductError
              ? ` The invoice was created, but the stock deduction failed: ${deductError}`
              : ` ${deducted} stock movement${deducted === 1 ? '' : 's'} written.`
            : '')
      });
    } catch (err: any) {
      const isValidation = /Line \d+:|required|Unknown customer|must be/.test(err.message || '');
      if (!isValidation) console.error('[Xero Invoice Push Error]', err);
      res.status(isValidation ? 400 : 500).json({ error: err.message });
    }
  });

  return router;
}
