/**
 * Wartet, bis die App-Fonts gerendert werden können.
 *
 * Wird vor dem Ausblenden des Splashscreens aufgerufen. Ohne diese Sperre ist
 * der erste sichtbare Frame beim Kaltstart derjenige, in dem Outfit und der
 * Material-Symbols-Font noch nicht anliegen: Text steht in der Fallback-Schrift
 * und Icons rendern als roher Ligatur-Text ("restaurant_menu"), was das Layout
 * kurz zerreißt. Der Splash deckt dieses Fenster ab.
 *
 * Die Fonts liegen lokal im APK (siehe scripts/sync-fonts.mjs), das Warten ist
 * darum normalerweise nur ein Frame. Es darf aber unter keinen Umständen den
 * Start blockieren - deshalb Timeout und Fehlertoleranz: im Zweifel wird der
 * Splash lieber etwas zu früh ausgeblendet als gar nicht.
 */
import { logger } from './logger';

const FAMILIES = ['1rem "Outfit"', '24px "Material Symbols Outlined"'];

const DEFAULT_TIMEOUT_MS = 2000;

export const waitForFonts = async (timeoutMs = DEFAULT_TIMEOUT_MS): Promise<void> => {
  const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
  if (!fonts) return; // Sehr alte WebViews ohne CSS Font Loading API.

  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs);
  });

  const loaded = (async () => {
    // Explizit anfordern statt nur `ready` abzuwarten: `ready` erfasst nur
    // bereits angestoßene Ladevorgänge, `load()` stößt sie sicher an.
    await Promise.all(FAMILIES.map((font) => fonts.load(font)));
    await fonts.ready;
    return 'loaded' as const;
  })();

  try {
    const outcome = await Promise.race([loaded, deadline]);
    if (outcome === 'timeout') {
      logger.warn('Splash', 'Fonts nicht rechtzeitig geladen - blende Splash trotzdem aus');
    }
  } catch (e) {
    logger.warn('Splash', 'Font-Ladefehler - blende Splash trotzdem aus', e);
  } finally {
    if (timer) clearTimeout(timer);
  }
};
