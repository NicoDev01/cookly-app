/**
 * Build-Guard für den iOS-Release-Build (läuft in `npm run build:ios`).
 *
 * Fehlen die Billing-Flags in der Mac-`.env.production`, baut Vite trotzdem
 * fehlerfrei: App startet, Paywall ist da, nur kaufen kann niemand
 * (docs/IOS_PORT_2026-08.md, L7). Dieser Check macht das zu einem harten Fehler.
 * Er liest die Env genau so wie `vite build --mode production`.
 */
import { loadEnv } from 'vite';
import { resolveNativeBilling } from '../services/nativeBillingConfig.ts';

const env = loadEnv('production', process.cwd(), '');
const errors = [];
const warnings = [];

if (!env.VITE_CONVEX_URL) errors.push('VITE_CONVEX_URL fehlt - die App startet ohne nicht.');

const billing = resolveNativeBilling('ios', env);
if (!billing.enabled) {
  errors.push('In-App-Kauf ist aus: VITE_NATIVE_BILLING_IOS_ENABLED=true und VITE_REVENUECAT_APPLE_API_KEY setzen.');
} else if (!billing.apiKey.startsWith('appl_')) {
  errors.push('VITE_REVENUECAT_APPLE_API_KEY ist kein Apple-SDK-Key von RevenueCat (erwartet: appl_...).');
}

if (!env.VITE_SENTRY_DSN) warnings.push('VITE_SENTRY_DSN fehlt - Fehler aus der App kommen nicht in Sentry an.');
if (!process.env.SENTRY_AUTH_TOKEN) warnings.push('SENTRY_AUTH_TOKEN fehlt - Sourcemaps werden nicht hochgeladen, Stacktraces bleiben unlesbar.');
if (!env.VITE_POSTHOG_KEY) warnings.push('VITE_POSTHOG_KEY fehlt - keine Produktanalyse für diesen Build.');

for (const w of warnings) console.warn(`ios-env:check Warnung: ${w}`);
if (errors.length) {
  console.error(`\nios-env:check fehlgeschlagen (.env.production):\n  ${errors.join('\n  ')}\n`);
  process.exit(1);
}
console.log('ios-env:check ok');
