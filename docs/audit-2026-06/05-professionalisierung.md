# Professionalisierung – Betrieb, Sichtbarkeit, Compliance

> **Einordnung:** Die Punkte hier machen aus einer technisch soliden Indie-App ein
> professionell betriebenes Produkt. Es geht nicht um Code-Qualität (dafür: 01/02), sondern um
> **Sichtbarkeit** (was passiert draußen?), **Release-Sicherheit**, **Betrieb** und **Recht**.
>
> **Stufe 1 (P1–P5)** = die 20 %, die 80 % des Unterschieds machen – jeweils vollständig
> beschrieben und einzeln umsetzbar. **Stufe 2 (P6–P8)** = danach, kompakter dokumentiert.
>
> Überschneidungen: P1 konkretisiert V2, P2 konkretisiert V1 aus
> [03-verbesserungen.md](03-verbesserungen.md) – die Umsetzung steht **hier**, dort nur der Verweis.

---

# Stufe 1 – Sofort lohnend

## P1 – Crash-Reporting (Sentry) + Produkt-Analytics (PostHog)

### Was / Warum
Die App ist im Play Store, aber JS-Crashes, Fehlerraten und Nutzungsverhalten sind komplett
unsichtbar. `ErrorBoundary.onError` loggt nur in die Konsole ([App.tsx:243](../../App.tsx)).
Die Play Console zeigt nur Native-Crashes – bei einer Capacitor-App passiert fast alles im
WebView und bleibt damit unsichtbar. Ohne Analytics sind Produktentscheidungen
(Free-Limits? Welche Import-Quelle wird genutzt? Wo bricht das Onboarding ab?) Blindflug.

### Wie – Teil A: Sentry (Crash-Reporting)

1. **Account & Projekt:** Sentry-Account (Free-Tier reicht), Projekt-Typ "Capacitor" anlegen.
   EU-Datenregion wählen (Sentry bietet `de.sentry.io` / EU-Hosting → wichtig für P4).
2. **Installation:**
   ```bash
   npm install @sentry/capacitor @sentry/react
   ```
3. **Init in `index.tsx`** (so früh wie möglich, vor dem React-Render):
   ```ts
   import * as Sentry from "@sentry/capacitor";
   import * as SentryReact from "@sentry/react";

   Sentry.init({
     dsn: "<DSN>",
     release: "cookly@" + APP_VERSION,   // siehe Schritt 5
     environment: import.meta.env.PROD ? "production" : "development",
     tracesSampleRate: 0.1,              // Performance-Daten sparsam
     sendDefaultPii: false,              // keine IPs/PII (DSGVO, siehe P4)
   }, SentryReact.init);
   ```
4. **ErrorBoundary anbinden** ([App.tsx:243](../../App.tsx)): in `handleError`
   `Sentry.captureException(error, { extra: { componentStack: errorInfo.componentStack } })`.
   Zusätzlich in den Import-Flows (`ShareTargetPage`, `AddRecipeModal`) gefangene Fehler, die
   nur als Toast enden, mit `Sentry.captureException` melden – sonst sieht man genau die
   interessanten Fehler (Import fehlgeschlagen) nie.
5. **Release-Tagging + Source Maps:** Ohne Source Maps sind Stacktraces minifiziert wertlos.
   - `APP_VERSION` aus `package.json`/`versionName` zur Build-Zeit injizieren
     (`define: { __APP_VERSION__: JSON.stringify(...) }` in `vite.config.ts` – Achtung:
     **nur** die Version, keine Secrets; siehe K1!).
   - `@sentry/vite-plugin` einrichten (lädt Source Maps beim `npm run build` hoch;
     `SENTRY_AUTH_TOKEN` nur in CI/lokal als Env-Var, nicht committen).
   - In `scripts/version-upgrade.js`: Version auch an Sentry-Release koppeln.
6. **Alerting:** In Sentry eine Alert-Rule anlegen: "neuer Issue-Typ" + "Fehlerrate-Spike"
   → E-Mail an Owner. Sonst ist Sentry nur ein Friedhof, in den niemand schaut.
7. **Convex-Seite (optional, empfohlen):** Im Convex-Dashboard → Settings → Integrations
   Exception-Reporting auf dasselbe Sentry-Projekt konfigurieren, damit auch
   Backend-Action-Fehler (Apify/Gemini-Ausfälle) zentral landen.

