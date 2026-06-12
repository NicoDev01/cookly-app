# Cookly – Technisches Audit & Maßnahmenplan (Juni 2026)

> **Zweck:** Dieses Dokument ist die Übergabe-Doku für Entwickler. Jede Maßnahme beschreibt
> **Wo** (Datei/Zeile), **Was** (das Problem), **Warum** (Risiko/Nutzen) und **Wie** (konkrete
> Umsetzungsschritte inkl. "Definition of Done"). Stand: 12.06.2026, App-Version 1.4.8 (versionCode 20).

## Dokument-Struktur

| Datei | Inhalt |
|---|---|
| [01-kritische-fixes.md](01-kritische-fixes.md) | **P0** – Sicherheits- und Compliance-Probleme, sofort beheben |
| [02-refactoring.md](02-refactoring.md) | **P1** – Code-Qualität, Duplikation, Performance |
| [03-verbesserungen.md](03-verbesserungen.md) | **P2** – Infrastruktur, Tests, CI, UX-Verbesserungen |
| [04-ios-port-guide.md](04-ios-port-guide.md) | Schritt-für-Schritt-Anleitung für den iOS-Port (ersetzt das veraltete `docs/IOS_GUIDE.md`) |
| [05-professionalisierung.md](05-professionalisierung.md) | Betrieb & Sichtbarkeit: Monitoring/Analytics, CI-Gate, Backups, Rechtstexte, Support, Release-Prozess |
| [06-feature-roadmap.md](06-feature-roadmap.md) | Produkt-Lücken & neue Features: TikTok-Import, Portionen-Skalierung, Kochmodus, Woche→Einkaufsliste, Text-Import, Free/Pro-Schnitt |
| [07-logik-review.md](07-logik-review.md) | **Logik-Bugs B1–B7** (u. a. defekter Bulk-Scan, SubscribePage-isPro, verlorene Einkaufsmengen) + Root Cause R10 (`strict: false`) |
| [08-ux-fehlertexte-performance.md](08-ux-fehlertexte-performance.md) | Nutzerfreundliche Fehlertexte (U1–U3), Loading/Animationen (U4–U5), Bandbreiten-/Kosten-Hebel (E1–E3), Observability-Architektur (Teil 4: Logger-Ringpuffer, Sentry-Schichtenmodell, Debug-Zugänge) |
| [09-import-performance.md](09-import-performance.md) | Import-Latenz-Analyse (O1–O4): Lambda-Cold-Start (`"use node"`), sequenzielle Apify-Calls, Roundtrips, globaler Scrape-Cache, echte Fortschrittsanzeige |
| [10-quality-gate-lint-all.md](10-quality-gate-lint-all.md) | Einordnung von `npm run lint:all`: aktuell kein Release-Gate; Fixplan für ESLint-Ignores, Low-Risk-Cleanup, Hooks-Regeln, Knip und JSCPD |

## Geprüfter Umfang (was das Audit abgedeckt hat)

- **Convex-Backend komplett:** `schema.ts`, `auth.ts`, `users.ts`, `recipes.ts`, `stripe.ts`,
  `stripeInternal.ts`, `http.ts`, `instagram.ts`, `facebook.ts`, `website.ts`, `categories.ts`,
  `shopping.ts`, `weekly.ts`, `rateLimiter.ts`, `importTiming.ts`, `pollinationsHelper.ts`
- **Frontend-Kern:** `App.tsx`, Routing, `AddRecipeModal.tsx`, `aiScanRecipe.ts`, `geminiRetry.ts`,
  `ShareTargetPage.tsx`, `SubscribePage.tsx`, Contexts, Services (Deep Links, Back Button)
- **Build & Native:** `vite.config.ts`, `capacitor.config.ts`, `AndroidManifest.xml`,
  `android/app/build.gradle`, gebaute Bundles (`dist/`, `android/.../assets/`)
- **Secrets-Hygiene:** Git-Tracking von `.env`-Dateien, Keystore, Backup-Codes geprüft
- **Tooling:** `tsc --noEmit` (✅ fehlerfrei), ESLint (❌ 89 Fehler / 13 Warnungen),
  Unit-Tests (✅ 21/21 grün via `node --test`)

## Gesamtbewertung

