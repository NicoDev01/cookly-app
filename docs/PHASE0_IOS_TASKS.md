# Phase 0 — iOS-Vorarbeiten (Arbeitsauftrag)

> **Für den umsetzenden Agenten.** Kontext und Begründungen stehen in
> `docs/IOS_PORT_2026-08.md` (Lücken L1–L11) — dieses Dokument ist die Arbeitsanweisung.
> Alle Tasks laufen **auf Windows ohne Xcode**. Nach Abschluss wird gepusht und auf dem Mac
> mit `npx cap add ios` weitergearbeitet.

## Grundregeln

1. **Scope-Grenze:** Nur die 10 Tasks unten. Keine Xcode-Dateien, kein `ios/`-Verzeichnis,
   kein RevenueCat-Setup, keine Rechtstexte (die liegen im Repo `NicoDev01/cookly-website`).
2. **Keine Verhaltensänderung auf Android.** Jeder Task muss so gebaut sein, dass der
   Android-Build sich exakt wie vorher verhält. Das ist das wichtigste Abnahmekriterium.
3. **CLAUDE.md beachten** — insbesondere das Convex-Subscription-Budget. Keiner dieser Tasks
   fügt Queries hinzu; falls doch, ist etwas falsch verstanden.
4. **Bestehende Muster nutzen:** `logger` statt `console.*`, `Capacitor.getPlatform()` statt
   User-Agent-Sniffing, vorhandene Tailwind-Tokens statt neuer Farben.
5. **Verifikation nach jedem Task:** `npx tsc --noEmit`. Am Ende zusätzlich
   `npm run build:check`, `npm test`, `npm run lint`.

---

## Task 1 — `viewport-fit=cover` (L1)

**Datei:** `index.html:32`

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```

**Warum:** Ohne dieses Attribut liefert iOS für alle `env(safe-area-inset-*)` den Wert `0px`.
Die Safe-Area-Variablen in `index.css:320-323` wären damit wirkungslos.

**Abnahme:** Attribut vorhanden. Android-Layout unverändert (Android ignoriert `viewport-fit`
weitgehend, die `env()`-Werte dort sind ohnehin 0 außer bei Displayausschnitten).

---

## Task 2 — iOS-Branch in `services/billing.ts` (L2a)

**Datei:** `services/billing.ts:12-13`

Aktuell:
```ts
const android = Capacitor.getPlatform() === "android";
const nativeEnabled = android && import.meta.env.VITE_NATIVE_BILLING_ENABLED === "true"
  && !!import.meta.env.VITE_REVENUECAT_GOOGLE_API_KEY;
