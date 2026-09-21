import React, { useState } from 'react';
import { InventoryProvider, useInventory } from './context/InventoryContext';
import { Navbar } from './components/layout/Navbar';
import { TabBar } from './components/layout/TabBar';
import { DashboardView } from './components/dashboard/DashboardView';
import { InventoryCatalogView } from './components/inventory/InventoryCatalogView';
import { BOMView } from './components/bom/BOMView';
import { ProductionView } from './components/production/ProductionView';
import { ShipmentsView } from './components/shipments/ShipmentsView';
import { SalesOrdersView } from './components/orders/SalesOrdersView';
import { ForecastingView } from './components/forecasting/ForecastingView';
import { AuditLogView } from './components/audit/AuditLogView';
import { ReferenceArchitectureView } from './components/reference/ReferenceArchitectureView';

// Modals
import { StockAdjustModal } from './components/modals/StockAdjustModal';
import { NewItemModal } from './components/modals/NewItemModal';
import { EditItemModal } from './components/modals/EditItemModal';
import { NewProductionJobModal } from './components/modals/NewProductionJobModal';
import { CompleteJobModal } from './components/modals/CompleteJobModal';
import { NewPOModal } from './components/modals/NewPOModal';
import { NewSalesOrderModal } from './components/modals/NewSalesOrderModal';
import { NewBOMModal } from './components/modals/NewBOMModal';
import { InventoryItem, ProductionOrder } from './types';
import { Boxes } from 'lucide-react';

const MainAppContent: React.FC = () => {
  const { activeView } = useInventory();

  // Modal states
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [selectedAdjustItem, setSelectedAdjustItem] = useState<InventoryItem | undefined>(undefined);

  const [isNewItemModalOpen, setIsNewItemModalOpen] = useState(false);
  const [isEditItemModalOpen, setIsEditItemModalOpen] = useState(false);
  const [selectedEditItem, setSelectedEditItem] = useState<InventoryItem | null>(null);

  const [isNewJobModalOpen, setIsNewJobModalOpen] = useState(false);
  const [jobDefaultBOMId, setJobDefaultBOMId] = useState<string | undefined>(undefined);
  const [jobDefaultQuantity, setJobDefaultQuantity] = useState<number>(1000);

  const [isCompleteJobModalOpen, setIsCompleteJobModalOpen] = useState(false);
  const [selectedJobToComplete, setSelectedJobToComplete] = useState<ProductionOrder | null>(null);

  const [isNewPOModalOpen, setIsNewPOModalOpen] = useState(false);
  const [isNewSalesOrderModalOpen, setIsNewSalesOrderModalOpen] = useState(false);
  const [isNewBOMModalOpen, setIsNewBOMModalOpen] = useState(false);

  // Handlers
  const handleOpenAdjust = (item?: InventoryItem) => {
    setSelectedAdjustItem(item);
    setIsAdjustModalOpen(true);
  };

  const handleOpenEditItem = (item: InventoryItem) => {
    setSelectedEditItem(item);
    setIsEditItemModalOpen(true);
  };

  const handleLaunchJobFromBOM = (bomId: string, quantity: number) => {
    setJobDefaultBOMId(bomId);
    setJobDefaultQuantity(quantity);
    setIsNewJobModalOpen(true);
  };

  const handleOpenCompleteJob = (job: ProductionOrder) => {
    setSelectedJobToComplete(job);
    setIsCompleteJobModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-indigo-200">
      
      {/* Top Fixed Navbar */}
      <Navbar
        onQuickNewItem={() => setIsNewItemModalOpen(true)}
        onQuickAdjust={() => handleOpenAdjust(undefined)}
      />

      {/* Navigation Tab Bar */}
      <TabBar />

      {/* Primary Work Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeView === 'dashboard' && (
          <DashboardView
            onOpenNewPO={() => setIsNewPOModalOpen(true)}
            onOpenNewJob={() => {
              setJobDefaultBOMId(undefined);
              setIsNewJobModalOpen(true);
            }}
            onOpenAdjustStock={() => handleOpenAdjust(undefined)}
          />
        )}

        {activeView === 'inventory' && (
          <InventoryCatalogView
            onOpenAddItem={() => setIsNewItemModalOpen(true)}
            onOpenAdjustStock={handleOpenAdjust}
            onOpenEditItem={handleOpenEditItem}
          />
        )}

        {activeView === 'bom' && (
          <BOMView
            onOpenCreateBOM={() => setIsNewBOMModalOpen(true)}
            onLaunchJobFromBOM={handleLaunchJobFromBOM}
          />
        )}

        {activeView === 'production' && (
          <ProductionView
            onOpenNewJob={() => {
              setJobDefaultBOMId(undefined);
              setIsNewJobModalOpen(true);
            }}
            onOpenCompleteModal={handleOpenCompleteJob}
          />
        )}

        {activeView === 'shipments' && (
          <ShipmentsView
            onOpenCreatePO={() => setIsNewPOModalOpen(true)}
          />
        )}

        {activeView === 'orders' && (
          <SalesOrdersView
            onOpenCreateOrder={() => setIsNewSalesOrderModalOpen(true)}
          />
        )}

        {activeView === 'forecasting' && (
          <ForecastingView />
        )}

        {activeView === 'audit_log' && (
          <AuditLogView />
        )}

        {activeView === 'reference_architecture' && (
          <ReferenceArchitectureView />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-5 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <Boxes className="w-4 h-4 text-cyan-400" />
            <span className="font-bold text-slate-300">SmartPrint IQ</span>
            <span>&bull; Print Manufacturing &amp; Landed Cost Inventory Management System</span>
          </div>
          <div className="text-[11px] text-slate-500">
            Real-Time State &bull; Multi-Level BOMs &bull; Ocean Container Inbound &bull; Xero 2-Way Sync
          </div>
        </div>
      </footer>

      {/* Modals */}
      <StockAdjustModal
        isOpen={isAdjustModalOpen}
        onClose={() => setIsAdjustModalOpen(false)}
        preselectedItem={selectedAdjustItem}
      />

      <NewItemModal
        isOpen={isNewItemModalOpen}
        onClose={() => setIsNewItemModalOpen(false)}
      />

      <EditItemModal
        isOpen={isEditItemModalOpen}
        onClose={() => {
          setIsEditItemModalOpen(false);
          setSelectedEditItem(null);
        }}
        item={selectedEditItem}
      />

      <NewProductionJobModal
        isOpen={isNewJobModalOpen}
        onClose={() => setIsNewJobModalOpen(false)}
        defaultBOMId={jobDefaultBOMId}
        defaultQuantity={jobDefaultQuantity}
      />

      <CompleteJobModal
        isOpen={isCompleteJobModalOpen}
        onClose={() => {
          setIsCompleteJobModalOpen(false);
          setSelectedJobToComplete(null);
        }}
        job={selectedJobToComplete}
      />

      <NewPOModal
        isOpen={isNewPOModalOpen}
        onClose={() => setIsNewPOModalOpen(false)}
      />

      <NewSalesOrderModal
        isOpen={isNewSalesOrderModalOpen}
        onClose={() => setIsNewSalesOrderModalOpen(false)}
      />

      <NewBOMModal
        isOpen={isNewBOMModalOpen}
        onClose={() => setIsNewBOMModalOpen(false)}
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
