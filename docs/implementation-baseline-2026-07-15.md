# Implementierungsbaseline vom 15. Juli 2026

## Zweck und Geltungsbereich

Diese Baseline dokumentiert den Ausgangszustand vor AP-01. AP-00 verändert keine Produktionslogik und behebt keine bestehenden Befunde. Ergänzt wurde ausschließlich das reproduzierbare `npm test`-Skript in `package.json`.

Messzeitpunkt: `2026-07-15T00:31:43+02:00`

## Reproduktionsumgebung

| Merkmal | Wert |
|---|---|
| Git-Branch | `main` |
| Git-Commit | `df73f79302ffdaf2d2f6d37626a01223fb6b0444` |
| Betriebssystem | Windows 11, amd64 |
| Node.js | `v24.15.0` |
| npm | `11.12.1` |
| Java | OpenJDK `21.0.10` |
| Gradle | `8.14.3` |
| Kotlin | `2.0.21` |

Android-Lint benötigt lokal ein gesetztes `JAVA_HOME`. Verwendet wurde `C:\Program Files\Android\Android Studio\jbr`.

## Prüfergebnisse vor AP-01

| Prüfung | Reproduktionsbefehl | Exit-Code | Quantitativer Befund | Status |
|---|---|---:|---|---|
| Node-Tests | `npm test` | 0 | 74 Tests: 74 bestanden, 0 fehlgeschlagen, 0 übersprungen | bestanden |
| TypeScript und Web-Build | `npm run build:check` | 0 | 1.903 Module transformiert; TypeScript ohne Fehler; Vite-Build erstellt | bestanden |
| ESLint | `npm run lint` | 1 | 84 Fehler und 13 Warnungen in 32 Dateien | bestehender Fehler |
| Knip | `npm run knip` | 1 | 7 ungenutzte Dateien, 9 ungenutzte Abhängigkeiten, 26 ungenutzte Exporte, 23 ungenutzte exportierte Typen, 17 doppelte Exporte, 6 Konfigurationshinweise | bestehender Fehler |
| JSCPD | `npm run jscpd` | 0 | keine Duplikate gemeldet; Laufzeit 0,178 ms | formal bestanden, Konfiguration in AP-07 verifizieren |
| Ast-Grep | `npm run ast-grep` | 0 | keine Treffer gemeldet | formal bestanden, Regelabdeckung in AP-07 verifizieren |
| Produktionsabhängigkeiten | `npm audit --omit=dev` | 1 | 7 Schwachstellen: 4 hoch, 3 moderat, 0 kritisch | bestehender Fehler |
| Android-Lint | `$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'; .\android\gradlew.bat lint` | 0 | 0 Fehler und 33 Warnungen | bestanden mit bestehenden Warnungen |

### ESLint-Schwerpunkte

| Regel | Anzahl |
|---|---:|
| `@typescript-eslint/no-unused-vars` | 30 |
| `@typescript-eslint/no-explicit-any` | 27 |
| `react-hooks/set-state-in-effect` | 10 |
| `react-refresh/only-export-components` | 6 |
| `react-hooks/refs` | 5 |
| `no-var` | 3 |
| `react-hooks/exhaustive-deps` | 3 |
| `prefer-const` | 2 |
| `no-useless-catch` | 1 |
| Meldungen ohne Regel-ID | 10 |

### `npm audit` nach Paket

| Paket | Schweregrad | Direkt abhängig |
|---|---|---|
| `react-router-dom` | hoch | ja |
| `react-router` | hoch | nein |
| `protobufjs` | hoch | nein |
| `ws` | hoch | nein |
| `brace-expansion` | moderat | nein |
| `qs` | moderat | nein |
| `tar` | moderat | nein |

### Android-Lint nach Befundart

| Befundart | Anzahl |
|---|---:|
| `IconLauncherShape` | 10 |
| `UnusedResources` | 9 |
| `IconDuplicates` | 6 |
| `IconLocation` | 3 |
| `MonochromeLauncherIcon` | 2 |
| `AndroidGradlePluginVersion` | 1 |
| `ManifestOrder` | 1 |
| `SelectedPhotoAccess` | 1 |

Der Build meldet zusätzlich eine sieben Monate alte Browserslist-Datenbasis. Dies ist kein Buildfehler und wird in AP-00 nicht geändert.

## Sicherheits- und Regressionstestentwürfe

Die folgenden Tests sind bewusst noch nicht implementiert. Sie beschreiben den erwarteten Schutz und würden gegen den aktuellen Stand fehlschlagen. Die ausführbaren Tests entstehen im jeweils genannten Arbeitspaket.

