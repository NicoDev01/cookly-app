import React, { createContext, useContext, useState, ReactNode, useMemo } from 'react';

interface ModalContextType {
  isAddModalOpen: boolean;
  openAddModal: (options?: { importUrl?: string; initialTab?: 'ai' | 'manual' }) => void;
  closeAddModal: () => void;
  isAddMealModalOpen: boolean;
  openAddMealModal: () => void;
  closeAddMealModal: () => void;
  isAnyModalOpen: boolean;
  closeAllModals: () => void;
  // URL to pre-fill when opening the add modal
  addModalImportUrl: string | null;
  // Initial tab for the add modal
  addModalInitialTab: 'ai' | 'manual' | null;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

export const useModal = () => {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error('useModal must be used within ModalProvider');
  }
  return context;
};

export const ModalProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAddMealModalOpen, setIsAddMealModalOpen] = useState(false);
  const [addModalImportUrl, setAddModalImportUrl] = useState<string | null>(null);
  const [addModalInitialTab, setAddModalInitialTab] = useState<'ai' | 'manual' | null>(null);

  const openAddModal = (options?: { importUrl?: string; initialTab?: 'ai' | 'manual' }) => {
    setAddModalImportUrl(options?.importUrl ?? null);
    setAddModalInitialTab(options?.initialTab ?? null);
    setIsAddModalOpen(true);
  };
  const closeAddModal = () => {
    setIsAddModalOpen(false);
    setAddModalImportUrl(null);
    setAddModalInitialTab(null);
  };

  const openAddMealModal = () => setIsAddMealModalOpen(true);
  const closeAddMealModal = () => setIsAddMealModalOpen(false);

  const isAnyModalOpen = useMemo(
    () => isAddModalOpen || isAddMealModalOpen,
    [isAddModalOpen, isAddMealModalOpen]
  );

  const closeAllModals = () => {
    if (isAddModalOpen) closeAddModal();
    if (isAddMealModalOpen) closeAddMealModal();
  };

  return (
    <ModalContext.Provider value={{
      isAddModalOpen,
      openAddModal,
      closeAddModal,
      isAddMealModalOpen,
      openAddMealModal,
      closeAddMealModal,
      isAnyModalOpen,
      closeAllModals,
      addModalImportUrl,
      addModalInitialTab,
    }}>
      {children}
    </ModalContext.Provider>
  );
};

ModalProvider.displayName = 'ModalProvider';