### Wie – Teil B: PostHog (Produkt-Analytics)

1. **Account:** PostHog Cloud **EU** (`eu.posthog.com`) – Free-Tier reicht lange, EU-Hosting
   vereinfacht P4 erheblich.
2. **Installation:** `npm install posthog-js`; Init in `index.tsx`:
   ```ts
   import posthog from "posthog-js";
   posthog.init("<PROJECT_KEY>", {
     api_host: "https://eu.i.posthog.com",
     person_profiles: "identified_only",
     autocapture: false,        // bewusst nur explizite Events (Datenminimierung)
     capture_pageview: true,
   });
   ```
3. **Consent (Pflicht, siehe P4):** PostHog erst nach Zustimmung starten
   (`posthog.opt_out_capturing()` als Default; Opt-in-Toggle im Onboarding +
   ProfilePage-Einstellung; Zustand in `users.notificationsEnabled`-Manier als neues Feld
   oder localStorage). Ohne Consent-Mechanik kein Tracking aktivieren (TTDSG/DSGVO).
4. **User-Identifikation pseudonym:** `posthog.identify(convexUserId)` nach Login –
   **keine** E-Mail/Namen als Properties senden.
5. **Event-Plan (klein halten, dafür konsequent):**

   | Event | Properties | Wo im Code |
   |---|---|---|
   | `recipe_import_started` | `source: instagram\|facebook\|website\|photo\|manual` | `ShareTargetPage`, `AddRecipeModal` |
   | `recipe_import_succeeded` / `_failed` | `source`, `error_type` (z. B. `RATE_LIMIT`, `NO_RECIPE_CONTENT`) | dito |
   | `onboarding_completed` | – | `completeOnboarding`-Aufrufstelle |
   | `paywall_viewed` | `trigger: limit\|profil\|onboarding` | `UpgradeModal`, `SubscribePage` |
   | `checkout_started` / `purchase_completed` | `plan` | `SubscribePage` (purchase_completed serverseitig via Webhook → PostHog-Capture-API aus Convex-Action, dann stimmt es auch bei Browser-Abbrüchen) |
   | `recipe_cooked_view` | – | `RecipePage` (Proxy für Aktivierung) |

6. **Ein Dashboard bauen:** Wöchentliche Aktive, Import-Erfolgsrate nach Quelle,
   Funnel Onboarding→erster Import→Paywall→Kauf. Mehr nicht – lieber 6 gepflegte Charts
   als 60 ungenutzte.

### Definition of Done
- [ ] Absichtlich geworfener Test-Fehler in der Android-App erscheint in Sentry **mit lesbarem
  Stacktrace** (Source Maps funktionieren) und löst die Alert-Mail aus
- [ ] Convex-Action-Fehler (z. B. Apify-Timeout simulieren) erscheint in Sentry
- [ ] PostHog zeigt die Events aus dem Event-Plan; ohne Consent wird **nichts** gesendet
  (Netzwerk-Tab verifizieren)
- [ ] Datenschutzerklärung um Sentry + PostHog ergänzt (→ P4)

**Aufwand:** 1–2 Tage (Sentry ~0,5, PostHog inkl. Consent ~1).

---

## P2 – CI-Pipeline mit Secret-Scan und Release-Gate

### Was / Warum
Es gibt keine CI – nichts erzwingt, dass Lint/TypeScript/Tests vor einem Release laufen.
Der Gemini-Key im Bundle (K1) ist genau die Fehlerklasse, die ein automatischer Check im
Build verhindert hätte. Ziel: **Kein Release ohne grüne Pipeline.**

### Wie
1. **Test-Script** in `package.json` (Basis aus V1):
   ```json
   "test": "node --test utils/ components/addRecipeModal/",
   "check": "npm run lint && tsc --noEmit && npm run test"
   ```
