import React, { createContext, useContext, useState, ReactNode, useMemo, useCallback } from 'react';

interface AddMealModalOptions {
  date?: string;
  scope?: 'day' | 'week';
}

interface ModalContextType {
  isAddModalOpen: boolean;
  openAddModal: (options?: { importUrl?: string; initialTab?: 'ai' | 'manual' }) => void;
  closeAddModal: () => void;
  isAddMealModalOpen: boolean;
  addMealModalOptions: AddMealModalOptions;
  openAddMealModal: (options?: AddMealModalOptions) => void;
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
  const [addMealModalOptions, setAddMealModalOptions] = useState<AddMealModalOptions>({});

  const openAddModal = useCallback((options?: { importUrl?: string; initialTab?: 'ai' | 'manual' }) => {
    setAddModalImportUrl(options?.importUrl ?? null);
    setAddModalInitialTab(options?.initialTab ?? null);
    setIsAddModalOpen(true);
  }, []);

  const closeAddModal = useCallback(() => {
    setIsAddModalOpen(false);
    setAddModalImportUrl(null);
    setAddModalInitialTab(null);
  }, []);

  const openAddMealModal = useCallback((options?: AddMealModalOptions) => {
    if (options) {
      setAddMealModalOptions(options);
    }
    setIsAddMealModalOpen(true);
  }, []);

  const closeAddMealModal = useCallback(() => {
    setIsAddMealModalOpen(false);
    setAddMealModalOptions({});
  }, []);

  const isAnyModalOpen = useMemo(
    () => isAddModalOpen || isAddMealModalOpen,
    [isAddModalOpen, isAddMealModalOpen]
  );

  const closeAllModals = useCallback(() => {
    if (isAddModalOpen) closeAddModal();
    if (isAddMealModalOpen) closeAddMealModal();
  }, [isAddModalOpen, isAddMealModalOpen, closeAddModal, closeAddMealModal]);

  return (
    <ModalContext.Provider value={{
      isAddModalOpen,
      openAddModal,
      closeAddModal,
      isAddMealModalOpen,
      addMealModalOptions,
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
