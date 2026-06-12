# P2 – Verbesserungen (Infrastruktur, Tests, UX)

> **Hinweis:** V1 (CI) und V2 (Crash-Reporting) sind in
> [05-professionalisierung.md](05-professionalisierung.md) zu vollständigen
> Umsetzungsanleitungen ausgebaut worden (P2 bzw. P1). **Bei der Umsetzung gilt Dokument 05
> als Source of Truth** – die Abschnitte hier bleiben als Kurzfassung stehen.

---

## V1 – Test-Script + CI einrichten (vor allen größeren Umbauten!)

> → **Detaillierte Umsetzung inkl. Secret-Scan und Release-Gate: [05-professionalisierung.md → P2](05-professionalisierung.md)**

### Befund
- 21 Unit-Tests existieren und sind grün (`utils/*.test.mjs`,
  `components/addRecipeModal/*.test.mjs`, Node-Test-Runner), aber:
- **kein `"test"`-Script** in `package.json` → Tests sind nicht auffindbar/dokumentiert
- **keine CI** (kein `.github/workflows/`) → nichts erzwingt tsc/Lint/Tests vor einem Release

### Umsetzung
1. `package.json` ergänzen:
   ```json
   "test": "node --test utils/ components/addRecipeModal/",
   "check": "npm run lint && tsc --noEmit && npm run test"
   ```
   (Hinweis: `node --test` mit Verzeichnis-Argumenten ab Node 20 ok; sonst Glob beibehalten.)
2. `.github/workflows/ci.yml`: bei Push/PR auf `main` → `npm ci`, `npm run lint`,
   `npx tsc --noEmit`, `npm run test`, `npm run build`. Node 22, Ubuntu-Runner reicht.
3. Optional: `npm run check` als Voraussetzung in `scripts/version-upgrade.js` einbauen,
   damit kein Release ohne grüne Checks gebaut wird.

### Definition of Done
- [ ] `npm test` läuft lokal; CI-Badge grün auf `main`
- [ ] Ein absichtlich eingebauter Fehler lässt die CI rot werden

**Aufwand:** ~2–4 Stunden.

---

## V2 – Crash-Reporting & Monitoring

> → **Detaillierte Umsetzung inkl. Source Maps, Alerting und PostHog-Analytics: [05-professionalisierung.md → P1](05-professionalisierung.md)**

### Befund
`ErrorBoundary.onError` loggt nur in die Konsole (App.tsx:243). Produktions-Crashes der
Play-Store-App sind unsichtbar (Play Console zeigt nur Native-Crashes, keine JS-Fehler).

### Umsetzung
1. Sentry mit `@sentry/capacitor` + `@sentry/react` einrichten (kostenloses Kontingent reicht).
2. Init in `index.tsx`, Anbindung an die bestehende `ErrorBoundary` (`Sentry.captureException`
   in `onError`), Release-Tagging mit `versionName` aus dem Release-Script.
3. Source Maps im Build hochladen (Vite-Plugin), sonst sind Stacktraces minifiziert nutzlos.
4. Convex-Seite: Das Convex-Dashboard zeigt Function-Logs/Fehler; für Alerting ggf.
   Log-Streams (Axiom/Datadog) konfigurieren – optional.

**Aufwand:** ~0,5–1 Tag.

---

## V3 – Checkout-Rückkehr in die App (UX)

### Befund
`pages/SubscribePage.tsx` setzt `successUrl`/`cancelUrl` auf `window.location.origin`
(= `https://cookly-app.com` im Capacitor-WebView). Der Stripe-Checkout öffnet im System-Browser
(Domain ist nicht in `allowNavigation`); nach Zahlung landet der Nutzer auf der **Website**,
nicht in der App. Das Abo wird zwar via Webhook + Convex-Reaktivität trotzdem aktiv, aber der
Nutzer muss manuell zur App zurückwechseln.

### Umsetzung
- Kurzfristig: Auf der `success_url`-Seite der Website einen "Zurück zur App"-Button mit
  Deep Link `com.cookly.recipe://payment-success` anbieten; Handler existiert bereits
  (`services/deepLinkHandler.ts` leitet unbekannte Pfade an den Router weiter – Route ergänzen).
- Sauber: Android App Links für `https://cookly-app.com/payment-success` einrichten
  (Intent-Filter mit `autoVerify` + `.well-known/assetlinks.json` auf der Domain), dann öffnet
  der Browser-Redirect direkt die App.
- **Hinweis:** Mit K2 (RevenueCat nativ) entfällt das Problem für App-Käufe ohnehin –
  V3 nur noch für den Web-Stripe-Flow relevant.

**Aufwand:** ~0,5–1 Tag.

---

## V4 – Foto-Scan-Limit vor dem KI-Aufruf prüfen