2. **`.github/workflows/ci.yml`** – läuft bei jedem Push/PR auf `main`:
   ```yaml
   name: CI
   on: { push: { branches: [main] }, pull_request: {} }
   jobs:
     check:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with: { node-version: 22, cache: npm }
         - run: npm ci
         - run: npm run lint
         - run: npx tsc --noEmit
         - run: npm run test
         - run: npm run build
           env: { VITE_CONVEX_URL: "https://ci-placeholder.convex.cloud" }
         - name: Secret-Scan im Bundle
           run: |
             ! grep -rEl "AIza[0-9A-Za-z_-]{30,}|sk_live_|whsec_|pk_live_" dist/ \
               || (echo "::error::API-Key im Build-Output gefunden!" && exit 1)
     gitleaks:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
           with: { fetch-depth: 0 }
         - uses: gitleaks/gitleaks-action@v2   # scannt Repo-Historie auf Secrets
   ```
3. **Release-Gate:** In `scripts/version-upgrade.js` als ersten Schritt `npm run check`
   ausführen und bei Fehler abbrechen → kein versionierter Build ohne grüne Checks,
   auch lokal.
4. **Branch Protection** auf `main` aktivieren (Status-Check "CI" required) – auch als
   Solo-Dev sinnvoll: schützt vor versehentlichen Force-Pushes und erzwingt die Pipeline.
5. **Commit-Hygiene** (Bus-Faktor): ab jetzt thematische Commits mit beschreibender Message;
   den aktuell uncommitteten Stand (20+ Dateien) als sauber geschnittene Commits einchecken.

### Definition of Done
- [ ] CI läuft auf `main` und ist grün; Badge im README
- [ ] Absichtlich platzierter Fake-Key (`AIza` + 35 Zeichen) in einer TSX-Datei lässt die
  Pipeline rot werden
- [ ] `npm run release:patch` bricht bei rotem `npm run check` ab

**Aufwand:** ~0,5–1 Tag.

---

## P3 – Backups & Restore für die Convex-Datenbank

### Was / Warum
Es gibt keine dokumentierte Backup-Strategie. Eine fehlerhafte Migration, ein versehentliches
Löschen oder ein Account-Problem beim Anbieter = alle Nutzerdaten (Rezepte, Abos, Accounts)
unwiederbringlich weg. Ein Backup ohne getesteten Restore zählt dabei nicht als Backup.

### Wie
1. **Convex-Cloud-Backups aktivieren:** Convex-Dashboard → Deployment → Settings → **Backups**:
   tägliche automatische Snapshots aktivieren (im Pro-Plan periodisch konfigurierbar;
   im Free-Plan manuell möglich → dann Schritt 2 als Automatisierung).
2. **Externes Backup zusätzlich** (Schutz gegen Anbieter-/Account-Verlust, 3-2-1-Prinzip):
   GitHub-Actions-Workflow `.github/workflows/backup.yml` mit Cron (z. B. täglich 04:00):
   ```yaml
   on: { schedule: [{ cron: "0 4 * * *" }], workflow_dispatch: {} }
   jobs:
     backup:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/setup-node@v4
           with: { node-version: 22 }
         - run: npx convex export --path backup-$(date +%F).zip --include-file-storage
           env: { CONVEX_DEPLOY_KEY: ${{ secrets.CONVEX_DEPLOY_KEY }} }
         - # Upload in privaten Speicher (S3/Backblaze B2/verschlüsseltes Artifact),
           # Retention z. B. 30 Tage. NICHT als öffentliches Artifact!
   ```
   - `CONVEX_DEPLOY_KEY` (Production, read-berechtigt) als GitHub-Secret hinterlegen.
   - `--include-file-storage` ist wichtig: sonst fehlen alle Rezeptbilder aus Convex Storage.
   - **DSGVO-Hinweis:** Das Export-Zip enthält personenbezogene Daten → Speicherort mit
     Verschlüsselung + EU-Region wählen, Zugriff nur Owner; in P4-Doku als Empfänger aufnehmen.
3. **Restore einmal real durchspielen** (der entscheidende Schritt):
   - Dev-/Preview-Deployment anlegen (`npx convex dev` Projekt oder zweites Deployment)
   - `npx convex import --replace-all backup-<datum>.zip` ins Dev-Deployment
   - Stichprobe: Login-Userdaten, Rezepte inkl. Bilder, Abo-Felder vorhanden?
   - Ablauf als `docs/RESTORE.md` festhalten (5–10 Zeilen reichen: wo liegt das Backup,
     welcher Befehl, was prüfen).
4. **Retention/Datenschutz:** Alte Backups automatisch löschen (30 Tage) – auch wegen
   DSGVO-Löschpflichten: gelöschte Accounts dürfen nicht ewig in Backups weiterleben.

