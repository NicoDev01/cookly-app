# iOS-Port – Umsetzungsplan (Stand 25.08.2026)

> Ersetzt `docs/audit-2026-06/04-ios-port-guide.md` als *aktive* Arbeitsgrundlage.
> Der Juni-Guide bleibt gültig in Struktur und Phasen; dieses Dokument korrigiert
> ihn dort, wo sich die Codebasis seitdem geändert hat, und ergänzt elf Punkte (L1–L11),
> die dort fehlen.

## 0. Was sich seit Juni geändert hat

| Juni-Annahme | Realität heute |
|---|---|
| **K2 (In-App-Purchase) ist der harte Blocker** | `@revenuecat/purchases-capacitor@13.2.2` ist integriert, `services/billing.ts` + `convex/billing.ts` + RevenueCat-Webhook (`convex/http.ts:296`) sind **fertig implementiert** — aber über die Env-Flags nirgends scharfgeschaltet (siehe L7). Der Blocker ist auf "iOS-Key + App-Store-Connect-Produkte + Flags setzen" geschrumpft. |
| **K1 (Gemini-Key im Bundle)** | Erledigt – kein `@google/genai`-Aufruf mehr im Client, nur noch in `convex/`. |
| Capacitor 8, App 1.4.8 | Capacitor 8.4.2, App 1.4.20+ (Unreleased: TikTok-Import). Fonts liegen lokal im Bundle → ein iOS-spezifisches Font-Problem entfällt. |
| `@capacitor/camera` in der Plugin-Tabelle | Nicht mehr installiert. Bilder kommen über `<input type="file" accept="image/*">` (`AiScan.tsx:73`, `ManualRecipeForm.tsx:225`). Purpose-Strings bleiben trotzdem Pflicht (siehe Phase 2.3). |
| Push nicht erwähnt | `@capacitor/push-notifications@8.1.2` + `components/PushLifecycle.tsx` sind da, aber per `VITE_PUSH_NOTIFICATIONS_ENABLED` **aus**. Siehe Lücke L4. |

---

## 1. Lücken, die im Juni-Guide fehlen

### L1 — `viewport-fit=cover` fehlt (Safe Areas sind auf iOS wirkungslos)
`index.css:320-323` definiert `--safe-area-inset-*` aus `env(safe-area-inset-*)`, und
`index.html:32` sagt nur `width=device-width, initial-scale=1.0`. Ohne `viewport-fit=cover`
liefert iOS für alle `env(safe-area-inset-*)` **0px**. Die komplette Safe-Area-Logik läuft
dann ins Leere: Bottom-Nav unter dem Home-Indicator, Header unter der Notch.
Ein-Zeilen-Fix, aber ohne ihn sieht jeder Screenshot falsch aus. **Auf Windows machbar.**

### L2 — `services/billing.ts` kennt iOS nicht + vier UI-Stellen nennen fremde Zahlungsmittel
Zwei getrennte Probleme, die eine frühere Fassung dieses Dokuments fälschlich zu einem
verschmolzen hatte.

**(a) Tote Paywall, keine Ablehnung.**
```ts
const android = Capacitor.getPlatform() === "android";
const nativeEnabled = android && … && !!import.meta.env.VITE_REVENUECAT_GOOGLE_API_KEY;
```
Auf iOS ist `nativeEnabled` immer `false`. Der Stripe-Checkout wird dadurch aber **nicht**
ausgelöst: `purchase()` verzweigt über `Capacitor.isNativePlatform()` (`services/billing.ts:57`),
nicht über `android` — im iOS-WebView läuft es also in `requireBillingUserId()` und wirft
`NATIVE_BILLING_NOT_CONFIGURED`. `SubscribePage.tsx:74` fängt den Fall zusätzlich über
`nativeBillingUnavailable` ab: Buttons `disabled`, Hinweis auf die Web-Version.
Das Ergebnis ist eine **funktionslose Paywall** — auf dem iPhone kann niemand Pro kaufen.
Zu beheben, weil die App sonst auf iOS keinen Umsatz macht, nicht weil ein Review daran scheitert.
Nötig: Plattform-Branch (`ios` → `VITE_REVENUECAT_APPLE_API_KEY`), plus
`VITE_NATIVE_BILLING_IOS_ENABLED` als eigenes Flag, damit Android- und iOS-Rollout
unabhängig scharfgeschaltet werden können. **Auf Windows machbar.**

