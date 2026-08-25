# iOS-Port – Schritt-für-Schritt-Guide

> Ersetzt das veraltete `docs/IOS_GUIDE.md` (das noch Clerk referenzierte – Auth läuft heute
> über `@convex-dev/auth`). Stand: Juni 2026, Capacitor 8, App-Version 1.4.8.
>
> **VERALTET (25.08.2026):** K1 und K2 sind inzwischen umgesetzt, RevenueCat ist integriert.
> Aktive Arbeitsgrundlage: [../IOS_PORT_2026-08.md](../IOS_PORT_2026-08.md).
>
> **Grundsatz:** Der React/Vite-Code läuft auf iOS unverändert. Der Aufwand steckt in
> (1) Payments, (2) Share Extension, (3) nativer Konfiguration und (4) App-Store-Review.

## Voraussetzungen (Blocker zuerst klären)

| # | Voraussetzung | Details |
|---|---|---|
| 1 | **macOS-Gerät** | Xcode läuft nur auf macOS. Optionen: Mac mini (gebraucht ~400–600 €), Cloud-Mac (MacStadium, Scaleway), oder geliehener Mac. GitHub-Actions-macOS-Runner reichen für CI-Builds, **nicht** für die tägliche Entwicklung/Debugging. |
| 2 | **Apple Developer Program** | 99 €/Jahr, Anmeldung dauert 1–2 Tage (Identitätsprüfung). Früh starten. |
| 3 | **K2 aus 01-kritische-fixes.md umgesetzt** | Ohne In-App-Purchase (RevenueCat/StoreKit) wird die App wegen des Stripe-Checkouts für digitale Abos im Review abgelehnt (Guideline 3.1.1). **Das ist der harte Blocker.** |
| 4 | **K1 umgesetzt** | Der Gemini-Key im Bundle wäre auch im iOS-Bundle; Apple-Review findet so etwas zwar selten, aber das Sicherheitsproblem bleibt. |

## Phase 1 – Plattform hinzufügen (½ Tag, auf dem Mac)

```bash
npm install @capacitor/ios
npx cap add ios
npx cap sync ios
npx cap open ios        # öffnet Xcode
```

1. In Xcode unter *Signing & Capabilities*: Team auswählen, Bundle Identifier
   `com.cookly.recipe` (muss mit `appId` in `capacitor.config.ts` übereinstimmen).
2. CocoaPods wird von Capacitor 8 automatisch verwaltet (`pod install` läuft bei `cap sync`).
3. Icons & Splash generieren: Quellen liegen schon im Repo (`assets/`, `capacitor-assets.json`):
   ```bash
   npx @capacitor/assets generate --ios
   ```
4. Erster Start im Simulator: `npx cap run ios`. Erwartung: App lädt, Login-Screen erscheint.

## Phase 2 – Native Konfiguration (1–2 Tage)

### 2.1 OAuth-Deep-Link (Google Login)
Android nutzt das Custom-Scheme `com.cookly.recipe://auth-callback`
(AndroidManifest Intent-Filter + `services/deepLinkHandler.ts` + `convex/auth.ts`-Redirect-Callback).
Auf iOS:
1. In Xcode: *Info* → *URL Types* → neues Scheme `com.cookly.recipe` registrieren
   (oder in `ios/App/App/Info.plist` den `CFBundleURLTypes`-Eintrag direkt anlegen).
2. `services/deepLinkHandler.ts` funktioniert unverändert (Capacitor `appUrlOpen`-Event ist
   plattformübergreifend).
3. Der `redirect`-Callback in `convex/auth.ts:8-17` erlaubt das Scheme bereits → keine
   Backend-Änderung nötig.
4. Testen: Google-Login auf echtem Gerät (Simulator kann OAuth-Browser-Flows, aber Test auf
   Hardware ist Pflicht vor dem Release).

