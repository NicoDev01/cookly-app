# 10 – Quality Gate: `npm run lint:all`

## Status

`npm run lint:all` ist aktuell kein belastbares Release-Gate.

Der Befehl bricht bereits bei `npm run lint` ab. Dadurch laufen `knip` und `jscpd` im kombinierten
Gate nicht mehr durch. Einzelchecks zeigen zusätzlich bestehende Altbefunde.

## Einordnung

Das blockiert die aktuellen Sicherheitsfixes nicht, solange gezielte Checks laufen:

- TypeScript/Vite-Build
- relevante Node-Regressionstests
- Convex-Codegen/Dev-Deploy
- Secret-Suchen in `dist` und Android-Assets
- gezieltes ESLint auf neu geänderte Dateien

Als dauerhaftes CI-Gate ist der Zustand aber ungeeignet, weil echte Risiken und Rauschen vermischt
werden.

## Hauptbefunde

### Q1 – ESLint prüft generierte/Build-Artefakte

Beispiele:

- `android/app/build/intermediates/.../native-bridge.js`
- `convex/_generated/*`
- potenziell `dist/*`

Problem: Diese Dateien werden erzeugt, nicht gepflegt. Sie dürfen nicht als App-Code gelintet werden.

**Fix:** ESLint-Ignores ergänzen:

- `dist/**`
- `android/app/build/**`
- `android/app/src/main/assets/public/**`
- `convex/_generated/**`

### Q2 – Low-Risk-Codehygiene

Beispiele:

- ungenutzte Imports/Variablen
- `prefer-const`
- `no-var`
- tote lokale Variablen

**Fix:** Separater Cleanup-Commit, kein Verhalten ändern. Danach gezielt Build und Smoke-Test.

### Q3 – React-Hooks-Regeln mit Verhaltensrisiko

Beispiele:

- `react-hooks/set-state-in-effect`
- `react-hooks/refs`
- `react-hooks/exhaustive-deps`

Betroffene Bereiche:

- App-Initialisierung
- Back-Button
- Modals
- Bildladen
- Rezeptseiten-Navigation

**Fix:** Nicht automatisch. Jede Stelle einzeln prüfen, weil falsche Änderungen Navigation,
Splash/Load-State oder Modal-Verhalten brechen können.

### Q4 – Convex-/TypeScript-`any`-Altlasten

Beispiele:

- `convex/recipes.ts`
- `convex/weekly.ts`
- `contexts/QueryCacheContext.tsx`

**Fix:** Nur im Rahmen eines Typisierungs-Pakets. Nicht nebenbei in Security-Fixes anfassen.

### Q5 – Knip-Funde getrennt bewerten

Bekannte Kategorien:

- tote Dateien, z. B. alte UI-Komponenten
- tote `convex.config.ts`
- möglicherweise falsch-positive Capacitor-Abhängigkeiten

**Fix:** Nach ESLint-Ignores separat auswerten. Dependencies nicht blind entfernen, besonders nicht
Capacitor-Plugins.

## Empfohlener Ablauf

1. ESLint-Ignores für generierte Dateien setzen.
2. `npm run lint` erneut ausführen.
3. Low-Risk-Fixes in einem eigenen Commit.
4. React-Hooks-Funde einzeln mit Gerätetest/Browser-Smoke-Test bearbeiten.
5. `npm run knip` separat auswerten.
6. `npm run jscpd` separat auswerten.
7. Erst danach `npm run lint:all` als CI-Gate verwenden.

## Definition of Done

- `npm run lint` läuft ohne Fehler auf gepflegtem Quellcode.
- Generierte Dateien sind ausgeschlossen.
- Low-Risk-Fixes sind erledigt.
- React-Hooks-Fixes sind einzeln verifiziert.
- Knip-Funde sind bewertet, nicht blind entfernt.
- `npm run lint:all` läuft stabil und ist CI-tauglich.
