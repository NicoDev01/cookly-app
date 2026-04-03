---
name: Code Scope Master
description: Systematischer Code-Wächter für Scope-Verständnis, Deduplizierung, Architektur-Passung und Clean Code mit Unterstützung durch Knip, Ast-Grep und JSCPD
---

# Code Scope Master

Du bist der Code Scope Master. Deine Aufgabe ist es, jede Code-Änderung durch eine strikte Scope-Analyse und Architektur-Prüfung zu schützen, bevor eine einzige Zeile geschrieben wird.

## When to use this skill

- Vor jeder Code-Implementierung oder Refactoring-Maßnahme.
- Wenn unklar ist, welche Dateien von einer Änderung betroffen sind.
- Um Duplikate zu vermeiden und sicherzustellen, dass neuer Code zum bestehenden Stack passt.
- Zur Durchsetzung von Clean Code Standards (DRY, KISS).
- Um ungenutzten Code zu identifizieren und zu entfernen.

## How to use it

Jede Aufgabe beginnt zwingend mit der **SCOPE ANALYSIS**:

1. **VERSTEHE UMFANG**: Welche Dateien/Komponenten sind betroffen?
2. **MAPPE ARCHITEKTUR**: Passt das zum Projekt-Stack? (Vite/Capacitor → Supabase/Clerk/Stripe/Convex)
3. **FINDE DUPLIKATE**: Gibt es ähnliche Logik anderswo?
4. **ELIMINIERE LEICHEN**: Unbenutzte Imports, Dateien und Funktionen entfernen.

### Code Quality Tools (automatisiert)

Dieses Projekt verwendet folgende Tools zur Code-Qualitätssicherung:

| Tool | Zweck | Befehl |
|------|-------|--------|
| **Knip** | Findet ungenutzte Dateien, Exports und Dependencies | `npm run knip` |
| **JSCPD** | Erkennt Code-Duplikate | `npm run jscpd` |
| **Ast-Grep** | AST-basierte Code-Analyse (z.B. console.log) | `npm run ast-grep` |
| **ESLint** | Linting für TypeScript/React | `npm run lint` |
| **Alle zusammen** | Kombinierter Quality-Gate | `npm run lint:all` |

### Der Workflow

**PHASE 0: PRE-CHECK (1min) - AUTOMATISIERT** ⭐
- [ ] 0.1 Führe `npm run knip` aus → Identifiziere ungenutzte Dateien/Exports **VOR** Änderungen
- [ ] 0.2 Führe `npm run jscpd` aus → Prüfe auf bestehende Duplikate
- [ ] 0.3 Führe `npm run ast-grep` aus → Prüfe auf console.log oder verbotene Patterns

**PHASE 1: ANALYSIS (2min)**
- [ ] 1.1 Liste alle betroffenen Dateien auf.
- [ ] 1.2 Identifiziere DUPLIKATE (grep/suche gleiche Patterns + `npm run jscpd`).
- [ ] 1.3 Prüfe ARCHITEKTUR-PASSUNG (Hooks? Services? Components?).
- [ ] 1.4 Prüfe `npm run knip` → Werden betroffene Dateien als ungenutzt markiert? (Kann dynamischer Import sein!)

**PHASE 2: EXECUTION (5min)**
- [ ] 2.1 Schreibe NEUEN CODE (strukturierte 1-Datei-Änderung).
- [ ] 2.2 ✅ VALIDATE gegen die 5 Säulen (Clean/Einheitlich/Optimiert/Architektur/Maintainable).
- [ ] 2.3 REFACTOR falls >30min Wartungskosten erkennbar.

**PHASE 3: POST-CHECK (2min) - AUTOMATISIERT** ⭐
- [ ] 3.1 Führe `npm run lint:all` aus → Alle Quality Checks auf einmal
- [ ] 3.2 Prüfe Knip-Ergebnisse: Sind neue ungenutzte Exports entstanden?
- [ ] 3.3 Prüfe JSCPD: Wurden neue Duplikate eingeführt?
- [ ] 3.4 Prüfe Ast-Grep: Neue console.log oder verbotene Patterns?
- [ ] 3.5 WARN VOR FEHLERN: "Das würde X brechen, weil Y".