### 2.2 Capacitor-Plugins prüfen
| Plugin | iOS-Status | To-do |
|---|---|---|
| `@capacitor/app`, `browser`, `camera`, `filesystem`, `haptics`, `splash-screen`, `local-notifications` | ✅ offiziell, iOS-Support vorhanden | Permissions-Texte in `Info.plist` ergänzen: `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, `NSPhotoLibraryAddUsageDescription` (deutsche, konkrete Begründungen – Apple lehnt generische Texte ab) |
| `capacitor-lottie-splash-screen` | iOS wird unterstützt | iOS-Konfig im Plugin-README prüfen; Fallback: nativer Splash via `@capacitor/splash-screen` reicht zur Not |
| `@supernotes/capacitor-send-intent` | ⚠️ **Kritisch prüfen** | Version ^7.0.0 bei Capacitor 8 (Major-Mismatch). Für iOS siehe Phase 3 – ggf. Plugin-Wechsel auf `capacitor-send-intent` (Original von C. Klaffke, dokumentierter iOS-Share-Extension-Support) |
| `@capacitor/local-notifications` | ✅ | iOS fragt Permission zur Laufzeit ab – Flow in `utils/notifications.ts` auf iOS testen (`createNotificationChannel` ist Android-only und muss ge-guarded sein/bleiben) |

### 2.3 WebView-/Layout-Anpassungen
1. **Safe Areas:** iPhone-Notch/Home-Indicator. Prüfen, ob `TabsLayout`/`AppNav` und Modals
   `env(safe-area-inset-top/bottom)` berücksichtigen; `viewport-fit=cover` im
   `<meta name="viewport">` von `index.html` ergänzen, sonst greifen die env()-Werte nicht.
2. **Tastatur:** iOS-WebView scrollt anders als Android. Formulare testen (SignIn/SignUp,
   ManualRecipeForm, Shopping-Eingabe). Bei Problemen `@capacitor/keyboard` ergänzen.
3. **Back-Gesten:** `useBackButton`/`backButtonHandler.ts` sind Android-spezifisch
   (Hardware-Back). iOS nutzt Swipe-Back – prüfen, dass die Modal-Logik (`ModalContext`)
   nicht vom Android-Back-Event abhängt, um Modals zu schließen (Schließen-Buttons existieren ✓).
4. **`capacitor.config.ts`:** `server.hostname: 'cookly-app.com'` + `androidScheme: 'https'`
   gilt für iOS analog (`iosScheme` Default ist bereits `capacitor://` bzw. ab Cap 6 `https`);
   `allowNavigation`-Liste wirkt plattformübergreifend → unverändert lassen, auf iOS testen
   (Convex-WebSocket, Google-OAuth-Domains).

## Phase 3 – Share Extension (Kern-Feature! 2–4 Tage)