**(b) Der echte Guideline-3.1.1-Hebel: ungebranchte Payment-Hinweise.**

| Stelle | Text | Status |
|---|---|---|
| `components/UpgradeModal.tsx:112` | "Sichere Zahlung via Stripe" | ungebrancht, erscheint im iOS-Build |
| `pages/SubscribePage.tsx:323` | "PayPal" | ungebrancht |
| `pages/SubscribePage.tsx:327` | "Google Pay" | ungebrancht — auf einem iPhone besonders auffällig |
| `pages/ProfilePage.tsx:356` | "ein Stripe-Abo endet sofort" | ungebrancht; Kontext Kontolöschung, geringes Risiko |
| `pages/SubscribePage.tsx:314/331` | "Stripe" / "Sichere Zahlung über Stripe" | ✅ bereits über `nativeBillingUnavailable` gebrancht |

Ein Verweis auf externe Zahlungsmittel im Upgrade-Prompt für ein digitales Abo ist genau das,
was Apple unter 3.1.1 beanstandet — und anders als (a) ist das ein realer Ablehnungsgrund.
Alle vier Stellen plattformabhängig machen. **Auf Windows machbar.**

### L3 — Apple Privacy Manifest (`PrivacyInfo.xcprivacy`)
Seit Frühjahr 2024 lehnt App Store Connect Uploads ohne Privacy Manifest ab, sobald
"Required Reason APIs" benutzt werden. Cookly trifft das über `UserDefaults`
(Capacitor/WebView) und über die SDKs Sentry, RevenueCat, PostHog.
Die SDKs bringen ihre eigenen Manifeste mit; **die App braucht ein eigenes** mit
Reason-Code `CA92.1` für UserDefaults und den Datenkategorien aus den App-Privacy-Labels.
Fehlt komplett im Juni-Guide — und blockiert schon den Upload, nicht erst das Review.

### L4 — Push: Backend spricht FCM, iOS liefert APNs-Token
`convex/integrations.ts:166-170` sendet über die **FCM v1 API**. `@capacitor/push-notifications`
gibt auf iOS aber ein **APNs-Token** zurück, kein FCM-Token — `PushLifecycle.tsx:42`
registriert es trotzdem mit `platform: "ios"`. Damit landen iOS-Tokens in der FCM-Pipeline
und Sends schlagen fehl.
Drei Optionen: (a) Push in iOS-v1 aus lassen (das Flag steht ohnehin auf `false`, und
`android/app/google-services.json` fehlt auch für Android) — **empfohlen**; (b) Firebase-iOS-SDK
via `@capacitor-firebase/messaging` einbauen, dann bleibt das FCM-Backend; (c) zweiter
APNs-Sendepfad im Backend.

### L5 — Guideline 4.8 "Sign in with Apple" — Risiko, kein Blocker
`convex/auth.ts:6` bietet `Password` **und** `Google`. Weil ein eigener E-Mail/Passwort-Login
existiert, der nur Name und E-Mail sammelt, greift die Ausnahme von 4.8 — Sign in with Apple
ist formal *nicht* zwingend. In der Praxis wird das trotzdem gelegentlich beanstandet.
Plan: ohne SIWA einreichen, den Ausnahmegrund in den Review-Notizen benennen, SIWA als
vorbereitete Rückfallposition halten (Convex Auth hat einen Apple-Provider).

### L6 — WebView-Origin: `capacitor://cookly-app.com` ist nicht `https://cookly-app.com`
`capacitor.config.ts` setzt `androidScheme: 'https'` + `hostname: 'cookly-app.com'`.
Auf iOS ist der Default `iosScheme: 'capacitor'`, die App läuft also unter einem
**anderen Origin** als auf Android. Explizit zu testen: Login-Persistenz
(Convex-Auth-Token im localStorage), `localStorage`-Keys wie `cookly.deviceId`
(`PushLifecycle.tsx:13`), und ob der Google-OAuth-Redirect akzeptiert wird.
Option: `iosScheme: 'https'` setzen, damit beide Plattformen denselben Origin haben.

