/**
 * iPhone-Vorschau unter Windows: startet den Vite-Dev-Server und öffnet die App
 * in WebKit (der Engine von iOS) mit iPhone-Maßen, Touch und simulierten
 * Safe Areas samt Dynamic Island.
 *
 *   npm run preview:iphone                      (iPhone 17 Pro)
 *   npm run preview:iphone -- "iPhone 17e"      (anderes Gerät aus Playwright)
 *
 * Läuft als Web-App, nicht als Capacitor-App: Teilen, Kauf, Push und
 * Sign in with Apple gibt es hier nicht. Login bleibt zwischen Starts erhalten.
 */
import { join } from 'node:path';
import { createServer } from 'vite';
import { webkit, devices } from 'playwright';

const deviceName = process.argv[2] ?? 'iPhone 17 Pro';
const device = devices[deviceName];
if (!device) {
  const names = Object.keys(devices).filter((d) => d.startsWith('iPhone') && !d.includes('landscape'));
  console.error(`Unbekanntes Gerät "${deviceName}". Verfügbar: ${names.join(', ')}`);
  process.exit(1);
}

// Insets der Pro-Modelle mit Dynamic Island im Hochformat (pt).
const SAFE_TOP = 62;
const SAFE_BOTTOM = 34;

const server = await createServer();
await server.listen();
const url = server.resolvedUrls.local[0];

const context = await webkit.launchPersistentContext(join('node_modules', '.cache', 'iphone-preview'), {
  ...device,
  // Die Capacitor-WebView ist bildschirmfüllend; Playwrights Viewport zieht Safaris Leisten ab.
  viewport: device.screen,
  headless: false,
});

await context.addInitScript(({ top, bottom }) => {
  const apply = () => {
    const style = document.createElement('style');
    style.textContent = `:root {
      --safe-area-inset-top: ${top}px !important;
      --safe-area-inset-bottom: ${bottom}px !important;
    }
    #iphone-preview-island {
      position: fixed; top: 11px; left: 50%; transform: translateX(-50%);
      width: 125px; height: 37px; border-radius: 20px; background: #000;
      z-index: 2147483647; pointer-events: none;
    }`;
    const island = document.createElement('div');
    island.id = 'iphone-preview-island';
    document.head.append(style);
    document.body.append(island);
  };
  if (document.body) apply();
  else document.addEventListener('DOMContentLoaded', apply);
}, { top: SAFE_TOP, bottom: SAFE_BOTTOM });

const page = context.pages()[0] ?? (await context.newPage());
await page.goto(url);
console.log(`${deviceName} (WebKit) zeigt ${url}. Fenster schließen zum Beenden.`);

context.on('close', () => process.exit(0));