| Arbeitspaket | Testentwurf | Erwartetes Verhalten | Aktueller Grund des Fehlschlags |
|---|---|---|---|
| AP-01 | `rejects redirect from an allowed image URL to a private network target` | Abbruch mit `REMOTE_IMAGE_BLOCKED`, bevor ein privates Ziel abgerufen wird | Der Bildabruf besitzt keine zentrale URL-/DNS-Policy und prüft Redirect-Ziele nicht pro Hop. |
| AP-02 | `prevents user A from scanning a photo asset uploaded by user B` | Abbruch mit `STORAGE_NOT_OWNED` vor Gemini-Aufruf | Eine Storage-ID besitzt derzeit keinen serverseitigen Eigentums- und Zwecknachweis über `storageAssets`. |
| AP-03 | `starts exactly one provider request for two concurrent reservations of the final free slot` | Genau eine Reservierung und genau ein Providerstart; der zweite Aufruf wird vor Kostenentstehung abgelehnt | Es existiert keine atomare Reservierung vor dem Provideraufruf; Verbrauch wird erst später beim Speichern geprüft beziehungsweise gezählt. |
| AP-04 | `deletes the Stripe customer before removing the local user record` | Stripe-Cleanup erfolgt zuerst; bei Stripe-Fehler bleibt der Nutzerbezug retrybar bestehen | `deleteCurrentUser` bereinigt lokale Daten, orchestriert aber keine vorherige Stripe-Kundenlöschung. |

## Vorhandener Arbeitsbaum vor AP-00

Vor der Änderung bestanden 54 nicht eingecheckte Einträge: 35 geänderte und 19 unversionierte Pfade. Sie wurden weder zurückgesetzt noch inhaltlich verändert.

### Geänderte Pfade

```text
App.tsx
capacitor.config.ts
components/AddRecipeModal.tsx
components/ErrorBoundary.tsx
components/ImageWithBlurhash.tsx
components/MealPlanModal.tsx
components/RecipeHero.tsx
components/SafeImage.tsx
components/TabsLayout.tsx
components/onboarding/WelcomeScreen.tsx
contexts/NotificationContext.tsx
convex/recipes.ts
docs/audit-2026-06/03-verbesserungen.md
docs/audit-2026-06/08-ux-fehlertexte-performance.md
hooks/useHaptic.ts
index.css
index.tsx
pages/CategoriesPage.tsx
pages/CategoryRecipesPage.tsx
pages/FavoritesPage.tsx
pages/ForgotPasswordPage.tsx
pages/ProfilePage.tsx
pages/RecipePage.tsx
pages/ShareTargetPage.tsx
pages/SignInPage.tsx
pages/SignUpPage.tsx
pages/SubscribePage.tsx
pages/WeeklyPage.tsx
pages/WelcomePage.tsx
prefetch.ts
services/deepLinkHandler.ts
tailwind.config.js
utils/authErrors.ts
utils/notifications.ts
vite.config.ts
```

### Unversionierte Pfade

```text
.codebase-memory/
.graphifyignore
CLAUDE.md
components/DebugSheet.tsx
components/PageLoader.tsx
docs/IMPLEMENTATION_MASTERPLAN_2026-07.md
graphify-out/
utils/appInfo.ts
utils/efficiencyRegression.test.mjs
utils/errorSurfaceRegression.test.mjs
utils/loadingMotionRegression.test.mjs
utils/logger.test.mjs
utils/logger.ts
utils/shareTargetPhases.test.mjs
utils/shareTargetPhases.ts
utils/toastState.test.mjs
utils/toastState.ts
utils/userErrors.test.mjs
utils/userErrors.ts
```

## Baseline-Regeln für Folgepakete

1. Neue Änderungen dürfen die 74 bestehenden Tests oder `npm run build:check` nicht verschlechtern.
2. Bestehende ESLint-, Knip- und Audit-Befunde gelten nicht als durch Folgepakete verursacht; neue Befunde im jeweiligen Scope sind dennoch unzulässig.
3. JSCPD- und Ast-Grep-Erfolge gelten erst nach der in AP-07 vorgesehenen Konfigurationsprüfung als belastbare Qualitätsaussage.
4. Vorhandene fremde Arbeitsbaumänderungen dürfen weder zurückgesetzt noch beiläufig bereinigt werden.
5. Jeder Sicherheitsfix erhält den zugehörigen deterministischen Regressionstest im selben Arbeitspaket.
