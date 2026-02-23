import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * NotificationContext - Global State für Import-Notifications
 * 
 * Löst das Problem, dass der Toast nur auf ShareTargetPage sichtbar war.
 * Jetzt ist der Toast app-weit verfügbar, egal auf welcher Seite der User ist.
 */

interface ToastState {
  visible: boolean;
  recipeId: string | null;
  message: string;
}

interface NotificationContextType {
  // Toast State
  toast: ToastState;
  showImportToast: (recipeId: string, message?: string) => void;
  hideImportToast: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

/**
 * Global Import Toast Komponente
 * Wird IMMER gerendert (nicht nur auf ShareTargetPage)
 */
const GlobalImportToast: React.FC<{
  visible: boolean;
  recipeId: string | null;
  message: string;
  onNavigate: () => void;
  onDismiss: () => void;
}> = ({ visible, recipeId, message, onNavigate, onDismiss }) => {
  useEffect(() => {
    if (visible) {
      console.log('[NotificationContext] Toast visible, recipeId:', recipeId);
      // Auto-dismiss nach 6 Sekunden
      const timer = setTimeout(onDismiss, 6000);
      return () => clearTimeout(timer);
    }
  }, [visible, onDismiss, recipeId]);

  if (!visible) return null;

  return (
    <div 
      className="fixed bottom-24 left-4 right-4 z-[100] animate-in slide-in-from-bottom-4 duration-300"
      onClick={onNavigate}
    >
      <div className="bg-green-500 text-white px-4 py-4 rounded-2xl shadow-lg shadow-green-500/30 flex items-center gap-3 active:scale-[0.98] transition-transform cursor-pointer">
        <div className="size-10 rounded-xl bg-white/20 flex items-center justify-center">
          <span className="material-symbols-outlined text-2xl">check_circle</span>
        </div>
        <div className="flex-1">
          <p className="font-bold">Rezept importiert! ✨</p>
          <p className="text-sm text-white/80">{message || 'Tippe zum Ansehen'}</p>
        </div>
        <span className="material-symbols-outlined text-white/60">arrow_forward</span>
      </div>
    </div>
  );
};

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  
  const [toast, setToast] = useState<ToastState>({
    visible: false,
    recipeId: null,
    message: 'Tippe zum Ansehen',
  });

  /**
   * Zeigt den Import-Toast an
   * Kann von überall in der App aufgerufen werden
   */
  const showImportToast = useCallback((recipeId: string, message?: string) => {
    console.log('[NotificationContext] showImportToast called with recipeId:', recipeId);
    setToast({
      visible: true,
      recipeId,
      message: message || 'Tippe zum Ansehen',
    });
  }, []);

  /**
   * Versteckt den Toast
   */
  const hideImportToast = useCallback(() => {
    console.log('[NotificationContext] hideImportToast called');
    setToast(prev => ({ ...prev, visible: false }));
  }, []);

  /**
   * Navigation zum Rezept wenn auf Toast getippt wird
   */
  const handleToastNavigate = useCallback(() => {
    if (toast.recipeId) {
      console.log('[NotificationContext] Navigating to recipe:', toast.recipeId);
      navigate(`/recipe/${toast.recipeId}`);
      hideImportToast();
    }
  }, [toast.recipeId, navigate, hideImportToast]);

  return (
    <NotificationContext.Provider value={{ toast, showImportToast, hideImportToast }}>
      {children}
      
      {/* Global Toast - immer verfügbar */}
      <GlobalImportToast
        visible={toast.visible}
        recipeId={toast.recipeId}
        message={toast.message}
        onNavigate={handleToastNavigate}
        onDismiss={hideImportToast}
      />
    </NotificationContext.Provider>
  );
};

/**
 * Hook um auf den NotificationContext zuzugreifen
 */
export const useNotification = (): NotificationContextType => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};

export default NotificationContext;