### Definition of Done
- [ ] Automatisches Backup läuft (Cloud-Snapshot und/oder Cron-Export, ≥ täglich)
- [ ] Restore in ein Dev-Deployment erfolgreich durchgeführt und in `docs/RESTORE.md` dokumentiert
- [ ] Backups liegen verschlüsselt/EU, Retention 30 Tage konfiguriert

**Aufwand:** ~0,5 Tag + 1 h Restore-Test.

---

## P4 – Rechtstexte & DSGVO-Compliance

### Was / Warum
Die App verarbeitet personenbezogene Daten und verkauft Abos an Verbraucher in Deutschland.
Nutzerinhalte (Rezeptfotos, geteilte Social-Media-URLs) gehen an **US-Drittdienste**:
Google Gemini, Apify, Jina AI, Pollinations, Stripe, Convex (Hosting), Google OAuth –
dazu kommen nach P1 Sentry und PostHog. Das muss transparent deklariert sein. Dies ist der
einzige Bereich des Audits mit **echtem rechtlichem Risiko** (Abmahnung, Bußgeld, Store-Takedown).

> ⚠️ **Hinweis an den umsetzenden Dev:** Texte nicht selbst "frei formulieren" – Generator
> (z. B. Dr.-Schwenke-Datenschutz-Generator, eRecht24) oder Anwalt nutzen. Der Dev-Anteil ist:
> die **technische Faktenlage liefern** (untenstehende Tabelle) und die Texte **einbauen**.

### Wie
1. **Datenfluss-Inventar erstellen/aktuell halten** (Input für den Generator/Anwalt):

   | Dienst | Daten | Zweck | Region |
   |---|---|---|---|
   | Convex | Account (E-Mail, Name), Rezepte, Nutzung | Hosting/DB | US (prüfen: EU-Deployment verfügbar?) |
   | Google Gemini | Rezeptfotos, gescrapte Texte | KI-Extraktion | US |
   | Apify | geteilte Instagram-/Facebook-URLs | Scraping | US/EU |
   | Jina AI | geteilte Website-URLs | Scraping | prüfen |
   | Pollinations | Rezepttitel (Prompt) | Bildgenerierung | prüfen |
   | Stripe | Zahlungsdaten, E-Mail | Bezahlung | US (DPF-zertifiziert) |
   | Google OAuth | Login-Identität | Auth | US |
   | Sentry (nach P1) | Crash-Daten, Geräteinfo | Stabilität | EU wählen |
   | PostHog (nach P1) | pseudonyme Nutzungsevents | Produktanalyse | EU wählen |

   Für jeden US-Dienst prüfen: Data-Privacy-Framework-Zertifizierung oder SCCs im DPA?
   (Bei Google/Stripe vorhanden; bei Apify/Jina/Pollinations DPA-Seite suchen und verlinken.)
2. **Datenschutzerklärung** erzeugen lassen und einbauen:
   - In-App erreichbar (ProfilePage → "Rechtliches") **und** auf cookly-app.com
   - Muss abdecken: obige Empfänger, KI-Verarbeitung der Nutzerinhalte, Speicherdauer,
     Betroffenenrechte, Account-Löschung (existiert ✓ – verlinken)
3. **Impressum** (§ 5 DDG): in App + Website, vom Profil aus erreichbar.
4. **AGB + Widerrufsbelehrung fürs Abo:** Bei digitalen Abos Pflicht: Widerrufsrecht +
   Checkbox-Mechanik beim Kauf ("Verzicht auf Widerruf bei sofortiger Bereitstellung")
   – Stripe Checkout kann Consent-Texte anzeigen (`consent_collection`), bei RevenueCat/IAP
   übernehmen die Stores einen Teil, AGB bleiben trotzdem nötig.
5. **Kündigungsbutton** (§ 312k BGB): Auf der **Website** muss für dort abgeschlossene Abos
   eine "Verträge hier kündigen"-Schaltfläche existieren, die ohne Login-Hürden zur Kündigung
   führt (kann auf das Stripe-Billing-Portal bzw. ein simples Formular zeigen).
