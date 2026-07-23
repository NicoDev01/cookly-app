# AP07 – Sentry-Fehlerüberwachung

## Aktivierung

1. Sentry-Projekt: Organisation `aimpact-oc`, Projekt `cookly-react`.
2. Öffentliche DSN beim Produktions-Build setzen: `VITE_SENTRY_DSN`.
3. Nur im geschützten Release-/CI-Environment setzen: `SENTRY_AUTH_TOKEN`.

Ohne DSN bleibt Sentry vollständig aus. Ohne Auth-Token funktioniert die Fehlerüberwachung, aber der Build lädt keine Source Maps hoch.

## Datenschutz

- keine Nutzerprofile, Request-Daten, Extras oder Contexts
- keine Log-Daten/Rezepte/URLs; nur feste Log-Meldung, Stackframes, App-Version, Plattform und bereinigte Route
- kein Session Replay, Performance-Tracing oder Sentry Logs

## Prüfung

Produktions-Build mit beiden Variablen erzeugen. Danach absichtlich einen Fehler aus App-Code auslösen und in Sentry prüfen: genau ein Event, Release `cookly@<version>`, lesbare Originaldatei/-zeile, keine personenbezogenen Inhalte.