### L7 — Die Billing-Flags sind in **keiner** env-Datei gesetzt (betrifft auch Android)
Weder `VITE_NATIVE_BILLING_ENABLED` noch `VITE_REVENUECAT_GOOGLE_API_KEY` stehen in
`.env.local` oder `.env.production`. `nativeEnabled` ist damit **auf beiden Plattformen**
`false` — RevenueCat ist code-seitig fertig, aber nirgends scharfgeschaltet. Das relativiert
den Satz "RevenueCat läuft" aus Abschnitt 0: der Code läuft, das Produkt nicht.
Konsequenz für Phase 4: Es geht nicht nur um "iOS dazu", sondern um die Env-Versorgung
insgesamt. `build:ios` muss mit `--mode production` bauen (wie `build:android`), damit
`.env.production` überhaupt gelesen wird — sonst reproduziert iOS exakt den heutigen
Zustand: integriert, aber tot.
**Geklärt (25.08.2026):** Kein Versehen im engeren Sinn — es existiert weder ein
RevenueCat-Konto noch ein Google-Payments-Zahlungsprofil. Die Flags konnten nie gesetzt
werden, weil das Setup dahinter fehlt. Siehe Phase 4.0.

### L8 — `StatusBar.setBackgroundColor` ist Android-only
`pages/WelcomePage.tsx:33+36` und `pages/SignInPage.tsx:34` rufen es hinter einem reinen
`Capacitor.isNativePlatform()`-Guard auf. Auf iOS existiert die API nicht → "not implemented",
als unhandled Rejection (die `void`-Aufrufe fangen nichts ab) und damit als Sentry-Rauschen
bei jedem Start. `setStyle` dagegen funktioniert auf beiden Plattformen.
Fix: auf `getPlatform() === "android"` einschränken; die iOS-Statusleistenfarbe kommt
stattdessen aus `UIStatusBarStyle` in der `Info.plist` und der Hintergrundfarbe der App.
Hängt mit L1 zusammen — `viewport-fit=cover` ändert das Statusleisten-Overlay-Verhalten mit.

### L9 — Alle Rechtslinks in der App zeigen ins Leere
Vier Stellen verlinken Rechtstexte, für die **keine Route existiert**:

| Stelle | Link | Route vorhanden? |
|---|---|---|
| `pages/ProfilePage.tsx:303` | `#/legal` — "Datenschutz & Impressum" | ❌ |
| `pages/SignInPage.tsx:194/198` | `/terms`, `/privacy` | ❌ |
| `pages/SignUpPage.tsx:225/229` | `/terms`, `/privacy` | ❌ |
| `pages/WelcomePage.tsx:178ff` | dito | ❌ |

Der Router in `App.tsx:208-227` kennt weder `/legal` noch `/terms` noch `/privacy`, und in
`pages/` existiert keine entsprechende Datei.

**Die Texte selbst existieren aber bereits** (geprüft 25.08.2026) auf der Vercel-Website:
- `https://cookly-app.com/privacy` — Datenschutzerklärung, nennt Vercel, Convex,
  Google-Login und die Limited-Use-Zusage. Inhaltlich brauchbar.
- `https://cookly-app.com/terms` — Nutzungsbedingungen.
- `https://cookly-app.com/impressum` — ✅ seit 25.08.2026 live (Commit `d885639`,
  Einzelunternehmen mit § 19-UStG-Hinweis, "GmbH" aus allen Texten entfernt).

Der Aufwand ist damit klein: Die vier App-Links auf diese externen URLs umbiegen
(via `@capacitor/browser`, damit sie nicht im WebView die App verlassen) → Phase 0, Task 10.

**Offen bleibt ein inhaltlicher Punkt:** Die Datenschutzerklärung nennt Vercel, Convex und
Google, aber noch nicht Gemini, Apify, Stripe/RevenueCat, PostHog, Sentry und Pollinations.
Die App-Privacy-Labels in App Store Connect müssen zur Datenschutzerklärung passen — vor
der Einreichung ergänzen (Website-Repo, nicht dieses hier).

Gilt plattformunabhängig — betrifft den Play-Store-Release genauso.

