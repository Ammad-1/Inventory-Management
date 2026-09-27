import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { 
  InventoryItem, 
  RecipeBOM, 
  InboundShipment, 
  XeroInvoice, 
  StockMovement, 
  EcommerceOrder,
  EcommerceChannelInfo,
  XeroStatus,
  XeroOAuthStatus,
  ValuationHistory,
  XeroSyncOptions,
  XeroLineEdit,
  XeroReference,
  XeroInvoiceSettings,
  XeroPushPayload,
  XeroPushResult,
  ImportMode,
  ImportPreview,
  ImportRow,
  ActiveView,
  DefectReason
} from '../types';

interface InventoryContextType {
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
  inventory: InventoryItem[];
  recipes: RecipeBOM[];
  shipments: InboundShipment[];
  invoices: XeroInvoice[];
  movements: StockMovement[];
  ecommerceOrders: EcommerceOrder[];
  ecommerceChannels: EcommerceChannelInfo[];
  webhookLogs: any[];
  xeroWebhookConfig: any;
  valuationHistory: ValuationHistory | null;
  xeroReference: XeroReference | null;
  xeroInvoiceSettings: XeroInvoiceSettings | null;
  syncXeroReference: () => Promise<{ success: boolean; message: string }>;
  pushXeroInvoice: (payload: XeroPushPayload) => Promise<XeroPushResult>;
  xeroStatus: XeroStatus | null;
  xeroOAuthStatus: XeroOAuthStatus | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  refreshAll: () => Promise<void>;
  saveXeroCredentials: (clientId: string, clientSecret: string, redirectUri?: string) => Promise<{ success: boolean; message: string }>;
  disconnectXero: () => Promise<{ success: boolean; message: string }>;
  syncRealXeroInvoices: (options?: XeroSyncOptions) => Promise<{ success: boolean; message: string; importedCount?: number }>;
  fetchXeroOAuthStatus: () => Promise<void>;
  adjustStock: (itemId: string, qtyDelta: number, reason: string, operatorName?: string) => Promise<boolean>;
  logScrap: (payload: {
    itemId: string;
    quantity: number;
    defectReason: DefectReason;
    jobReference?: string;
    operatorName?: string;
    notes?: string;
  }) => Promise<{ success: boolean; message: string }>;
  receiveShipment: (shipmentId: string) => Promise<{ success: boolean; message: string }>;
  createShipment: (payload: any) => Promise<{ success: boolean; message: string }>;
  deductXeroInvoice: (invoiceId: string) => Promise<{ success: boolean; message: string }>;
  saveInvoiceLines: (invoiceId: string, lines: XeroLineEdit[]) => Promise<{ success: boolean; message: string }>;
  deleteXeroInvoice: (invoiceId: string) => Promise<{ success: boolean; message: string }>;
  createXeroInvoice: (payload: {
    customerName: string;
    recipeId?: string;
    blankItemId?: string;
    packagingItemId?: string;
    quantity: number;
    unitPrice: number;
    customNotes?: string;
  }) => Promise<{ success: boolean; invoiceNumber?: string; message: string }>;
  mockGenerateXeroInvoice: () => Promise<void>;
  createItem: (item: Partial<InventoryItem>) => Promise<boolean>;
  deleteItem: (id: string) => Promise<{ success: boolean; message: string }>;
  previewImport: (file: File, mode: ImportMode) => Promise<{ success: boolean; message?: string; preview?: ImportPreview }>;
  commitImport: (mode: ImportMode, rows: ImportRow[], operatorName?: string) => Promise<{ success: boolean; message: string }>;
  updateItem: (id: string, updates: Partial<InventoryItem>) => Promise<boolean>;
  simulateEcommerceOrder: (payload: {
    platform: string;
    customerName: string;
    productType?: string;
    quantity: number;
    unitPrice?: number;
    productTitle?: string;
  }) => Promise<{ success: boolean; message: string; orderNumber?: string; deductions?: any[] }>;
  deleteEcommerceOrder: (orderId: string) => Promise<{ success: boolean; message: string }>;
  testXeroWebhook: (payload: {
    testType: string;
    customKey?: string;
    simulateTamper?: boolean;
  }) => Promise<any>;
  clearWebhookLogs: () => Promise<void>;
  fetchWebhookLogs: () => Promise<void>;
}

const InventoryContext = createContext<InventoryContextType | undefined>(undefined);

