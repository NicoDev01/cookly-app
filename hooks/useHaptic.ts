import { useCallback } from 'react';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

type HapticStyle = 'light' | 'medium' | 'heavy';

/**
 * Hook für Haptic Feedback (Vibration)
 * Fungtioniert auf nativen Devices, graceful degradation im Web
 */
export const useHaptic = () => {
  const isNative = useCallback(() => {
    try {
      return window.Capacitor?.isNativePlatform ?? false;
    } catch {
      return false;
    }
  }, []);

  const impact = useCallback(async (style: HapticStyle = 'light') => {
    // Im Web keine Haptics (nicht supported)
    if (!isNative()) {
      return;
    }

    try {
      const impactStyle = {
        light: ImpactStyle.Light,
        medium: ImpactStyle.Medium,
        heavy: ImpactStyle.Heavy,
      }[style];

      await Haptics.impact({ style: impactStyle });
    } catch (error) {
      // Silent fail - Haptics sind optional
      console.debug('Haptic feedback not available:', error);
    }
  }, [isNative]);

  const success = useCallback(async () => {
    if (!isNative()) return;

    try {
      await Haptics.notification({
        type: 'SUCCESS',
      });
    } catch {
      // Fallback to medium impact
      impact('medium');
    }
  }, [isNative, impact]);

  const warning = useCallback(async () => {
    if (!isNative()) return;

    try {
      await Haptics.notification({
        type: 'WARNING',
      });
    } catch {
      // Fallback to heavy impact
      impact('heavy');
    }
  }, [isNative, impact]);

  const error = useCallback(async () => {
    if (!isNative()) return;

    try {
      await Haptics.notification({
        type: 'ERROR',
      });
    } catch {
      // Fallback to heavy impact
      impact('heavy');
    }
  }, [isNative, impact]);

  const selection = useCallback(async () => {
    if (!isNative()) return;

    try {
      await Haptics.selectionChanged();
    } catch {
      // Silent fail
    }
  }, [isNative]);

  return {
    impact,
    success,
    warning,
    error,
    selection,
    isNative: isNative(),
  };
};

useHaptic.displayName = 'useHaptic';
