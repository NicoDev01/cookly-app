# iOS-Build ohne Mac (GitHub Actions)

Stand 24.10.2026. Workflow: `.github/workflows/ios-testflight.yml`, Fastlane: `ios/fastlane/Fastfile`.

Ein Klick auf GitHub baut die App auf einem macOS-Runner (Xcode 26.6), signiert App und
Share-Extension und lädt den Build nach TestFlight. Kostenlos, weil das Repo öffentlich ist
(Standard-Runner sind für öffentliche Repos frei). Apple verlangt seit 28.04.2026 Xcode 26.

## Signierung

- **Zertifikat:** eigenes „Apple Distribution“-Zertifikat. Privater Schlüssel und CSR wurden
  unter Windows erzeugt und liegen in `C:\Users\nico_\.cookly-ios-signing\` (nicht im Repo).
  Die `.p12` ist mit SHA1/3DES verschlüsselt, weil der macOS-Schlüsselbund die
  OpenSSL-3-Standardverschlüsselung nicht immer importiert.
- **Profile:** Fastlane holt oder erstellt die App-Store-Profile für `com.cookly.recipe` und
  `com.cookly.recipe.CooklyShare` bei jedem Lauf über den App-Store-Connect-API-Schlüssel.
- Die Mac-Signierung (Xcode, automatisch) bleibt unberührt; beide Wege funktionieren parallel.

## GitHub Secrets

| Secret | Inhalt |
|---|---|
| `ASC_KEY_ID` | Key-ID des App-Store-Connect-API-Schlüssels |
| `ASC_ISSUER_ID` | Issuer-ID (steht über der Schlüsselliste) |
| `ASC_KEY_P8_BASE64` | `AuthKey_XXXX.p8`, base64-kodiert |
| `DIST_CERT_P12_BASE64` | Distribution-Zertifikat + Schlüssel als `.p12`, base64-kodiert |
| `DIST_CERT_PASSWORD` | Passwort der `.p12` |
| `SENTRY_AUTH_TOKEN` | Sentry-Token für den Sourcemap-Upload (optional; ohne bleiben Stacktraces unlesbar) |
| `IOS_ENV_PRODUCTION` | Nur die `VITE_`-Zeilen der `.env.production` plus `VITE_NATIVE_BILLING_IOS_ENABLED=true` und `VITE_REVENUECAT_APPLE_API_KEY=appl_…` |

Server-Secrets (Stripe, Apify, Jina) gehören **nicht** dazu: Vite übernimmt nur `VITE_`-Werte in die App.

## Einen Build starten

1. Versionsnummer und Buildnummer im Repo erhöhen (`npm run release:patch` oder von Hand), pushen.
2. GitHub → Actions → **iOS TestFlight** → **Run workflow**.
   Das Feld „Buildnummer“ leer lassen; nur ausfüllen, wenn ein Lauf nach dem Upload abbrach
   und dieselbe Nummer schon bei Apple liegt.
3. Nach ca. 15–25 Minuten ist der Build in App Store Connect → TestFlight (Verarbeitung dauert danach noch etwas).

## Wenn es scheitert

| Meldung | Ursache |
|---|---|
| `ios-env:check fehlgeschlagen` | `IOS_ENV_PRODUCTION` unvollständig |
| `No matching provisioning profiles` / `certificate` | `.p12` passt nicht zum Zertifikat bei Apple oder ist abgelaufen |
| `bundle version must be higher` | Buildnummer schon vergeben → erhöhen oder im Workflow-Feld überschreiben |
| `maximum number of certificates` beim Anlegen | Zu viele Distribution-Zertifikate; ein altes im Developer-Portal widerrufen. Bereits veröffentlichte Apps bleiben davon unberührt (Wissensstand). |

Das Zertifikat läuft nach einem Jahr ab: dann neue CSR erzeugen, Zertifikat anlegen,
`DIST_CERT_P12_BASE64` und `DIST_CERT_PASSWORD` ersetzen.
