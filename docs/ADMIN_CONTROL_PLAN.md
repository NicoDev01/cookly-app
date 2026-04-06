# Admin Control Plan (Cookly)

## Ziel
Dieses Dokument hält die geplante Admin-Kontrollstruktur für später fest:
- Admin-Operationen per Terminal (schnell, sicher, wartbar)
- Optionales Admin-Dashboard in der App
- Saubere Rollen-/Rechteprüfung
- Sichere Lösch- und Migrations-Workflows

Status: **Planung / noch nicht implementiert**

---

## Grundprinzip
Nur ein zentraler Backend-Kern führt kritische Aktionen aus (z. B. User-Cascade-Delete).  
Alle Wege (Self-Service, Admin-Terminal, späteres Admin-UI) rufen denselben Kern auf.

Damit vermeiden wir doppelte Logik und Inkonsistenzen.

---

## Rollenmodell (geplant)
- `user`: Standardnutzer
- `admin`: App-Admin mit erweiterten Rechten

Empfohlene Admin-Erkennung:
1. Primär: `users.role === "admin"`
2. Fallback/Bootstrap: ENV-Liste `ADMIN_AUTH_USER_IDS`

Wichtig: Rechte **immer serverseitig** prüfen.

---

## Geplante Convex-Funktionen

## Interne Kernfunktion
- `internal.users.deleteUserCascade({ targetUserId, reason, deletedBy })`

Verantwortung:
- Löscht nur Daten des Zielusers (Recipes, Weekly, Shopping, Categories, Stats, Auth-Artefakte, Storage-Referenzen)
- Schreibt Audit-Log
- Gibt strukturiertes Ergebnis zurück (`deletedCounts`, `success`, `warnings`)

---

## Öffentliche User-Funktion
- `users.deleteCurrentUser()`

Verhalten:
- Ermittelt den aktuellen User aus Auth
- Ruft `internal.users.deleteUserCascade(...)` für genau diesen User auf

---

## Admin-Funktionen
- `admin.deleteUserAsAdmin({ targetUserId, reason, confirmText })`
- `admin.listUsers({ search, limit, cursor })`
- `admin.getUserDetails({ targetUserId })`
- `admin.runMigrationJob({ jobName, dryRun })`
- `admin.getAuditLogs({ targetUserId, action, since, limit })`

Sicherheitsregeln:
- `requireAdmin(ctx)` vor jeder Admin-Operation
- Für destructive Aktionen zusätzliches Confirm-Feld (`confirmText === "DELETE"`)
- Audit-Log Pflicht

---

## Audit / Nachvollziehbarkeit
Geplante Tabelle: `auditLogs`

Beispiel-Felder:
- `action` (`admin.delete_user`, `admin.run_migration`, ...)
- `actorUserId`
- `targetUserId`
- `reason`
- `createdAt`
- `metadata` (optional)

---

## Zugriff 1: Admin per Terminal (zuerst)

## Warum zuerst Terminal?
- Schnell verfügbar
- Geringste Angriffsfläche
- Kein UI-Aufwand

Beispiel-Calls (später):
```bash
npx convex run admin:listUsers '{"search":"gmail.com","limit":20}'
npx convex run admin:deleteUserAsAdmin '{"targetUserId":"<id>","reason":"GDPR request","confirmText":"DELETE"}'
npx convex run admin:runMigrationJob '{"jobName":"cleanup_legacy_weeklyPlans","dryRun":true}'
```

---

## Zugriff 2: Admin-Dashboard (optional, später)

## Route-Plan (Frontend)
- `/admin` -> Dashboard Overview
- `/admin/users` -> User-Suche/Liste
- `/admin/users/:id` -> User-Detail + Aktionen
- `/admin/migrations` -> Migrations/Jobs
- `/admin/audit` -> Audit-Logs

## Routing-Schutz
- `AdminProtectedLayout` analog zu `ProtectedLayout`
- Ohne Admin-Rechte: Redirect auf `/tabs/categories` oder 403-Seite

---

## UI-Funktionen im Admin-Dashboard
- User suchen (E-Mail, Name, ID)
- User-Detail anzeigen
- User-Löschung mit Doppelbestätigung
- Migrationsjob starten (dry-run / execute)
- Ergebnis-/Audit-Logs einsehen

Für Löschaktionen:
1. Warnhinweis (irreversibel)
2. Confirm-Eingabe (`DELETE`)
3. Ergebnis-Report (`deleted counts`)

---

## Migration-/Cleanup-Strategie
Für spätere Legacy-Bereinigungen:
1. Dry-Run-Funktion bauen
2. Ergebnisse loggen
3. Execute-Run
4. Post-Run-Validierung

Beispieljobs:
- `cleanup_legacy_weeklyPlans`
- `cleanup_orphaned_storage_refs`
- `backfill_user_role_defaults`

---

## Sicherheitsanforderungen (Muss)
- Kein Admin-Entscheid im Client
- Keine freie `targetUserId`-Operation ohne `requireAdmin`
- Rate Limit auch auf Admin-Endpoints
- Idempotente Jobausführung, wo möglich
- Audit-Log für jede destructive Aktion

---

## Implementierungs-Reihenfolge (empfohlen)
1. `requireAdmin` + Rollenquelle (`users.role` + ENV fallback)
2. `auditLogs` Tabelle + Logger-Helper
3. `internal.users.deleteUserCascade`
4. `admin.deleteUserAsAdmin` + Terminal-Flow
5. `admin.listUsers` / `admin.getUserDetails`
6. Optional: Admin-Frontend-Routes + Dashboard

---

## Done-Kriterien
- Admin kann User per Terminal sicher löschen
- Nur Zieluser-Daten werden gelöscht
- Audit-Einträge vorhanden
- Dry-run + execute für Migrationen vorhanden
- Keine Rechteeskalation über Client möglich

