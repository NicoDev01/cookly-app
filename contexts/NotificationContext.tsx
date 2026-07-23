import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { logger } from '../utils/logger';
import { createToastState, hiddenToastState, type ToastState, type ToastTone } from '../utils/toastState';

/**
 * NotificationContext - Global State für Import-Notifications
 * 
 * Löst das Problem, dass der Toast nur auf ShareTargetPage sichtbar war.
 * Jetzt ist der Toast app-weit verfügbar, egal auf welcher Seite der User ist.
 */

interface NotificationContextType {
  // Toast State
  toast: ToastState;
  showImportToast: (recipeId: string, message?: string) => void;
  showToast: (message: string, tone?: ToastTone) => void;
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
  title: string;
  tone: ToastTone;
  onNavigate: () => void;
  onDismiss: () => void;
}> = ({ visible, recipeId, message, title, tone, onNavigate, onDismiss }) => {
  useEffect(() => {
    if (visible) {
      logger.debug('Toast', 'Toast visible', { recipeId });
      // Auto-dismiss nach 6 Sekunden
      const timer = setTimeout(onDismiss, 6000);
      return () => clearTimeout(timer);
    }
  }, [visible, onDismiss, recipeId]);

  if (!visible) return null;

  const toneClasses = {
    success: 'bg-green-500 text-white shadow-green-500/30',
    error: 'bg-red-500 text-white shadow-red-500/30',
    info: 'bg-primary text-white shadow-primary/30',
  }[tone];
  const icon = tone === 'success' ? 'check_circle' : tone === 'error' ? 'error' : 'info';

  return (
    <div 
      className="fixed bottom-24 left-4 right-4 z-[100] animate-in slide-in-from-bottom-4 duration-300"
      onClick={onNavigate}
    >
      <div className={`${toneClasses} px-4 py-4 rounded-2xl shadow-lg flex items-center gap-3 active:scale-[0.98] transition-transform cursor-pointer`}>
        <div className="size-10 rounded-xl bg-white/20 flex items-center justify-center">
          <span className="material-symbols-outlined text-2xl">{icon}</span>
        </div>
        <div className="flex-1">
          <p className="font-bold">{title}</p>
          <p className="text-sm text-white/80">{message || 'Tippe zum Ansehen'}</p>
        </div>
        {recipeId && <span className="material-symbols-outlined text-white/60">arrow_forward</span>}
      </div>
    </div>
  );
};

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  
  const [toast, setToast] = useState<ToastState>(hiddenToastState);

  /**
   * Zeigt den Import-Toast an
   * Kann von überall in der App aufgerufen werden
   */
  const showImportToast = useCallback((recipeId: string, message?: string) => {
    logger.debug('Toast', 'showImportToast called', { recipeId });
    setToast(createToastState(message || 'Tippe zum Ansehen', 'success', recipeId));
  }, []);

  const showToast = useCallback((message: string, tone: ToastTone = 'info') => {
    setToast(createToastState(message, tone));
  }, []);

  /**
   * Versteckt den Toast
   */
  const hideImportToast = useCallback(() => {
    logger.debug('Toast', 'hideImportToast called');
    setToast(prev => ({ ...prev, visible: false }));
  }, []);

  /**
   * Navigation zum Rezept wenn auf Toast getippt wird
   */
  const handleToastNavigate = useCallback(() => {
    if (toast.recipeId) {
      logger.debug('Toast', 'Navigating to recipe', { recipeId: toast.recipeId });
      navigate(`/recipe/${toast.recipeId}`);
      hideImportToast();
      return;
    }
    hideImportToast();
  }, [toast.recipeId, navigate, hideImportToast]);

  return (
    <NotificationContext.Provider value={{ toast, showImportToast, showToast, hideImportToast }}>
      {children}
      
      {/* Global Toast - immer verfügbar */}
      <GlobalImportToast
        visible={toast.visible}
        recipeId={toast.recipeId}
        message={toast.message}
        title={toast.title}
        tone={toast.tone}
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