### L10 — Rechtsträger: **Einzelunternehmer / Kleinunternehmer § 19 UStG** (geklärt 25.08.2026)
Die Rechtstexte nannten zunächst eine "aimpact agency GmbH". Die existiert nicht — Nico ist
Privatperson mit Kleingewerbeschein, ohne Handelsregistereintrag und **ohne USt-ID**.
aimpact ist ein Zukunftsplan, kein aktueller Rechtsträger. Die Website wurde daraufhin
korrigiert (Commit `d885639` im Repo `NicoDev01/cookly-website`): Impressum als
Einzelunternehmen mit § 19-UStG-Hinweis ist live, "GmbH" ist aus Datenschutz und
Nutzungsbedingungen entfernt.

**Das vereinfacht die Store-Anmeldung erheblich:**

| Bereich | Status / To-do |
|---|---|
| Apple | Enrollment als **Individual** → **kein D-U-N-S nötig**, 1–2 Tage statt 1–2 Wochen. Der frühere "kalenderkritische Pfad" entfällt. |
| Google Play | Das vorhandene Zahlungsprofil **"Natürliche Person"** (`0166-7357-1022`) ist korrekt — einfach verwenden. Händlername "Cookly", Support-Mail `aimpact.agency@gmail.com`, Abrechnungstext `COOKLY`. |
| Impressum | ✅ live unter `https://cookly-app.com/impressum`. Keine USt-ID nötig (§ 19 UStG), kein Registereintrag. |
| Store-Listing | Publisher ist die natürliche Person. **Die Privatanschrift wird in beiden Stores öffentlich** — bewusst in Kauf genommen für den Start. Ein Wechsel auf eine Geschäftsadresse oder später auf eine GmbH ist möglich, heißt dann aber: Impressum, beide Store-Accounts und die Rechtstexte gleichzeitig ändern. |

**Preisgestaltung beachten:** Als Kleinunternehmer weist du keine Umsatzsteuer aus. Apple und
Google führen die USt für digitale Produkte an Endkunden allerdings selbst ab
(Marketplace-Regelung) — das ist unabhängig von deinem § 19-Status und kein Widerspruch.
Bei der Preisfestlegung in beiden Konsolen sind die angezeigten Preise Bruttopreise.

#### Store-Stammdaten (in beiden Konsolen identisch verwenden)

| Feld | Wert |
|---|---|
| Öffentlicher Händler-/Entwicklername | `Cookly` |
| Rechtsträger | Nicolas Guerrero Tello, Einzelunternehmer (§ 19 UStG) |
| Support-E-Mail | `aimpact.agency@gmail.com` |
| Website | `https://cookly-app.com` |
| Datenschutz-URL | `https://cookly-app.com/privacy` |
| Nutzungsbedingungen / EULA | `https://cookly-app.com/terms` |
| Impressum | `https://cookly-app.com/impressum` |
| Abrechnungstext (Kreditkarte) | `COOKLY` |
| Bundle-ID / App-ID | `com.cookly.recipe` |
| USt-ID | **keine** (§ 19 UStG) — Feld leer lassen, ist eine gültige Angabe |

**Steuer-Setup in beiden Stores (leicht zu übersehen):**
- Deutsche Steuernummer für den USt-Status.
- **US-Steuerformular (W-8BEN)** mit der deutschen **Steuer-Identifikationsnummer** (11-stellig)
  als TIN und beanspruchten Abkommensvorteilen. Ohne das behalten Google und Apple 30 %
  US-Quellensteuer ein; mit DBA Deutschland–USA sind es 0 % auf App-Erlöse.
- Bankverbindung auf denselben Namen wie der Kontoinhaber; Verifizierung kann Tage dauern.

**Support-Adresse:** `aimpact.agency@gmail.com` (entschieden). Sie steht bereits in beiden
Rechtstexten. Die zuvor im Code hinterlegte `support@cookly.de` war tot — die Domain gehört
nicht zum Projekt, `cookly-app.com` hat keine MX-Records. Ersetzt in `SubscribePage.tsx:336`
und `DebugSheet.tsx:41`.

