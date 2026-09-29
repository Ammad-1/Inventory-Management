import React, { useState } from 'react';
import { InventoryProvider, useInventory } from './context/InventoryContext';
import { Navbar } from './components/layout/Navbar';
import { Header } from './components/layout/Header';
import { DashboardView } from './components/dashboard/DashboardView';
import { InventoryCatalogView } from './components/inventory/InventoryCatalogView';
import { ShipmentsView } from './components/shipments/ShipmentsView';
import { XeroInvoicesView } from './components/xero/XeroInvoicesView';
import { BOMView } from './components/bom/BOMView';
import { AuditLogView } from './components/audit/AuditLogView';
import { EcommerceView } from './components/ecommerce/EcommerceView';
import { ProductCatalogueView } from './components/products/ProductCatalogueView';
import { QuotesView } from './components/quotes/QuotesView';

// Modals
import { StockAdjustModal } from './components/modals/StockAdjustModal';
import { LogScrapModal } from './components/modals/LogScrapModal';
import { NewItemModal } from './components/modals/NewItemModal';
import { ImportInventoryModal } from './components/modals/ImportInventoryModal';
import { NewShipmentModal } from './components/modals/NewShipmentModal';
import { BuildXeroInvoiceModal } from './components/modals/BuildXeroInvoiceModal';
import { InventoryItem } from './types';
import { QUOTE_HANDOFF_EVENT } from './lib/quoteHandoff';

const MainAppContent: React.FC = () => {
  const { activeView, setActiveView } = useInventory();

  // "Create Quote" on the product page lands on the quote builder; the
  // Quotes view picks the product up from the handoff once it mounts.
  React.useEffect(() => {
    const go = () => setActiveView('quotes');
    window.addEventListener(QUOTE_HANDOFF_EVENT, go);
    return () => window.removeEventListener(QUOTE_HANDOFF_EVENT, go);
  }, [setActiveView]);

  // Modal states
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [selectedAdjustItem, setSelectedAdjustItem] = useState<InventoryItem | undefined>(undefined);

  const [isScrapModalOpen, setIsScrapModalOpen] = useState(false);
  const [selectedScrapItem, setSelectedScrapItem] = useState<InventoryItem | undefined>(undefined);

  const [isNewItemModalOpen, setIsNewItemModalOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isNewShipmentOpen, setIsNewShipmentOpen] = useState(false);
  const [isNewInvoiceOpen, setIsNewInvoiceOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 flex flex-col font-sans antialiased selection:bg-indigo-500/20 selection:text-indigo-900">
      
      {/* Top Navbar */}
      <Navbar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 mx-auto w-full max-w-[1560px]">
        
        {/* Top Header */}
        <Header
          onQuickScrap={() => {
            setSelectedScrapItem(undefined);
            setIsScrapModalOpen(true);
          }}
          onQuickAdjust={() => {
            setSelectedAdjustItem(undefined);
            setIsAdjustModalOpen(true);
          }}
          onQuickInvoice={() => setIsNewInvoiceOpen(true)}
        />

        {/* View Router */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 pb-8 w-full">
          {activeView === 'dashboard' && (
            <DashboardView
              onOpenNewShipment={() => setIsNewShipmentOpen(true)}
              onOpenCreateInvoice={() => setIsNewInvoiceOpen(true)}
              onOpenScrapModal={() => {
                setSelectedScrapItem(undefined);
                setIsScrapModalOpen(true);
              }}
              onOpenAdjustStock={() => {
                setSelectedAdjustItem(undefined);
                setIsAdjustModalOpen(true);
              }}
            />
          )}

          {activeView === 'inventory' && (
            <InventoryCatalogView
              onOpenAddItem={() => setIsNewItemModalOpen(true)}
              onOpenImport={() => setIsImportOpen(true)}
              onOpenAdjustStock={(item) => {
                setSelectedAdjustItem(item);
                setIsAdjustModalOpen(true);
              }}
              onOpenScrapModal={(item) => {
                setSelectedScrapItem(item);
                setIsScrapModalOpen(true);
              }}
            />
          )}

          {activeView === 'shipments' && (
            <ShipmentsView />
          )}

          {activeView === 'xero' && (
            <XeroInvoicesView
              onOpenCreateInvoice={() => setIsNewInvoiceOpen(true)}
            />
          )}

          {activeView === 'ecommerce' && (
            <EcommerceView />
          )}

          {activeView === 'products' && (
            <ProductCatalogueView />
          )}

          {activeView === 'quotes' && (
            <QuotesView />
          )}

          {activeView === 'bom' && (
            <BOMView />
          )}

          {activeView === 'movements' && (
            <AuditLogView />
          )}
        </main>
      </div>

      {/* Modals */}
      <StockAdjustModal
        isOpen={isAdjustModalOpen}
        onClose={() => setIsAdjustModalOpen(false)}
        preselectedItem={selectedAdjustItem}
      />

      <LogScrapModal
        isOpen={isScrapModalOpen}
        onClose={() => setIsScrapModalOpen(false)}
        preselectedItemId={selectedScrapItem?.id}
      />

      <NewItemModal
        isOpen={isNewItemModalOpen}
        onClose={() => setIsNewItemModalOpen(false)}
      />

      <ImportInventoryModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
      />

      <NewShipmentModal
        isOpen={isNewShipmentOpen}
        onClose={() => setIsNewShipmentOpen(false)}
      />

      <BuildXeroInvoiceModal
        isOpen={isNewInvoiceOpen}
        onClose={() => setIsNewInvoiceOpen(false)}
      />

    </div>
  );
};

export default function App() {
  return (
    <InventoryProvider>
      <MainAppContent />
    </InventoryProvider>
  );
}
