import { useCallback } from 'react';
import { logger } from '../utils/logger';
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

type HapticStyle = 'light' | 'medium' | 'heavy';

/**
 * Hook für Haptic Feedback (Vibration)
 * Fungtioniert auf nativen Devices, graceful degradation im Web
 */
export const useHaptic = () => {
  const isNative = useCallback(() => {
    try {
      return Capacitor.isNativePlatform();
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
      logger.debug('Haptic', 'Haptic feedback not available', error);
    }
  }, [isNative]);

  const success = useCallback(async () => {
    if (!isNative()) return;

    try {
      await Haptics.notification({
        type: NotificationType.Success,
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
        type: NotificationType.Warning,
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
        type: NotificationType.Error,
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
