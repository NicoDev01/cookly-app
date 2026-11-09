/**
 * Build-Guard für den Android-Release-Build (läuft in `npm run build:android`).
 *
 * Ohne die Billing-Flags baut Vite fehlerfrei, die Paywall zeigt dann aber
 * "In-App-Kauf ist in dieser App-Version noch nicht verfügbar" (so in 1.4.20 live).
 * Gegenstück zu scripts/check-ios-env.mjs.
 */
import { loadEnv } from 'vite';
import { resolveNativeBilling } from '../services/nativeBillingConfig.ts';

const env = loadEnv('production', process.cwd(), '');
const errors = [];

if (!env.VITE_CONVEX_URL) errors.push('VITE_CONVEX_URL fehlt - die App startet ohne nicht.');

const billing = resolveNativeBilling('android', env);
if (!billing.enabled) {
  errors.push('In-App-Kauf ist aus: VITE_NATIVE_BILLING_ENABLED=true und VITE_REVENUECAT_GOOGLE_API_KEY setzen.');
} else if (!billing.apiKey.startsWith('goog_')) {
  errors.push('VITE_REVENUECAT_GOOGLE_API_KEY ist kein Google-SDK-Key von RevenueCat (erwartet: goog_...).');
}

if (errors.length) {
  console.error(`\nandroid-env:check fehlgeschlagen (.env.production):\n  ${errors.join('\n  ')}\n`);
  process.exit(1);
}
console.log('android-env:check ok');