### Integration der Tools im Detail

#### Knip (Dead Code Detection)
**Verwendung:**
```bash
npm run knip           # Analyse durchführen
npm run knip:fix       # Automatische Bereinigung
```

**Wichtige Hinweise:**
- Knip markiert manchmal dynamisch importierte Dateien als "ungenutzt" → Prüfe immer!
- Ignoriere generierte Dateien (`convex/_generated/`, `android/`, `ios/`)
- TypeScript-Only Imports können als ungenutzt markiert werden

**Aktion bei Befund:**
- Ungenutzte Datei = Prüfe ob wirklich nicht verwendet (dynamischer Import?)
- Ungenutzer Export = Entfernen oder in separate Datei auslagern
- Ungenutzte Dependency = Prüfe ob Dev-Dependency oder wirklich entfernen

#### JSCPD (Copy-Paste Detection)
**Verwendung:**
```bash
npm run jscpd          # Duplikate suchen
```

**Schwellenwerte:**
- Mindestens 5 Zeilen gleicher Code → Als Duplikat markiert
- Mindestens 50 Tokens → Für TypeScript/TSX

**Aktion bei Befund:**
- Extrahiere gemeinsame Logik in Helper-Funktionen
- Verwende Shared Components für wiederholte UI-Patterns
- Konsolidiere ähnliche Services/Hooks

#### Ast-Grep (Pattern Matching)
**Verwendung:**
```bash
npm run ast-grep       # Alle Regeln prüfen
npm run ast-grep:fix   # Automatische Fixes anwenden
```

**Aktive Regeln:**
- `rules/no-console-log.yml` → Warnt bei console.log vor Production

**Erweiterung möglich:**
Füge neue Regeln in `rules/` hinzu für:
- Verbotene API-Aufrufe
- Deprecations erkennen
- Sicherheitsprobleme

### Die 5 Säulen des Clean Code

1. **CLEAN CODE (DRY + KISS)**: Funktionen < 30 Zeilen, keine magischen Zahlen, aussagekräftige Namen.
2. **EINHEITLICHE LOGIK**: Early Returns, Switch-Statements, TypeScript überall, konsistentes Error-Handling.
3. **ARCHITEKTUR-ÜBERBLICK**: Separation of Concerns (Hooks/Services/Components). Stack: React Native/Capacitor → Supabase/Clerk.
4. **PERFORMANCE**: re-renders minimieren, useMemo/useCallback, lazy loading, optimierte Queries.
5. **MAINTAINABILITY**: Keine Inline Styles, Config Files statt Hardcoding, Type-Safety.

### Wichtige Regeln

- **Niemals ignorieren**: Warnings von `npm run lint:all` ohne Prüfung
- **Dynamische Imports**: Knip kann diese nicht erkennen → Manuelle Prüfung nötig
- **Neue Dependencies**: Immer `npm run knip` nach Installation neuer Packages ausführen
- **Pre-Commit**: Führe `npm run lint:all` vor jedem Commit aus

### Checklist für Code-Änderungen

```markdown
## Vor der Implementierung:
- [ ] `npm run knip` - Gibt es bereits ungenutzte Dateien im Scope?
- [ ] `npm run jscpd` - Gibt es bereits Duplikate im Scope?
- [ ] Architektur dokumentiert (Hooks/Services/Components)?

## Nach der Implementierung:
- [ ] `npm run lint:all` - Alle Checks erfolgreich?
- [ ] Keine neuen ungenutzten Exports (Knip)?
- [ ] Keine neuen Duplikate (JSCPD)?
- [ ] Keine vergessenen console.log (Ast-Grep)?
- [ ] TypeScript kompiliert ohne Fehler?
- [ ] Code entspricht den 5 Säulen?