Die App ist für ein Indie-Projekt in einem **überdurchschnittlich reifen Zustand**:

**Stärken:**
- Saubere Multi-Tenant-Isolation: jede Query/Mutation prüft Ownership über `userId`
- Vorbildliche Stripe-Integration (Webhook-Signaturprüfung, Idempotenz-Tabelle mit Rollback,
  Doppel-Abo-Schutz, Abo-Änderungen nur via Webhook)
- Robuste Import-Pipeline mit Graceful Degradation, Retry-Logik, Candidate-Scoring,
  JSON-Schema-validierter Gemini-Ausgabe und Timing-Telemetrie
- DSGVO-konforme Account-Löschung inkl. Storage-Cleanup
- Gute Mobile-UX-Details (Back-Button, Haptics, Blurhash, Splash mit Safety-Timeout, Offline-Banner)

**Kritische Schwächen (Details in 01-kritische-fixes.md):**
1. 🔴 **Gemini-API-Key liegt im Client-Bundle** – nachweislich im ausgelieferten APK (verifiziert
   in `android/app/src/main/assets/public/assets/AddRecipeModal-*.js`)
2. 🔴 **Stripe-Checkout für digitale Abos** verstößt gegen Google-Play-Billing-Pflicht und
   blockiert den iOS-Port (Apple IAP-Zwang)
3. 🟠 **Pollinations-API-Key leakt** über generierte Bild-URLs an den Client und wird in der DB gespeichert

## Empfohlene Reihenfolge

```
Woche 1:   K1 (Gemini-Key serverseitig + Key-Rotation)  ← höchste Priorität
           B1 + B2 aus 07-logik-review (je < 1 h, defekter Bulk-Scan & Subscribe-Bug)
           K3 (Pollinations-Key), K4/K5 (Quick Wins)
Woche 2:   P2 (CI + Secret-Scan) – Sicherheitsnetz VOR den Umbauten
           P3 (Backups + Restore-Test)
           R7 (Lint-Fehler), R6 (any-Typen)
Woche 3-4: K2 (RevenueCat-Integration, löst Play-Store-Risiko + iOS-Blocker)
           R1 (Instagram/Facebook-Duplikation zusammenführen)
           P1 (Sentry + PostHog), P4 (Rechtstexte parallel anstoßen), P5 (Support)
danach:    iOS-Port nach 04-ios-port-guide.md
Features:  F2 (Portionen) + F4 (Woche→Liste) jederzeit dazwischen schiebbar;
           F1 (TikTok) + F5 (Text-Import) direkt nach R1
laufend:   R2-R5, V3-V8, P6-P8, F3/F6/F7 nach Kapazität
```

## Wichtige Architektur-Fakten für neue Entwickler

- **Stack:** React 19 + Vite 7 + Tailwind 3, Capacitor 8 (Android), Convex (DB + Backend-Functions +
  Auth via `@convex-dev/auth` mit Password + Google), Stripe (Abos), Gemini `gemini-3.1-flash-lite`
  (Rezept-Extraktion), Apify (Instagram/Facebook-Scraping), Jina Reader (Website-Scraping),
  Pollinations (KI-Bilder)
- **Env-Variablen:** Server-Keys (`GEMINI_API_KEY`, `JINA_API_KEY`, `APIFY_API_TOKEN`,
  `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `POLLINATIONS_API_KEY`) gehören **ausschließlich**
  ins Convex-Dashboard (Environment Variables), niemals in `VITE_`-Variablen oder den
  `define`-Block der Vite-Config. Der Client braucht nur `VITE_CONVEX_URL`.
- **Free-Limits:** definiert in [convex/constants.ts](../../convex/constants.ts) (`FREE_LIMITS`),
  enforced in `recipes.create`. Rate-Limiting (10 Req/min/User) in `convex/rateLimiter.ts`,
  aber nur für die Buckets `website`/`instagram`/`facebook`.
- **Build-Befehle:** `npm run build:check` (tsc + Build), `npm run build:android` (Build + cap sync),
  Releases über `npm run release:patch|minor|major`.
- **Tests:** `node --test utils/*.test.mjs components/addRecipeModal/*.test.mjs` (bis V1 umgesetzt ist).