### L11 — Google-OAuth-Consent-Screen fehlerhaft konfiguriert
| Feld | Aktuell | Soll |
|---|---|---|
| Privacy policy link | `https://cookly-app.com/#faq` | `https://cookly-app.com/privacy` — `#faq` ist ein Anker auf der Startseite, keine Datenschutzerklärung |
| Terms of service link | leer | `https://cookly-app.com/terms` |
| Authorized domain 2 | `accounts.dev` | **Clerk-Überbleibsel** — Auth läuft über `@convex-dev/auth`, kann raus |

Google prüft diese Felder bei der OAuth-Verifizierung. Ein Privacy-Link, der nicht auf eine
Datenschutzerklärung zeigt, ist ein typischer Ablehnungsgrund und blockiert dann den
Google-Login für alle Nutzer.

---

## 2. Phasenplan

### Phase 0 — Vorarbeiten auf Windows (½–1 Tag, **ohne Mac möglich**)
Alles hier ist Web- und Config-Code und wird auf dem Mac nur noch gebaut.

1. `index.html`: `viewport-fit=cover` ergänzen (L1).
2. `services/billing.ts`: iOS-Branch + `VITE_REVENUECAT_APPLE_API_KEY` (L2a).
3. Payment-Hinweise plattformabhängig machen: `UpgradeModal.tsx:112`,
   `SubscribePage.tsx:323/327`, `ProfilePage.tsx:356` (L2b).
4. `WelcomePage.tsx`/`SignInPage.tsx`: `setBackgroundColor` auf Android einschränken (L8).
5. `capacitor.config.ts`: `ios`-Sektion anlegen (`contentInset`, ggf. `iosScheme: 'https'`, L6).
6. `scripts/version-upgrade.js`: iOS-Versionen mitziehen
   (`MARKETING_VERSION`, `CURRENT_PROJECT_VERSION` in `ios/App/App.xcodeproj/project.pbxproj`).
7. `package.json`: `build:ios` **mit `--mode production`** + `scripts/sync-ios.js` analog zu
   `sync-android.js` (L7).
8. `npm install @capacitor/ios` (nur Dependency, kein Xcode nötig).
9. `.gitignore`: iOS-Ergänzungen (`ios/App/Pods/`, `ios/App/App/public/`, `*.mobileprovision`,
   `ios/App/App.xcworkspace/xcuserdata/`) — das `ios/`-Verzeichnis selbst wird **committed**,
   genau wie `android/`.
10. Commit und Push nach GitHub. Ab hier ist der Mac dran.

### Phase 1 — Mac-Setup und erster Build (½–1 Tag)
Siehe Abschnitt 3 ("Von Windows zum Mac").

### Phase 2 — Native Konfiguration (1–2 Tage)
1. **Signing:** Team wählen, Bundle ID `com.cookly.recipe` (muss mit `appId` übereinstimmen).
2. **URL-Scheme** `com.cookly.recipe` in `Info.plist` (`CFBundleURLTypes`) → OAuth-Deep-Link.
   `services/deepLinkHandler.ts` und der `redirect`-Callback in `convex/auth.ts` bleiben unverändert.
   **iOS-Besonderheit:** `@capacitor/browser` öffnet auf iOS einen `SFSafariViewController`.
   Google stuft eingebettete Browser strenger ein (`disallowed_useragent`-Risiko), und der
   Cookie-Jar ist von der App getrennt. Google-Login ist damit ein eigener Testpunkt,
   nicht nur "OAuth generell testen": Erstlogin, Rückkehr über das Custom-Scheme,
   und Login-Persistenz nach App-Neustart (hängt mit L6 zusammen).
3. **Purpose-Strings** in `Info.plist`, konkret und deutsch formuliert:
   - `NSCameraUsageDescription` — der WebView-Dateipicker bietet "Foto aufnehmen" an
   - `NSPhotoLibraryUsageDescription`
   - `NSPhotoLibraryAddUsageDescription` (nur falls Bilder gespeichert werden)
4. **Privacy Manifest** `PrivacyInfo.xcprivacy` anlegen (L3).
4a. **`ITSAppUsesNonExemptEncryption = false`** in die `Info.plist` — Cookly nutzt nur
   Standard-HTTPS. Ohne den Key fragt App Store Connect bei **jedem** Upload nach der
   Export-Compliance; mit ihm ist die Frage ein für alle Mal erledigt.