export const InventoryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeView, setActiveView] = useState<ActiveView>('dashboard');
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [recipes, setRecipes] = useState<RecipeBOM[]>([]);
  const [shipments, setShipments] = useState<InboundShipment[]>([]);
  const [invoices, setInvoices] = useState<XeroInvoice[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [ecommerceOrders, setEcommerceOrders] = useState<EcommerceOrder[]>([]);
  const [ecommerceChannels, setEcommerceChannels] = useState<EcommerceChannelInfo[]>([]);
  const [webhookLogs, setWebhookLogs] = useState<any[]>([]);
  const [valuationHistory, setValuationHistory] = useState<ValuationHistory | null>(null);
  const [xeroReference, setXeroReference] = useState<XeroReference | null>(null);
  const [xeroInvoiceSettings, setXeroInvoiceSettings] = useState<XeroInvoiceSettings | null>(null);
  const [xeroWebhookConfig, setXeroWebhookConfig] = useState<any>(null);
  const [xeroStatus, setXeroStatus] = useState<XeroStatus | null>(null);
  const [xeroOAuthStatus, setXeroOAuthStatus] = useState<XeroOAuthStatus | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchXeroOAuthStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/xero/oauth/status');
      const data = await res.json();
      if (data && !data.error) {
        setXeroOAuthStatus(data);
      }
    } catch (err) {
      console.error('Failed to fetch Xero OAuth status:', err);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [invRes, recRes, shpRes, invcRes, movRes, xeroRes, ecomOrdersRes, ecomChannelsRes, whLogsRes, xeroOAuthRes, valHistRes, xeroRefRes, xeroSettingsRes] = await Promise.all([
        fetch('/api/inventory').then(r => r.json()).catch(() => []),
        fetch('/api/bom').then(r => r.json()).catch(() => []),
        fetch('/api/shipments').then(r => r.json()).catch(() => []),
        fetch('/api/xero/invoices').then(r => r.json()).catch(() => []),
        fetch('/api/inventory/movements').then(r => r.json()).catch(() => []),
        fetch('/api/xero/status').then(r => r.json()).catch(() => null),
        fetch('/api/ecommerce/orders').then(r => r.json()).catch(() => []),
        fetch('/api/ecommerce/channels').then(r => r.json()).catch(() => []),
        fetch('/api/xero/webhook/logs').then(r => r.json()).catch(() => null),
        fetch('/api/xero/oauth/status').then(r => r.json()).catch(() => null),
        fetch('/api/inventory/valuation-history?months=6').then(r => r.json()).catch(() => null),
        fetch('/api/xero/reference').then(r => r.json()).catch(() => null),
        fetch('/api/xero/settings').then(r => r.json()).catch(() => null),
      ]);

      if (Array.isArray(invRes)) setInventory(invRes);
      if (Array.isArray(recRes)) setRecipes(recRes);
      if (Array.isArray(shpRes)) setShipments(shpRes);
      if (Array.isArray(invcRes)) setInvoices(invcRes);
      if (Array.isArray(movRes)) setMovements(movRes);
      if (Array.isArray(ecomOrdersRes)) setEcommerceOrders(ecomOrdersRes);
      if (Array.isArray(ecomChannelsRes)) setEcommerceChannels(ecomChannelsRes);
      if (xeroRes && !xeroRes.error) setXeroStatus(xeroRes);
      if (valHistRes && Array.isArray(valHistRes.points)) setValuationHistory(valHistRes);
      if (xeroRefRes && Array.isArray(xeroRefRes.contacts)) setXeroReference(xeroRefRes);
      if (xeroSettingsRes && !xeroSettingsRes.error) setXeroInvoiceSettings(xeroSettingsRes);
      if (xeroOAuthRes && !xeroOAuthRes.error) setXeroOAuthStatus(xeroOAuthRes);
      if (whLogsRes) {
        if (Array.isArray(whLogsRes.logs)) setWebhookLogs(whLogsRes.logs);
        setXeroWebhookConfig(whLogsRes);
      }
    } catch (err: any) {
      console.error('Error fetching data from API:', err);
      setError(err.message || 'Failed to connect to backend');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Handle OAuth callback redirects from Xero
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('xero_success') === 'true') {
      refreshAll();
      window.history.replaceState({}, '', window.location.pathname);
    } else if (urlParams.get('xero_error')) {
      setError(`Xero connection failed: ${urlParams.get('xero_error')}`);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [refreshAll]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // Adjust stock
  const adjustStock = async (itemId: string, qtyDelta: number, reason: string, operatorName = 'Warehouse Staff') => {
    try {
      const res = await fetch(`/api/inventory/${itemId}/adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qtyDelta, reason, operatorName }),
      });
      if (!res.ok) throw new Error('Failed to adjust stock');
      await refreshAll();
      return true;
    } catch (err: any) {
      alert(err.message);
      return false;
    }
  };

  // Factory Scrap Logging
  const logScrap = async (payload: {
    itemId: string;
    quantity: number;
    defectReason: DefectReason;
    jobReference?: string;
    operatorName?: string;
    notes?: string;
  }) => {
    try {
      const res = await fetch('/api/inventory/scrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to log scrap');
      await refreshAll();
      return { success: true, message: data.message };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  };

  // Receive Inbound Container
  const receiveShipment = async (shipmentId: string) => {
    try {
      const res = await fetch(`/api/shipments/${shipmentId}/receive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to receive shipment');
      await refreshAll();
      return { success: true, message: data.message };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  };

  // Create Shipment
  const createShipment = async (payload: any) => {
    try {
      const res = await fetch('/api/shipments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create shipment');
      await refreshAll();
      return { success: true, message: data.message };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  };

  // Deduct stock for Xero Invoice
  const deductXeroInvoice = async (invoiceId: string) => {
    try {
      const res = await fetch(`/api/xero/invoices/${invoiceId}/deduct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to deduct stock');
      await refreshAll();
      return { success: true, message: data.message };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  };

  // Pull customers, revenue accounts and tax rates from Xero
  const syncXeroReference = async () => {
    try {
      const res = await fetch('/api/xero/reference/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to import Xero reference data');
      await refreshAll();
      return { success: true, message: data.message };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  };

  // Create a real invoice in Xero from the app
  const pushXeroInvoice = async (payload: XeroPushPayload): Promise<XeroPushResult> => {
    try {
      const res = await fetch('/api/xero/invoices/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create the invoice in Xero');
      await refreshAll();
      return {
        success: true,
        message: data.message,
        invoiceNumber: data.invoiceNumber,
        xeroInvoiceId: data.xeroInvoiceId,
        total: data.total,
        status: data.status,
      };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  };

  // Persist manual line matching for one invoice
  const saveInvoiceLines = async (invoiceId: string, lines: XeroLineEdit[]) => {
    try {
      const res = await fetch(`/api/xero/invoices/${invoiceId}/lines`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save line matching');
      await refreshAll();
      return { success: true, message: data.message };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  };

  // Delete Xero Invoice
  const deleteXeroInvoice = async (invoiceId: string) => {
    try {
      const res = await fetch(`/api/xero/invoices/${invoiceId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete invoice');
      await refreshAll();
      return { success: true, message: data.message };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  };

  // Create and push invoice to Xero
  const createXeroInvoice = async (payload: {
    customerName: string;
    recipeId?: string;
    blankItemId?: string;
    packagingItemId?: string;
    quantity: number;
    unitPrice: number;
    customNotes?: string;
  }) => {
    try {
      const res = await fetch('/api/xero/invoices/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create invoice');
      await refreshAll();
      return { success: true, invoiceNumber: data.invoiceNumber, message: data.message };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  };

  // Simulate new incoming Xero invoice
  const mockGenerateXeroInvoice = async () => {
    try {
      const res = await fetch('/api/xero/invoices/mock-generate', {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok) {
        await refreshAll();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Create item
  const createItem = async (item: Partial<InventoryItem>) => {
    try {
      const res = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      });
      if (!res.ok) throw new Error('Failed to create item');
      await refreshAll();
      return true;
    } catch (err: any) {
      alert(err.message);
      return false;
    }
  };

  // Delete a SKU (server refuses if it holds stock, has ledger history or is used by a recipe)
  const deleteItem = async (id: string) => {
    try {
      const res = await fetch(`/api/inventory/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete item');
      await refreshAll();
      return { success: true, message: data.message };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  };

  // Parse and validate a spreadsheet without writing anything
  const previewImport = async (file: File, mode: ImportMode) => {
    try {
      const res = await fetch(
        `/api/inventory/import/preview?mode=${mode}&filename=${encodeURIComponent(file.name)}`,
        { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not read the file');
      return { success: true, preview: data as ImportPreview };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  };

  const commitImport = async (mode: ImportMode, rows: ImportRow[], operatorName?: string) => {
    try {
      const res = await fetch('/api/inventory/import/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, rows, operatorName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');
      await refreshAll();
      return { success: true, message: data.message };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  };

  // Update item
  const updateItem = async (id: string, updates: Partial<InventoryItem>) => {
    try {
      const res = await fetch(`/api/inventory/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error('Failed to update item');
      await refreshAll();
      return true;
    } catch (err: any) {
      alert(err.message);
      return false;
    }
  };

  // Simulate eCommerce order and stock deduction
  const simulateEcommerceOrder = async (payload: {
    platform: string;
    customerName: string;
    productType?: string;
    quantity: number;
    unitPrice?: number;
    productTitle?: string;
  }) => {
    try {
      const res = await fetch('/api/ecommerce/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to simulate order');
      await refreshAll();
      return { 
        success: true, 
        message: data.message, 
        orderNumber: data.orderNumber,
        deductions: data.deductions 
      };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  };

  // Delete eCommerce order
  const deleteEcommerceOrder = async (orderId: string) => {
    try {
      const res = await fetch(`/api/ecommerce/orders/${orderId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete order');
      await refreshAll();
      return { success: true, message: data.message };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  };

  // Test Xero Webhook
  const testXeroWebhook = async (payload: {
    testType: string;
    customKey?: string;
    simulateTamper?: boolean;
  }) => {
    try {
      const res = await fetch('/api/xero/webhook/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      await fetchWebhookLogs();
      return data;
    } catch (err: any) {
      console.error('Error simulating Xero webhook:', err);
      return { success: false, message: err.message };
    }
  };

  // Fetch Webhook logs
  const fetchWebhookLogs = async () => {
    try {
      const res = await fetch('/api/xero/webhook/logs');
      const data = await res.json();
      if (data && Array.isArray(data.logs)) {
        setWebhookLogs(data.logs);
        setXeroWebhookConfig(data);
      }
    } catch (err) {
      console.error('Failed to fetch webhook logs:', err);
    }
  };

  // Clear Webhook logs
  const clearWebhookLogs = async () => {
    try {
      await fetch('/api/xero/webhook/clear-logs', { method: 'POST' });
      setWebhookLogs([]);
    } catch (err) {
      console.error('Failed to clear webhook logs:', err);
    }
  };

  // Real Xero OAuth Actions
  const saveXeroCredentials = async (clientId: string, clientSecret: string, redirectUri?: string) => {
    try {
      const res = await fetch('/api/xero/oauth/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, clientSecret, redirectUri })
      });
      const data = await res.json();
      if (res.ok) {
        await refreshAll();
        return { success: true, message: data.message || 'Xero API credentials saved successfully!' };
      }
      return { success: false, message: data.error || 'Failed to save Xero credentials.' };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  };

  const disconnectXero = async () => {
    try {
      const res = await fetch('/api/xero/oauth/disconnect', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        await refreshAll();
        return { success: true, message: 'Disconnected from Xero' };
      }
      return { success: false, message: data.error || 'Failed to disconnect from Xero' };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  };

  const syncRealXeroInvoices = async (options: XeroSyncOptions = { mode: 'recent', limit: 5 }) => {
    try {
      const res = await fetch('/api/xero/oauth/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options)
      });
      const data = await res.json();
      if (res.ok) {
        await refreshAll();
        return {
          success: true,
          message: data.message || `Successfully synced ${data.importedCount || 0} invoices from Xero!`,
          importedCount: data.importedCount
        };
      }
      return { success: false, message: data.error || 'Failed to sync invoices from Xero.' };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  };

  return (
    <InventoryContext.Provider
      value={{
        activeView,
        setActiveView,
        inventory,
        recipes,
        shipments,
        invoices,
        movements,
        ecommerceOrders,
        ecommerceChannels,
        webhookLogs,
        xeroWebhookConfig,
        valuationHistory,
        xeroReference,
        xeroInvoiceSettings,
        syncXeroReference,
        pushXeroInvoice,
        xeroStatus,
        xeroOAuthStatus,
        isLoading,
        error,
        refreshAll,
        saveXeroCredentials,
        disconnectXero,
        syncRealXeroInvoices,
        fetchXeroOAuthStatus,
        adjustStock,
        logScrap,
        receiveShipment,
        createShipment,
        deductXeroInvoice,
        saveInvoiceLines,
        deleteXeroInvoice,
        createXeroInvoice,
        mockGenerateXeroInvoice,
        createItem,
        updateItem,
        deleteItem,
        previewImport,
        commitImport,
        simulateEcommerceOrder,
        deleteEcommerceOrder,
        testXeroWebhook,
        clearWebhookLogs,
        fetchWebhookLogs,
      }}
    >
      {children}
    </InventoryContext.Provider>
  );
};

export const useInventory = () => {
  const context = useContext(InventoryContext);
  if (!context) {
    throw new Error('useInventory must be used within an InventoryProvider');
  }
  return context;
};