### Befund
Beim Foto-Scan wird das Free-Limit erst beim Speichern geprüft (`recipes.create`).
Ein Free-User am Limit verbraucht also erst Gemini-Kosten und bekommt **danach** den
Limit-Fehler – schlechte UX und unnötige Kosten.

### Umsetzung
Wird durch K1 miterledigt, wenn die neue `photoScan`-Action das Limit **vor** dem Gemini-Call
prüft (Schritt 1.3 in 01-kritische-fixes.md). Im Frontend zusätzlich `users.canScanPhoto`
abfragen und den Scan-Button bei erreichtem Limit direkt mit Upgrade-Hinweis blocken
(Query existiert schon, `UpgradeModal` existiert schon).

**Aufwand:** in K1 enthalten + ~2 Stunden Frontend.

---

## V5 – Free-Limits überdenken (Produkt-Entscheidung, kein Code)

`FREE_LIMITS` stehen auf je **100** manuelle Rezepte / Link-Imports / Foto-Scans
(`convex/constants.ts`). Das ist faktisch "alles gratis" – kaum jemand erreicht 100 Imports,
bevor er den Wert der App beurteilt hat. Wenn Pro sich verkaufen soll, braucht es entweder
deutlich engere Free-Limits (z. B. 10–15 Imports) oder Pro-exklusive Features
(z. B. Wochenplan, Einkaufslisten-Sortierung, KI-Bilder). → Geschäftsentscheidung des Owners;
technisch ist alles vorbereitet (Limits zentral, `UpgradeModal` vorhanden).

---

## V6 – Logging-Hygiene

### Befund
Sehr viele `console.log` in Produktionspfaden (Deep-Link-Handler, SendIntent-Checks, Convex-
Functions inkl. ImportTiming). Im Client kosten sie nichts Kritisches, erschweren aber Debugging
durch Rauschen; in Convex zählen Logs gegen das Log-Kontingent.

### Umsetzung
1. Kleinen Logger-Wrapper einführen (`utils/logger.ts`): `debug` nur wenn `import.meta.env.DEV`,
   `warn`/`error` immer.
2. ImportTiming behalten (wertvolle Telemetrie), aber per Env-Flag (`IMPORT_TIMING_VERBOSE`)
   auf Summary-only reduzierbar machen.

**Aufwand:** ~0,5 Tag.

---

## V7 – Dokumentation aktualisieren

1. `README.md`: Anleitung verlangt noch `VITE_GEMINI_API_KEY` (Zeile 68, 164) → nach K1 falsch;
   Env-Setup-Abschnitt neu schreiben (Client braucht nur `VITE_CONVEX_URL`; Server-Keys ins
   Convex-Dashboard).
2. `CHANGELOG.md`: 1.4.8-Eintrag besteht aus TODO-Platzhaltern → nachpflegen; Release-Script
   ggf. so ändern, dass es den Editor öffnet statt Platzhalter zu committen.
3. `docs/`-Ordner: `IOS_GUIDE.md` (Clerk-Bezug, veraltet) löschen → ersetzt durch
   [04-ios-port-guide.md](04-ios-port-guide.md). `CODEBASE_ANALYSIS.md` u. a. auf Aktualität
   prüfen oder mit Datum als "historisch" markieren.

**Aufwand:** ~2–3 Stunden.

---

## V8 – Diverses (gesammelt, jeweils klein)

| # | Punkt | Wo | Aktion |
|---|---|---|---|
| 1 | `getCategories = getCategoryStats`-Alias und `createFromAI = create` | `convex/recipes.ts:247,710` | Frontend auf die kanonischen Namen umstellen, Aliase entfernen |
| 2 | Doppelte Webhook-Route `/stripe-webhook` (legacy) | `convex/http.ts:108` | Prüfen, welche URL im Stripe-Dashboard hinterlegt ist; alte Route nach Umstellung entfernen |
| 3 | `getAllProUsers` nutzt `filter` ohne Index | `convex/stripeInternal.ts:28` | Bei Nutzerwachstum Index auf `subscription` ergänzen; aktuell unkritisch |
| 4 | `AuthCallbackPage` doppelter `useEffect` mit eslint-disable | `App.tsx:37ff` | Funktioniert, aber fragil bei React-StrictMode-Doppel-Invokes – bei Gelegenheit auf `useRef`-Guard + Abhängigkeiten sauber umstellen (Guard existiert teilweise) |
| 5 | Backup-Strategie Convex | – | Convex-Dashboard: regelmäßige Snapshots/Exports aktivieren bzw. `npx convex export` als Cron (lokal/CI) einrichten – aktuell gibt es kein dokumentiertes Backup |
| 6 | Play-Console-Daten | – | Data-Safety-Formular nach K1/K2-Umbau aktualisieren (Datenflüsse ändern sich: Gemini-Calls nur noch serverseitig) |