4b. **StoreKit-Capability** in Xcode aktivieren (*Signing & Capabilities* → *In-App Purchase*),
   sonst schlägt der RevenueCat-Kauf zur Laufzeit fehl.
5. **Icons/Splash:** `npx @capacitor/assets generate --ios` (Quellen liegen in `assets/`).
6. **Lottie-Splash:** `capacitor-lottie-splash-screen@7.3.0` gegen Capacitor 8 ist ein
   Major-Mismatch. Wenn iOS damit bricht: auf reinen `@capacitor/splash-screen` zurückfallen —
   der `document.fonts.ready`-Gate aus dem letzten Release funktioniert unabhängig davon.
7. **Tastatur und Scroll:** Formulare (SignIn/SignUp, ManualRecipeForm, Shopping-Eingabe) auf
   dem Gerät testen; bei Problemen `@capacitor/keyboard` ergänzen.
8. **Back-Gesten:** `useBackButton`/`backButtonHandler.ts` sind Android-only. Prüfen, dass
   `ModalContext` nicht am Android-Back-Event hängt (Schließen-Buttons existieren).

### Phase 3 — Share Extension (2–4 Tage, größtes Risiko)
Unverändert der schwierigste Teil — die Bewertung aus dem Juni-Guide gilt weiter, jetzt mit
TikTok als drittem Provider.
1. Plugin-Entscheidung: `@supernotes/capacitor-send-intent@^7.0.0` läuft gegen Capacitor 8.
   iOS-Support des Forks prüfen; sonst auf das Original `capacitor-send-intent`
   (carsten-klaffke) wechseln — die API bleibt `SendIntent.checkSendIntentReceived()`
   (`App.tsx:162`), der Wechsel muss auf **beiden** Plattformen getestet werden.
2. Xcode-Target *Share Extension* (`CooklyShare`) + App Group `group.com.cookly.recipe`
   in beiden Targets aktivieren.
3. `NSExtensionActivationRule`: `NSExtensionActivationSupportsWebURLWithMaxCount: 1`
   und `NSExtensionActivationSupportsText: true`.
4. **Früh prototypen, nicht ans Ende schieben.** Testmatrix mit echten Apps:
   Instagram-Post, Instagram-Reel, **TikTok (inkl. `vm.`/`vt.`-Kurzlinks)**,
   Facebook-Post, Safari-URL. `utils/importTarget.ts` erkennt den Provider plattformunabhängig.

### Phase 4 — Payments (3–4 Tage, setzt Phase 0.2 voraus)
> **Ausgangslage geklärt (25.08.2026):** Es existiert **kein RevenueCat-Konto**, und in der
> Play Console ist **kein Zahlungsprofil** eingerichtet. Cookly hat also über keinen Store je
> Geld eingenommen. Der Play-Stand ist ein **geschlossener Alpha-Test** (Release 32 / 1.4.20,
> 21.07.2026) — keine echten Käufer, kein Policy-Risiko durch die deaktivierte Paywall.
> Phase 4 ist damit nicht "iOS dazu", sondern **Store-Billing von null** — der Aufwand fällt
> einmal an und deckt beide Plattformen ab.

0. **Vorlauf (kalenderkritisch, sofort starten):**
   - Google-Payments-Händlerkonto in der Play Console (Zahlungsprofil "Natürliche Person")
   - Steuer- und Bankdaten in App Store Connect
   - RevenueCat-Konto anlegen, Projekt `Cookly`, Entitlement `pro`, Offering mit
     `MONTHLY`/`ANNUAL` (Namen laut `docs/AP06_NATIVE_BILLING.md`)
   Beide Zahlungsprofile fragen dieselben Angaben ab — konsistent halten
   (Händlername, Support-Mail, Abrechnungstext).
1. Abos in **App Store Connect** anlegen, die Produkt-IDs in RevenueCat als iOS-Produkte
   verbinden, an dasselbe Entitlement `pro` und dieselben Packages (`MONTHLY`/`ANNUAL`)
   hängen — dann bleibt `services/billing.ts` inhaltlich gleich. Für Android dasselbe mit
   Play-Produkten und Base Plans.
