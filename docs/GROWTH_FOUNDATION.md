# Cookly Growth-, Analyse- und Monetarisierungsgrundlage

## Aktivierung

### Vite / App

```env
VITE_POSTHOG_KEY=phc_...
VITE_POSTHOG_HOST=https://eu.i.posthog.com
VITE_SENTRY_DSN=...
```

PostHog startet automatisch. Eingabefelder, Zahlungsdaten und Elemente mit
`data-private` oder `data-payment` werden in Replays maskiert.

### Convex

In der Production-Deployment-Umgebung setzen:

```text
POSTHOG_PROJECT_KEY
POSTHOG_HOST
BREVO_API_KEY
BREVO_SENDER_EMAIL
FCM_PROJECT_ID
FCM_SERVICE_ACCOUNT_JSON
COOKLY_ADMIN_TOKEN
BREVO_WEBHOOK_SECRET
```

Der Brevo-Webhook zeigt auf:

```text
https://<deployment>.convex.site/brevo/webhook
```

Header:

```text
x-cookly-webhook-secret: <BREVO_WEBHOOK_SECRET>
```

In Brevo müssen einmalig die Templates und Automationen für Willkommen,
Aktivierung, Limitwarnung, Reaktivierung, Zahlungsfehler und Kündigung angelegt
werden. Cookly synchronisiert Kontakte und sendet die zugehörigen
`cookly_*`-Verhaltensereignisse bereits automatisch.

In PostHog müssen einmalig die gewünschten Surveys angelegt und auf die bereits
erfassten Ereignisse ausgerichtet werden: Onboarding-Ziel, Import-CSAT,
Importfehler, NPS, Paywall-Abbruch und Kündigungsgrund. Feature Flags und
Experimente können anschließend im Cookly-Admin-Dashboard verwaltet werden.

### Firebase / Android

1. Firebase-Projekt für `com.cookly.recipe` anlegen.
2. `google-services.json` nach `android/app/google-services.json` kopieren.
3. Den Service-Account als einzeiliges JSON in `FCM_SERVICE_ACCOUNT_JSON` speichern.
4. `VITE_PUSH_NOTIFICATIONS_ENABLED=true` für den App-Build setzen.
5. `npm run build:android` ausführen.

Ohne Firebase-Datei bleibt Server-Push deaktiviert; lokale Importbenachrichtigungen
funktionieren unverändert.

## Admin-Dashboard

`.env.admin.example` nach `.env.admin.local` kopieren und Werte setzen:

```powershell
npm run admin
```

Das Dashboard läuft ausschließlich auf `http://127.0.0.1:4174`. Externe API-Schlüssel
werden nur vom lokalen Node-Server gelesen und nie an den Browser gesendet.

## Datenvertrag

- Ereignisnamen stehen ausschließlich in `analytics/eventRegistry.ts`.
- PostHog enthält Detailanalyse und Session Replays.
- Convex speichert kanonische Produkt- und Serverereignisse sowie operative Aggregate.
- `billingUserId`, `anonymousId`, `sessionId`, `correlationId` und `operationId`
  verbinden Produktverhalten, Importe, Sentry, Marketing und Umsatz.
- Manuelle Rezepte sind unbegrenzt.
- Linkimporte und Foto-Scans sind für Free-Nutzer auf jeweils 60 lebenslange
  erfolgreiche Nutzungen begrenzt.

## Bestehende Nutzer

Der geschützte Admin-Endpunkt migriert jeweils 50 Nutzer:

```text
POST /admin/backfill
Authorization: Bearer <COOKLY_ADMIN_TOKEN>
Body: {"cursor":"<cursor aus vorheriger Antwort>"}
```

Wiederholen, bis `done: true` zurückgegeben wird.
