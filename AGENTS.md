# Cookly Engineering Leitplanken

## Convex Subscription-Budget

1. Tab-Level-Queries nur dauerhaft mounten, wenn sie kleine Preview- oder Aggregatdaten liefern.
2. Listen-Queries dürfen keine Rezept-Detailfelder wie `ingredients` oder `instructions` abonnieren.
3. Rezept-Details nur per Detail-Query für das aktuell geöffnete Rezept laden.
4. Neue Tab- oder Modal-Queries mit `"skip"` deaktivieren, bis die Fläche sichtbar oder fachlich nötig ist.
5. Vor Releases im Convex-Dashboard `Usage` prüfen: Function Calls und Bandwidth vor/nach größeren Listen-Änderungen notieren.
6. Import-/Timing-Logs sparsam halten; produktive Logs zählen ebenfalls ins Convex-Kontingent.