2. Convex: `REVENUECAT_PRO_MONTHLY_PRODUCT_IDS` / `..._YEARLY_...` um die iOS-Produkt-IDs
   erweitern (kommagetrennt, `convex/billing.ts:116`). `billingModel.ts:64` muss den
   Store `app_store` als Provider akzeptieren — **verifizieren**.
3. Steuer- und Bankdaten in App Store Connect hinterlegen (dauert Tage, früh starten).
4. Sandbox-Tester anlegen, Kauf/Restore/Storno/Ablauf durchspielen.
5. **Pflicht-UI auf der Paywall:** Privacy-Policy- und EULA-Link, Restore-Purchases-Button,
   "Abo verwalten" → `https://apps.apple.com/account/subscriptions`.
   Kein Stripe-Portal-Link im iOS-Build.
6. `docs/AP06_NATIVE_BILLING.md` um einen iOS-Abschnitt erweitern (heute Android-only).

### Phase 5 — TestFlight und Review (3–5 Tage Kalenderzeit)
1. Archive → Upload → TestFlight intern auf dem eigenen iPhone.
2. Review-Checkliste: Demo-Account, Account-Löschung (existiert), Privacy-Policy-URL,
   App-Privacy-Labels (Convex, Gemini, Apify, Stripe/RevenueCat, PostHog, Sentry ehrlich
   deklarieren), keine externen Payment-Hinweise (L2b), kein "Beta"-Wording.
3. **Impressum:** Impressumspflicht nach § 5 DDG, Apple verlangt erreichbare
   Publisher-Kontaktdaten. ✅ Seit 25.08.2026 live unter `https://cookly-app.com/impressum`
   (Einzelunternehmen, § 19 UStG). In der App verlinken → Phase 0, Task 10.
4. Review-Notiz zu Guideline 4.8 vorbereiten (L5).
5. Optional ab Release 2: GitHub Actions `macos-latest` + Fastlane (`match`/`gym`/`pilot`).
   Die bestehende CI (`.github/workflows/quality.yml`, 40 Zeilen) deckt Lint/Typecheck und
   Gradle ab — ein iOS-Build-Job käme dort dazu.

---

## 3. Von Windows zum Mac — konkretes Vorgehen

**Kurzfassung:** Phase 0 jetzt auf Windows machen, pushen, auf dem Mac klonen.
`npx cap add ios` gehört auf den Mac, weil es `pod install` ausführt.

### 3.1 Was der Mac braucht (einmalig, ca. 2 h, meist Download-Zeit)
| Schritt | Womit |
|---|---|
| Xcode | Mac App Store, ca. 15 GB. Danach einmal öffnen und die Lizenz bestätigen. |
| Command Line Tools | `xcode-select --install` |
| Homebrew | Installationsbefehl von brew.sh |
| Node | `brew install node` (oder nvm, gleiche Major-Version wie auf Windows) |
| CocoaPods | `brew install cocoapods` — **nicht** `sudo gem install`, das bricht auf aktuellen macOS-Versionen |
| Git-Login | `gh auth login` oder SSH-Key bei GitHub hinterlegen |
| Apple Developer Program | 99 €/Jahr, **als Individual** (Einzelunternehmer, siehe L10) → kein D-U-N-S, Identitätsprüfung 1–2 Tage. Trotzdem früh starten, weil Signing, App Store Connect und Sandbox-Tester daran hängen. |

### 3.2 Projekt auf dem Mac
```bash
git clone <repo-url> cookly-app
cd cookly-app
npm install
npx cap add ios
npm run build
npx cap sync ios
npx cap open ios
```

**Achtung — was Git nicht mitbringt:** `.env.local`, `.env.production`, `.env.admin.local`
und `.env.sentry-build-plugin` stehen in `.gitignore`. Die müssen manuell auf den Mac
(verschlüsselter USB-Stick oder Passwort-Manager, **nicht** per Mail oder Chat).
Ohne `VITE_CONVEX_URL` startet die App gar nicht (`convexClient.ts:3`); ohne
`SENTRY_AUTH_TOKEN` verstummen die Sourcemap-Uploads im Mac-Build stillschweigend —
Crashes kommen dann unlesbar in Sentry an.