```

**Ziel:** Plattformabhängige Auswahl von Flag und API-Key, getrennt schaltbar.

- Android: `VITE_NATIVE_BILLING_ENABLED` + `VITE_REVENUECAT_GOOGLE_API_KEY`
- iOS: `VITE_NATIVE_BILLING_IOS_ENABLED` + `VITE_REVENUECAT_APPLE_API_KEY`

Der ermittelte Key muss auch in `Purchases.configure({ apiKey })` (Zeile 19) verwendet werden —
dort steht der Google-Key aktuell hart drin. Leite beides aus **einer** Quelle ab, damit
Flag und Key nicht auseinanderlaufen können, z. B. ein `nativeBillingConfig`-Objekt mit
`{ enabled, apiKey }`.

**Wichtig:** `nativeEnabled` wird auf Modulebene zur Import-Zeit ausgewertet. Wenn du dafür
Tests schreiben willst, muss die Logik in eine exportierte, parametrisierbare Funktion
(z. B. `resolveNativeBilling(platform, env)`), die auf Modulebene einmal aufgerufen wird.
Das ist die bevorzugte Lösung — dann ist Task 2 unit-testbar.

**Abnahme:**
- Auf Android mit gesetzten Flags: Verhalten identisch zu vorher.
- Auf Android ohne Flags (heutiger Zustand): `nativeEnabled === false`, tote Paywall wie bisher.
- Auf iOS mit gesetzten iOS-Flags: `nativeEnabled === true`, Apple-Key wird an `configure` gereicht.
- Kein Pfad, in dem auf einer nativen Plattform der Stripe-Checkout ausgelöst wird.
- Unit-Test für `resolveNativeBilling` in `services/billing.test.mjs` (Muster:
  `utils/*.test.mjs`, läuft über `npm test` — Test-Glob in `package.json` ggf. erweitern).

---

## Task 3 — Payment-Hinweise plattformabhängig machen (L2b)

**Das ist der einzige echte Guideline-3.1.1-Ablehnungsgrund im Code.** Auf nativen
Plattformen darf keine externe Zahlungsmethode benannt werden — das gilt für Apple *und*
für Google Play.

Lege einen zentralen Helper an (z. B. in `services/billing.ts` exportiert oder
`utils/paymentBranding.ts`), damit die Regel an einer Stelle steht:

```ts
export const showsExternalPaymentBranding = !Capacitor.isNativePlatform();
```

Dann diese vier Stellen:

| Datei | Zeile | Aktuell | Nativ soll zeigen |
|---|---|---|---|
| `components/UpgradeModal.tsx` | 112 | "Sichere Zahlung via Stripe" | "Sichere Zahlung" |
| `pages/SubscribePage.tsx` | 320-324 | Icon-Block "PayPal" | Block ausblenden |
| `pages/SubscribePage.tsx` | 325-329 | Icon-Block "Google Pay" | Block ausblenden |
| `pages/ProfilePage.tsx` | 356 | "ein Stripe-Abo endet sofort" | "ein laufendes Abo endet sofort" |

**KORREKTUR (Prüfung 25.08.2026):** `SubscribePage.tsx:315` und `:336` waren in der ersten
Fassung dieses Auftrags als "bereits korrekt gebrancht" markiert. Das war falsch.
`nativeBillingUnavailable = provider === "store" && !available` bedeutet *"nativ UND Billing
nicht verfügbar"*, nicht *"nativ"*. Sobald Phase 4 die Flags setzt, wird `available === true`
und beide Stellen zeigen auf iOS wieder "Stripe" bzw. "Sichere Zahlung über Stripe" —
ein 3.1.1-Verstoß, der genau im Release auftritt. Beide Stellen wurden bei der Abnahme auf
`showsExternalPaymentBranding` umgestellt. `nativeBillingUnavailable` bleibt für die
Button-Zustände (Zeilen 226, 274, 290) richtig und unverändert.

**Hinweis zu ProfilePage:356:** Der Folgesatz ("Abos über Google Play oder den App Store
musst du zusätzlich dort verwalten") bleibt unverändert und ist auf allen Plattformen richtig.

**Abnahme:** Im Web-Build erscheinen alle Payment-Hinweise unverändert. Im nativen Build
(simulierbar über einen Unit-Test des Helpers) taucht weder "Stripe" noch "PayPal" noch
"Google Pay" als Zahlungsmethode auf. `grep -rn "Stripe\|PayPal\|Google Pay" pages components`
darf danach nur noch gebranchte oder store-neutrale Treffer zeigen.

---

## Task 4 — `StatusBar.setBackgroundColor` auf Android einschränken (L8)

**Dateien:** `pages/WelcomePage.tsx:31-37`, `pages/SignInPage.tsx:32-36`

`setBackgroundColor` existiert auf iOS nicht und wirft dort "not implemented". Die Aufrufe
stehen hinter `Capacitor.isNativePlatform()` und sind mit `void` abgesetzt — die Rejection
fliegt also ungefangen und landet später als Rauschen in Sentry.

- `setBackgroundColor` (inkl. dem Cleanup-Aufruf in `WelcomePage.tsx:36`) nur bei
  `Capacitor.getPlatform() === "android"` ausführen.
- `setStyle` bleibt auf allen nativen Plattformen — funktioniert dort.

**Abnahme:** Android-Verhalten identisch. Kein `setBackgroundColor`-Aufruf mehr auf einem
Pfad, der auf iOS erreichbar ist.

---

## Task 5 — `ios`-Sektion in `capacitor.config.ts` (L6)

**Datei:** `capacitor.config.ts`

Ergänze analog zum bestehenden `android`-Block:

```ts
ios: {
  contentInset: 'always',
},
```

**Zusätzlich zu entscheiden und zu dokumentieren — nicht blind setzen:** `server.iosScheme`.
Default ist `capacitor`, wodurch die App unter `capacitor://cookly-app.com` läuft, also unter
einem anderen Origin als Android (`https://cookly-app.com`). Das betrifft localStorage und
damit die Login-Persistenz.

**Vorgabe:** `iosScheme: 'https'` setzen, damit beide Plattformen denselben Origin haben.
Kommentiere im Code, warum (ein Satz), und vermerke im PR/Bericht, dass das auf dem Mac
gegen den echten Convex-Login getestet werden muss.

**Abnahme:** `npx tsc --noEmit` grün (die Config ist typisiert), `android`-Block unverändert.

---

## Task 6 — `scripts/version-upgrade.js` um iOS erweitern

**Datei:** `scripts/version-upgrade.js`

Das Skript pflegt heute nur `android/app/build.gradle` (`versionCode`, `versionName`).
Ergänze die iOS-Entsprechungen in `ios/App/App.xcodeproj/project.pbxproj`:
- `MARKETING_VERSION` = versionName (z. B. `1.4.21`)
- `CURRENT_PROJECT_VERSION` = versionCode (z. B. `33`)

Beide kommen im pbxproj **mehrfach** vor (Debug- und Release-Konfiguration) — alle Vorkommen
ersetzen.

**Kritisch:** Das `ios/`-Verzeichnis existiert noch nicht. Das Skript muss weiterlaufen,
wenn die Datei fehlt (Existenzprüfung, Hinweis ausgeben, nicht abbrechen) — sonst brechen
`npm run release:*` sofort. Symmetrisch für den Android-Teil defensiv bleiben.

**Abnahme:** `node scripts/version-upgrade.js build` läuft ohne `ios/` fehlerfrei durch und
verändert Android wie bisher. Der iOS-Zweig ist vorhanden, aber inaktiv.

---

## Task 7 — `build:ios`-Skript und `scripts/sync-ios.js`

**Dateien:** `package.json`, neu `scripts/sync-ios.js`

1. `scripts/sync-ios.js` analog zu `scripts/sync-android.js` (gleiche Retry-Logik,
   `npx cap sync ios`).
2. In `package.json`:
   ```json
   "build:ios": "npm run fonts:check && vite build --mode production && node scripts/sync-ios.js",
   "cap:open:ios": "npx cap open ios",
   "cap:run:ios": "npx cap run ios"
   ```

**`--mode production` ist Pflicht** (L7): Ohne diesen Schalter liest Vite `.env.production`
nicht, und die Billing-Flags fehlen im Build — die iOS-App hätte dann exakt den heutigen
Android-Zustand, integriert aber tot.

**Abnahme:** Skripte vorhanden, `sync-ios.js` strukturell identisch zu `sync-android.js`.
`build:ios` wird **nicht** ausgeführt (schlägt ohne `ios/` erwartbar fehl).

---

## Task 8 — `@capacitor/ios` installieren

```bash
npm install @capacitor/ios
```

Version muss zur installierten Capacitor-Major passen (`@capacitor/core@^8.4.2`).

**Abnahme:** `package.json` und `package-lock.json` aktualisiert, Version `^8.x`.
`npx tsc --noEmit` grün. **Kein** `npx cap add ios` — das passiert auf dem Mac.

---

## Task 9 — `.gitignore` für iOS

**Datei:** `.gitignore`

```gitignore
# iOS (Xcode-Projekt selbst wird committed, wie android/)
ios/App/Pods/
ios/App/App/public/
ios/App/App.xcworkspace/xcuserdata/
ios/App/App.xcodeproj/xcuserdata/
*.mobileprovision
*.p12
*.p8
```

**Wichtig:** Das `ios/`-Verzeichnis selbst wird **committed**, genau wie `android/`.
`*.p8` und `*.p12` sind Signing-Schlüssel und dürfen niemals ins Repo — analog zu den
bereits ignorierten `*.keystore` und `android/gradle.properties`.

**Abnahme:** Einträge vorhanden, kein bestehender Eintrag verändert.

---

## Task 10 — Rechtslinks in der App auf die Website umbiegen (L9)

Die Zieltexte sind **live** und geprüft:
- `https://cookly-app.com/privacy`
- `https://cookly-app.com/terms`
- `https://cookly-app.com/impressum`

In der App zeigen vier Stellen auf nicht existierende In-App-Routen (`App.tsx:208-227` kennt
weder `/legal` noch `/terms` noch `/privacy`) — die Links laufen ins Leere:

| Datei | Zeile | Aktuell | Ziel |
|---|---|---|---|
| `pages/ProfilePage.tsx` | 303 | `#/legal` | `https://cookly-app.com/impressum` |
| `pages/SignInPage.tsx` | 194 / 198 | `/terms`, `/privacy` | die jeweiligen Website-URLs |
| `pages/SignUpPage.tsx` | 225 / 229 | `/terms`, `/privacy` | dito |
| `pages/WelcomePage.tsx` | 181 / 185 | `/terms`, `/privacy` | dito |

**Umsetzung:** Auf nativen Plattformen **muss** `@capacitor/browser` (`Browser.open`)
verwendet werden — ein normaler Link würde den WebView von der App wegnavigieren, und der
Nutzer käme ohne App-Neustart nicht zurück. Im Web bleibt ein regulärer Link mit
`target="_blank"` und `rel="noopener noreferrer"`.

Bau dafür **eine** wiederverwendbare Komponente oder einen Hook (z. B.
`components/ExternalLink.tsx`), statt die Fallunterscheidung viermal zu duplizieren —
`jscpd` läuft im Quality-Gate. Die URLs gehören in eine Konstante
(z. B. `utils/legalLinks.ts`), nicht viermal als Literal.

**Abnahme:** Kein toter Link mehr. Im Web öffnet sich ein neuer Tab, nativ der
System-Browser. `@capacitor/browser` ist bereits als Dependency vorhanden
(`services/billing.ts` nutzt es schon) — keine neue Abhängigkeit nötig.

---

## Abschluss-Verifikation (alle Tasks)

```bash
npm run build:check
```

```bash
npm test
```

```bash
npm run lint
```

Zusätzlich vom umsetzenden Agenten zu liefern:

1. **Grep-Nachweis Task 3:** Ausgabe von
   `grep -rn "Stripe\|PayPal\|Google Pay" pages components --include=*.tsx`
   mit einer Zeile Kommentar je Treffer, warum er unkritisch ist.
2. **Diff-Zusammenfassung** je Task mit Dateipfad und Zeilennummern.
3. **Explizite Aussage zu Android:** Welche der 10 Tasks verändern Android-Verhalten?
   (Erwartete Antwort: keiner. Falls doch, begründen.)
4. **Offene Punkte**, die auf dem Mac verifiziert werden müssen — mindestens Task 5
   (`iosScheme` und Login-Persistenz).

## Was NICHT Teil von Phase 0 ist

- `npx cap add ios`, alles unter `ios/`, Xcode-Konfiguration → Phase 1/2 auf dem Mac
- `PrivacyInfo.xcprivacy`, `Info.plist`, Purpose-Strings → Phase 2
- Share Extension → Phase 3
- RevenueCat-Konto, Store-Produkte, Env-Flags scharfschalten → Phase 4
- Datenschutzerklärung um Gemini/Apify/PostHog/Sentry/Pollinations ergänzen → Website-Repo
- Google-OAuth-Consent-Screen (Privacy-Link, `accounts.dev`) → Google Cloud Console, kein Code
