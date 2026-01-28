import React, { createContext, useContext, useState, ReactNode, useMemo } from 'react';

interface ModalContextType {
  isAddModalOpen: boolean;
  openAddModal: () => void;
  closeAddModal: () => void;
  isAddMealModalOpen: boolean;
  openAddMealModal: () => void;
  closeAddMealModal: () => void;
  isAnyModalOpen: boolean;
  closeAllModals: () => void;
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

  const openAddModal = () => setIsAddModalOpen(true);
  const closeAddModal = () => setIsAddModalOpen(false);

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
    }}>
      {children}
    </ModalContext.Provider>
  );
};

ModalProvider.displayName = 'ModalProvider';