### 3.3 Arbeitsteilung danach
- **Windows bleibt die Haupt-Maschine** für React/Convex/Vite — der gesamte Web-Code
  läuft auf iOS unverändert.
- **Der Mac wird gebraucht für:** Xcode-Projektänderungen, Share-Extension, Simulator und
  Gerät, Archive, TestFlight-Upload.
- `ios/` wird committed → Xcode-Änderungen kommen per Push zurück nach Windows,
  Web-Änderungen per Pull auf den Mac. Auf beiden Seiten nach `npm run build` immer
  `npx cap sync ios`.

### 3.4 Mac-Beschaffung
| Option | Kosten | Tauglich für |
|---|---|---|
| Gebrauchter Mac mini M1/M2 (16 GB) | ca. 450–650 € | Alles, inkl. Share-Extension-Debugging. **Empfehlung** |
| MacBook Air M1 gebraucht | ca. 500–700 € | Alles |
| Cloud-Mac (MacinCloud, Scaleway M1) | ca. 1–2 €/h bzw. ca. 25 €/Monat | Builds und Uploads; Debugging auf echtem iPhone geht **nicht** |
| Geliehener Mac | – | Nur wenn er über Wochen verfügbar ist — Review-Runden ziehen sich |

Ein echtes iPhone wird zusätzlich gebraucht: Share-Extension, OAuth und IAP-Sandbox
lassen sich im Simulator nicht vollständig testen.

---

## 4. Aufwand

| Block | Aufwand | Ort |
|---|---|---|
| Phase 0 (Vorarbeiten) | ½–1 Tag | Windows |
| Phase 1 (Mac-Setup + erster Build) | ½–1 Tag | Mac |
| Phase 2 (native Konfiguration) | 1–2 Tage | Mac |
| Phase 3 (Share Extension) | 2–4 Tage | Mac + iPhone |
| Phase 4 (Store-Billing von null, beide Plattformen) | 3–4 Tage | Mac + App Store Connect + Play Console |
| Phase 5 (TestFlight + Review) | 3–5 Tage, viel Wartezeit | – |
| **Gesamt** | **3 Wochen Kalenderzeit** | |

Gegenüber der Juni-Schätzung (3–4 Wochen) leicht kürzer: K1 und K2 sind code-seitig erledigt,
dafür kam mit dem RevenueCat-Setup von null (Phase 4.0) und den Rechtstexten (L9) Arbeit dazu,
die der Juni-Guide nicht kannte. Die Rechtstexte laufen parallel und blockieren nur den Release.

## 5. Risiken

1. **Share Extension mit Capacitor** — unverändert Platz 1. Den Prototyp aus Phase 3,
   Schritt 1–3 bauen, bevor irgendetwas anderes poliert wird.
2. **Ungebranchte Payment-Hinweise (L2b)** — der einzige echte 3.1.1-Ablehnungsgrund im
   aktuellen Code. Gehört ins Release-Gate.
3. **Privacy Manifest (L3)** — blockiert schon den Upload, nicht erst das Review.
4. **Env-Flags (L7)** — die Fehlerform ist tückisch: Build läuft, App startet, Paywall ist da,
   nur kaufen kann niemand. Fällt im Simulator nicht auf, weil sie dort ohnehin deaktiviert ist.
5. **WebView-Origin (L6)** — kann sich als "Login geht nach Neustart verloren" tarnen.
6. **Apple-Review-Dauer** — 1–3 Tage pro Runde, mit 1–2 Ablehnungsrunden rechnen.

## 6. Änderungshistorie

- **25.08.2026, Erstfassung:** L2 behauptete, iOS würde den Stripe-Checkout anbieten
  (→ garantierte 3.1.1-Ablehnung). Falsch: `purchase()` verzweigt über
  `isNativePlatform()`, und `SubscribePage.tsx:74` guarded den Fall. Korrigiert zu
  "tote Paywall" (L2a) + dem tatsächlichen 3.1.1-Fund in vier UI-Stellen (L2b).
  L7 (Env-Flags) und L8 (StatusBar) kamen bei derselben Prüfung dazu.
