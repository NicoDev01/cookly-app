import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { AppLauncher } from '@capacitor/app-launcher';
import { AppUpdate, AppUpdateResultCode } from '@capawesome/capacitor-app-update';
import { useConvex } from 'convex/react';
import { api } from '../convex/_generated/api';
import { RequiredUpdateCard } from './RequiredUpdateCard';
import { isUpdateRequired } from '../services/requiredUpdate';
import { registerBackButtonOverride } from '../services/backButtonOverride';
import { logger } from '../utils/logger';

/** Apple-ID aus https://apps.apple.com/de/app/id6809963985 (docs/APP_STORE_LISTING_1.5.0.md). */
const IOS_APP_ID = '6809963985';
/** Cookly steht sicher im deutschen Store; die Versionsabfrage läuft gegen diesen Store. */
const IOS_STORE_COUNTRY = 'de';
/** Nur im Dev-Server: localStorage-Schalter, um die Karte im Browser über jedem Tab zu prüfen. */
const DEV_FORCE_KEY = 'cookly.debug.requiredUpdate';

const devForced = () => {
  if (!import.meta.env.DEV) return false;
  try {
    return localStorage.getItem(DEV_FORCE_KEY) === '1';
  } catch {
    return false;
  }
};

const openStore = async (platform: 'ios' | 'android') => {
  try {
    await AppUpdate.openAppStore(platform === 'ios' ? { appId: IOS_APP_ID } : {});
  } catch (error) {
    logger.warn('RequiredUpdate', 'openAppStore failed, falling back to store URL', error);
    // Wie die Abo-Verwaltung (services/billing.ts): im System öffnen, nicht im In-App-Browser.
    await AppLauncher.openUrl({
      url:
        platform === 'ios'
          ? `https://apps.apple.com/app/id${IOS_APP_ID}`
          : 'https://play.google.com/store/apps/details?id=com.cookly.recipe',
    });
  }
};

/**
 * Sperrt die App mit „Update benötigt“, wenn die installierte Version unter der Mindestversion
 * aus Convex liegt und der Store das Update schon anbietet. Prüft beim Start und bei jeder Rückkehr in die App.
 */
export const RequiredUpdateGate: React.FC = () => {
  const convex = useConvex();
  const native = Capacitor.isNativePlatform();
  const platform: 'ios' | 'android' = Capacitor.getPlatform() === 'ios' ? 'ios' : 'android';
  const [required, setRequired] = useState(devForced);
  const [busy, setBusy] = useState(false);
  const checking = useRef(false);

  const check = useCallback(async () => {
    if (!native || checking.current) return;
    checking.current = true;
    try {
      const [minVersion, info] = await Promise.all([
        convex.query(api.appConfig.minAppVersion, { platform }),
        AppUpdate.getAppUpdateInfo(platform === 'ios' ? { country: IOS_STORE_COUNTRY } : undefined),
      ]);
      setRequired(isUpdateRequired(platform, minVersion, info));
    } catch (error) {
      // Offline oder Store nicht erreichbar: lieber nicht sperren als fälschlich sperren.
      logger.warn('RequiredUpdate', 'check failed', error);
    } finally {
      checking.current = false;
    }
  }, [convex, native, platform]);

  useEffect(() => {
    if (!native) return;
    void check();
    const listener = CapacitorApp.addListener('resume', () => void check());
    return () => {
      void listener.then((handle) => handle.remove());
    };
  }, [check, native]);

  // Android-Zurück schließt die Sperre nicht, sondern legt die App in den Hintergrund.
  useEffect(() => {
    if (!required || !native) return;
    return registerBackButtonOverride(() => CapacitorApp.minimizeApp());
  }, [native, required]);

  const update = useCallback(async () => {
    if (!native) return;
    setBusy(true);
    try {
      if (platform === 'android') {
        const info = await AppUpdate.getAppUpdateInfo();
        if (info.immediateUpdateAllowed) {
          const result = await AppUpdate.performImmediateUpdate();
          // OK: Google Play installiert und startet Cookly neu. Abgebrochen: Karte bleibt, erneut tippen möglich.
          if (result.code === AppUpdateResultCode.OK || result.code === AppUpdateResultCode.CANCELED) return;
        }
      }
      await openStore(platform);
    } catch (error) {
      logger.warn('RequiredUpdate', 'update failed, opening store', error);
      await openStore(platform);
    } finally {
      setBusy(false);
    }
  }, [native, platform]);

  if (!required) return null;
  return createPortal(<RequiredUpdateCard platform={platform} busy={busy} onUpdate={() => void update()} />, document.body);
};