6. **Consent für Analytics** (TTDSG § 25): PostHog nur nach Opt-in (siehe P1 Teil B Schritt 3);
   Sentry-Crash-Reporting lässt sich i. d. R. auf berechtigtes Interesse stützen, wenn
   `sendDefaultPii: false` – im Datenschutztext erwähnen.
7. **Play-Store-Data-Safety-Formular** mit der realen Faktenlage abgleichen (nach K1 ändern
   sich die Datenflüsse: Gemini nur noch serverseitig). Beim iOS-Port: App-Privacy-Labels
   aus derselben Tabelle ableiten (→ [04-ios-port-guide.md](04-ios-port-guide.md) Phase 5).

### Definition of Done
- [ ] Datenschutzerklärung, Impressum, AGB/Widerruf in App + Website verlinkt und inhaltlich
  auf dem Stand der Datenfluss-Tabelle
- [ ] Kündigungsbutton auf der Website erreichbar
- [ ] Analytics läuft nur nach Opt-in; Play-Data-Safety aktualisiert
- [ ] Datenfluss-Tabelle als `docs/DATENFLUESSE.md` gepflegt (bei jedem neuen Dienst erweitern!)

**Aufwand:** Dev-Anteil ~1 Tag (Einbau, Consent, Inventar); Texte extern/Generator.

---

## P5 – Support-Kanal & Store-Präsenz

### Was / Warum
Zahlende Kunden haben aktuell keinen definierten Weg, Hilfe zu bekommen; Play-Store-Reviews
bleiben unbeantwortet. Das kostet Bewertungssterne und damit direkt Conversion – und ist der
nach außen sichtbarste Unterschied zwischen "Hobby" und "Produkt".

### Wie
1. **Support-Adresse:** `support@cookly-app.com` einrichten (Weiterleitung aufs persönliche
   Postfach reicht). Ziel-Antwortzeit definieren (z. B. 48 h werktags) – auch nur für sich selbst.
2. **In-App-Eintrag "Hilfe & Feedback"** in [ProfilePage](../../pages/ProfilePage.tsx):
   - `mailto:`-Link, der Kontext vorausfüllt (App-Version aus Build-Konstante, Plattform via
     `Capacitor.getPlatform()`, User-ID gekürzt) – spart bei jedem Ticket eine Rückfrage:
     ```
     mailto:support@cookly-app.com?subject=Cookly%20Support&body=---%0AVersion:%201.4.8%20(android)%0AUser:%20k57...%0A---%0A
     ```
   - Den bestehenden `HowItWorksModal` als FAQ-Basis verlinken; um die 3 häufigsten
     Problemfälle ergänzen ("Import findet kein Rezept", "Abo wird nicht erkannt" → Restore,
     "Bild wird nicht angezeigt").
3. **Play-Console-Routine** (15 min/Woche, Kalender-Reminder):
   - Neue Reviews beantworten (insb. 1–3-Sterne, sachlich + Lösung anbieten)
   - Android Vitals checken (ANR-/Crash-Rate – ab P1 mit Sentry gegenprüfen)
4. **Store-Listing aktuell halten:** Screenshots der aktuellen Version, Beschreibung
   (liegt in `docs/play-store-description.md`) mit Feature-Stand abgleichen; CHANGELOG-Pflege
   (siehe V7) liefert die "Was ist neu"-Texte gleich mit.

### Definition of Done
- [ ] Support-Mail erreichbar, Test-Mail aus der App kommt mit Versionsinfo an
- [ ] "Hilfe & Feedback" + Rechtliches-Links in der ProfilePage sichtbar
- [ ] Alle offenen Play-Reviews der letzten 6 Monate beantwortet; wöchentliche Routine im Kalender

**Aufwand:** ~0,5 Tag einmalig + ~15 min/Woche laufend.

---

# Stufe 2 – Danach (kompakt)

## P6 – Release-Prozess: Staged Rollouts + Checkliste

- **Staged Rollout im Play Store nutzen:** Jedes Release zuerst an 10 % ausrollen, nach
  24–48 h ohne Sentry-Auffälligkeiten auf 50 % → 100 % erhöhen (Play Console →
  Production → Staged Rollout). Kostet nichts, fängt kaputte Releases ab.
- **Halt-Kriterium definieren:** Crash-free-Rate (Sentry) < 99 % oder neuer Top-Issue
  → Rollout pausieren ("Halt rollout"-Button), Fix nachschieben.
