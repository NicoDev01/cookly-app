import React, { useState, useEffect } from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineBanner: React.FC = () => {
  const { isOnline } = useOnlineStatus();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Show banner when offline
    if (!isOnline) {
      setIsVisible(true);
    } else {
      // Hide banner with a small delay when coming back online
      const timer = setTimeout(() => setIsVisible(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [isOnline]);

  if (isOnline || !isVisible) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-amber-500 text-white px-4 py-2 flex items-center justify-center gap-2 shadow-lg animate-in slide-in-from-top">
      <span className="material-symbols-outlined text-xl">wifi_off</span>
      <span className="text-sm font-medium">
        Du bist offline. Einige Funktionen stehen nicht zur Verfügung.
      </span>
    </div>
  );
};

OfflineBanner.displayName = 'OfflineBanner';

// Also export a hook for checking online status in components
export { useOnlineStatus } from '../hooks/useOnlineStatus';
