# Release-Playbook (Stand 21.10.2026)

Ablauf für jedes Update nach dem Launch. iOS 1.4.20 (Build 6) ist seit 21.10.2026 live,
Android steht im geschlossenen Alpha-Test (1.4.20, versionCode 32).

## 1. Was ohne Review live geht und was nicht

| Änderung | Weg | Review? |
|---|---|---|
| Convex-Funktionen, Import-Logik, Limits | `npx convex deploy` | nein, sofort live |
| Werbetext (Promotional Text) im App Store | App Store Connect | nein |
| Abo-Preise | App Store Connect → Abos | nein (Erhöhungen: Apple informiert Bestandskunden, Wissensstand) |
| Alles im Web-Bundle (React, Texte, Paywall) | neuer Build | ja |
| Screenshots, Beschreibung, Keywords | mit einer neuen Version | ja |
| Native Änderungen (Plugins, Info.plist, Rechte) | neuer Build vom Mac | ja |

Über Convex keine Funktionen freischalten, die Apple nicht gesehen hat (Guideline 2.3.1).

## 2. Ablauf eines Updates

### Windows
1. Änderungen committen, `CHANGELOG.md` unter `[Unreleased]` pflegen.
2. Version erhöhen: `npm run release:patch` (Bugfix) bzw. `release:minor` (Feature).
   Das Skript prüft Tests/Typecheck/Lint, erhöht Android-`versionCode`/`versionName`
   und setzt iOS auf dieselbe Version und Buildnummer, baut danach das Android-AAB.
3. Convex-Dashboard → Usage: Function Calls und Bandwidth notieren (Vergleichswert, `CLAUDE.md` Regel 5).
4. Pushen.

### Mac
1. `git pull && npm ci`
2. `SENTRY_AUTH_TOKEN=<token> npm run build:ios`
   Bricht ab, wenn `.env.production` den In-App-Kauf nicht aktiviert (`scripts/check-ios-env.mjs`).
3. `npx cap open ios` → Xcode → Product → Archive → Distribute App → App Store Connect.
4. In TestFlight auf dem iPhone kurz prüfen: Start, Login, Import, Pro-Seite öffnet das Apple-Kauffenster.

### App Store Connect
1. iOS-App → „+“ neue Version mit derselben Versionsnummer anlegen, Build auswählen.
2. „Neuerungen in dieser Version“ ausfüllen (Text unten bzw. aus dem Changelog kürzen).
3. Veröffentlichung: **„Update für automatische Updates stufenweise freigeben“** (7 Tage, pausierbar).
4. Zur Prüfung einreichen. Kritischer Bug → beschleunigte Prüfung beantragen.

## 3. Nach dem Release (erste 48 Stunden)

- **Sentry:** neue Fehler in der neuen Version? Bei Häufung die stufenweise Freigabe pausieren.
- **Xcode → Window → Organizer → Crashes:** native Abstürze (Sentry sieht nur JavaScript).
- **RevenueCat → Customers / Charts:** Käufe und Verlängerungen kommen an.
- **Convex → Usage:** Werte gegen die notierten vergleichen.

## 4. Iterieren: der wöchentliche Blick

| Frage | Wo |
|---|---|
| Wie viele kommen auf die Store-Seite, wie viele laden? | App Store Connect → Analytics |
| Wer importiert das erste Rezept? | PostHog |
| Paywall → Kauf | PostHog: `paywall_viewed` → `checkout_started` → `purchase_completed` |
| Kündigungen | PostHog `subscription_cancelled`, RevenueCat Churn |
| Was ärgert Nutzer? | App-Store-Bewertungen, Sentry |

Pro Update **eine** Hypothese mit Messgröße („neuer Onboarding-Text → mehr Erst-Importe“).
Store-Seite testen: App Store Connect → Produktseitenoptimierung (bis 3 Varianten, max. 90 Tage).

## 5. Neuerungen 1.4.21 (Text für App Store Connect)

```
• Übersichtlichere Abo-Informationen auf der Pro-Seite
• Kleine Fehlerbehebungen und Verbesserungen
```

## 6. Einmalige Grundlagen, noch offen

Von Nico in den Konsolen zu erledigen:

- [ ] **Apple-Server-Benachrichtigungen:** RevenueCat → App-Einstellungen → „Apple Server Notification URL“
      kopieren → App Store Connect → App-Informationen → App Store-Serverbenachrichtigungen,
      bei Produktion **und** Sandbox (Version 2) eintragen. Sonst erfährt RevenueCat Kündigungen
      und Erstattungen erst verzögert.
- [ ] **Small Business Program:** Sobald Apple bestätigt, in RevenueCat das Startdatum unter
      „Apple Small Business Program“ eintragen, sonst rechnet RevenueCat mit 30 % Provision.
- [ ] **Convex-Usage-Basiswert** jetzt notieren (vor 1.4.21).
- [ ] **Brevo-Vorlagen und PostHog-Umfragen** anlegen (`docs/GROWTH_FOUNDATION.md`), falls noch nicht geschehen.
- [ ] Optional: App-Store-Connect-API-Key in RevenueCat hinterlegen (Produktstatus, Preisimport).

Bekannte technische Lücken (Entscheidung offen):

- **Bewertungsabfrage in der App:** fehlt. iOS zeigt die native Abfrage höchstens 3-mal pro Jahr;
  braucht ein natives Plugin, also einen Mac-Build.
- **Push auf iOS:** aus (`docs/IOS_PORT_2026-08.md`, L4).
- **Android-In-App-Kauf:** nicht scharf geschaltet (L7), Play Store noch im Alpha-Test.