- **Release-Checkliste** als `docs/RELEASE.md`: `npm run check` grün → CHANGELOG gepflegt →
  `npm run release:patch` → `npm run build:android` → AAB signieren/hochladen → 10 %-Rollout →
  Sentry beobachten → 100 %. (Mit V1/P2-Gate ist die Hälfte davon automatisiert.)

**Aufwand:** ~2 h Doku + Prozessdisziplin. **DoD:** Nächstes Release läuft nachweislich über
die Checkliste mit gestuftem Rollout.

## P7 – Automatische Dependency-Updates (Renovate)

- `renovate.json` ins Repo (Mend Renovate als GitHub-App aktivieren, kostenlos):
  ```json
  {
    "extends": ["config:recommended", ":semanticCommitsDisabled"],
    "schedule": ["before 6am on monday"],
    "packageRules": [
      { "groupName": "Capacitor", "matchPackagePatterns": ["^@capacitor", "capacitor-"] },
      { "matchUpdateTypes": ["patch"], "matchDepTypes": ["devDependencies"], "automerge": true }
    ]
  }
  ```
- Capacitor-Pakete als Gruppe updaten (Plugins müssen zur Core-Major passen – genau das
  Problem von `@supernotes/capacitor-send-intent@7` auf Capacitor 8, siehe iOS-Guide Phase 2.2:
  **diesen Mismatch unabhängig von Renovate sofort auflösen**).
- Voraussetzung sinnvoll: P2 (CI), damit Update-PRs automatisch getestet werden.

**Aufwand:** ~2 h. **DoD:** Erster Renovate-PR durchgelaufen und gemerged; Send-Intent-Plugin
passt zur Capacitor-Major-Version.

## P8 – Ausblick: Barrierefreiheit & Internationalisierung

**Barrierefreiheit** (relevant: European Accessibility Act gilt seit Juni 2025 für
Verbraucher-Apps mit Bezahlfunktion; Bestands-Apps haben Übergangsfristen – Risiko aktuell
gering, aber neue Features sollten es richtig machen):
- Quick Wins: `aria-label` auf alle Icon-only-Buttons (AppNav, Modal-Close, Favoriten-Herz),
  Kontrast der Primärfarbe auf Weiß prüfen (WCAG AA ≥ 4,5:1), App mit Android-Schriftgröße
  „größt" testen (keine abgeschnittenen Texte), TalkBack-Smoke-Test der Kernflows.
- Als Definition-of-Done-Punkt in künftige Feature-Arbeit aufnehmen statt als Big-Bang-Projekt.

**i18n** (nur vorbereiten, nicht umsetzen):
- Ab sofort keine neuen hartcodierten UI-Strings in Komponenten – zentrale `strings.ts` als
  Minimal-Lösung, bis echtes i18n (z. B. `react-i18next`) gebraucht wird.
- Strukturelles Problem für später notieren: Deutsch steckt im **Datenmodell**
  (`difficulty: "Einfach"|"Mittel"|"Schwer"` in `convex/schema.ts`, deutsche Kategorien in
  `convex/constants.ts`, deutschsprachige Gemini-Prompts). Eine Lokalisierung erfordert
  kanonische Keys im Schema (`easy|medium|hard`) + Migration – das ist eine bewusste,
  größere Entscheidung und lohnt erst mit konkretem Expansionsplan.

**Aufwand:** Quick Wins ~1 Tag; Rest = Backlog mit bewusster Entscheidung.

---

## Empfohlene Reihenfolge (Stufe 1)

```
1. P2  CI + Secret-Scan        (Sicherheitsnetz für alles Weitere, ½–1 Tag)
2. P3  Backups + Restore-Test  (Existenzversicherung, ½ Tag)
3. P1  Sentry + PostHog        (Sichtbarkeit, 1–2 Tage; Consent vorbereiten)
4. P4  Rechtstexte             (parallel anstoßen – externe Texte brauchen Vorlauf)
5. P5  Support + Store-Routine (½ Tag + laufend)
```

Gesamt Stufe 1: **~4–5 Entwicklertage** + externe Rechtstexte. Danach ist der Abstand zu einer
"richtig professionellen" App im Wesentlichen nur noch Team-Größe – nicht mehr Substanz.