**Das wichtigste Feature der App** („Instagram-Post → Teilen → Cookly") funktioniert auf iOS
fundamental anders als auf Android:

- Android: Intent-Filter im Manifest (`ACTION_SEND`) → `SendIntent.checkSendIntentReceived()`
  in `App.tsx:156ff`.
- iOS: Es braucht ein **separates Share-Extension-Target** in Xcode (eigener Prozess, eigenes
  Provisioning Profile), das die geteilte URL über eine App Group an die Haupt-App übergibt.

### Umsetzung
1. Plugin-Entscheidung: Das Original-Plugin `capacitor-send-intent` (carsten-klaffke)
   dokumentiert den iOS-Weg inkl. Share-Extension-Code. Prüfen, ob der `@supernotes`-Fork
   iOS unterstützt; sonst auf das Original wechseln (API ist nahezu identisch –
   `SendIntent.checkSendIntentReceived()` bleibt).
2. In Xcode: *File → New → Target → Share Extension* (z. B. `CooklyShare`).
   - `NSExtensionActivationRule`: auf URLs + Text beschränken
     (`NSExtensionActivationSupportsWebURLWithMaxCount: 1`,
     `…SupportsText: true`) – damit erscheint Cookly im Share-Sheet von Instagram/Safari.
3. App Group anlegen (`group.com.cookly.recipe`) und in **beiden** Targets aktivieren –
   die Extension schreibt die geteilten Daten dorthin, die Haupt-App liest sie beim Öffnen
   (das Plugin übernimmt das, wenn nach dessen iOS-Anleitung eingerichtet).
4. Der bestehende Flow in `App.tsx` (`checkIntent` bei Cold Start + `appStateChange`-Resume)
   und `pages/ShareTargetPage.tsx` funktioniert danach unverändert.
5. **Testen mit echten Apps:** Instagram-Post, Instagram-Reel, Facebook-Post, Safari-Webseite
   → jeweils teilen → Import muss durchlaufen. (Instagram teilt auf iOS die URL, kein Text –
   gleicher Pfad wie Android.)

## Phase 4 – Payments (siehe K2; hier nur iOS-Spezifika)

1. Abos in **App Store Connect** anlegen (gleiche Produkt-IDs wie in RevenueCat konfiguriert),
   Preisstufen 2,99 €/Monat, 24,99 €/Jahr; Steuer-/Bankdaten im Account hinterlegen (dauert!).
2. RevenueCat-iOS-API-Key in die App-Konfiguration; Sandbox-Tester in App Store Connect anlegen.
3. **Pflicht-UI für Apple:** Links zu Privacy Policy + Terms (EULA) auf der Paywall,
   "Abo verwalten"-Link (`https://apps.apple.com/account/subscriptions`),
   Restore-Purchases-Button. Ohne Restore-Button → garantierte Ablehnung.
4. `pages/SubscribePage.tsx`: Plattform-Branch (nativ → RevenueCat, Web → Stripe) aus K2
   greift hier; `createPortalSession`/`cancelSubscription` (Stripe) dürfen auf iOS **nicht**
   angeboten werden, wenn das Abo aus dem App Store stammt (→ `billingProvider`-Feld aus K2).

## Phase 5 – Build, TestFlight, Review (1 Woche Kalenderzeit einplanen)

1. **Versionierung:** `scripts/version-upgrade.js` erweitert aktuell nur
   `android/app/build.gradle` (versionCode/versionName) → um iOS ergänzen
   (`ios/App/App.xcodeproj`: `MARKETING_VERSION`, `CURRENT_PROJECT_VERSION` – via
   `agvtool` oder direkte pbxproj-Ersetzung).
2. Archive in Xcode (*Product → Archive*) → Upload zu App Store Connect → **TestFlight**
   intern testen (eigenes iPhone), dann externe Tester (optional, braucht Beta-Review).
3. **App-Review-Checkliste** (häufigste Ablehnungsgründe vorab abräumen):
   - [ ] Demo-Account für das Review-Team hinterlegen (E-Mail+Passwort-Login existiert ✓)
   - [ ] Account-Löschung in der App (existiert: `deleteCurrentUser` + ProfilePage ✓)
   - [ ] Privacy Policy URL + App-Privacy-Labels ausfüllen (Datenflüsse: Convex/US?,
         Gemini, Apify, Stripe/RevenueCat – Datenverarbeitung ehrlich deklarieren)
   - [ ] In-App-Purchase korrekt (Phase 4), keine externen Payment-Links im iOS-Build
   - [ ] Kamera-/Foto-Permission-Texte konkret formuliert
   - [ ] Kein "Beta"-Wording, keine toten Links, Splash/Icons in allen Größen
4. **CI (optional, empfohlen):** GitHub Actions `macos-latest`-Runner mit
   Fastlane (`match` für Zertifikate, `gym` für Build, `pilot` für TestFlight-Upload) –
   lohnt ab dem zweiten Release.

## Aufwandsschätzung gesamt

| Block | Aufwand |
|---|---|
| Phase 1–2 (Setup + native Konfig) | 2–3 Tage |
| Phase 3 (Share Extension) | 2–4 Tage |
| Phase 4 (Payments, setzt K2 voraus) | in K2 enthalten + 1–2 Tage iOS-Spezifika |
| Phase 5 (TestFlight + Review-Schleifen) | 3–5 Tage, davon viel Wartezeit |
| **Gesamt (Kalenderzeit, realistisch)** | **3–4 Wochen** neben K1/K2 |

## Risiken / Stolpersteine

1. **Share-Extension + Capacitor** ist der fummeligste Teil – früh prototypen, nicht ans Ende schieben.
2. **Plugin-Versions-Mismatch** (`@supernotes/capacitor-send-intent@7` vs. Capacitor 8) kann
   schon auf Android subtile Bugs verursachen – beim Plugin-Wechsel beide Plattformen testen.
3. **Apple-Review-Dauer:** Erstes Review einer neuen App dauert oft 1–3 Tage pro Runde;
   mit 1–2 Ablehnungsrunden rechnen (meist Privacy-Labels oder IAP-Details).
4. **Convex Auth im iOS-WebView:** Cookie-/Storage-Verhalten von WKWebView unterscheidet sich
   von Android. Login-Persistenz (App-Neustart → noch eingeloggt?) explizit testen.
