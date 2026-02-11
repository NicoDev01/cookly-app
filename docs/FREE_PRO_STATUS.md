# Cookly Free/Pro System - Aktueller Stand

**Datum:** 2026-02-08
**Version:** 2.1 - Unified Limits & Admin Controls (Optimiert)

---

## 1. ÜBERSICHT

Das Subscription-System von Cookly basiert auf einer **freemium** Struktur mit einem Free-Tier (Lifetime Limits) und Pro-Tarifen (Unlimited). Die Validierung ist mehrstufig (Frontend + Backend).

### Subscription-Typen

| Typ | Wert | Status | Bedeutung |
|-----|------|--------|-----------|
| Free | `free` | `active` | Kostenlose Basis-Version mit Lifetime Limits (100 pro Kategorie) |
| Pro Monatlich | `pro_monthly` | `active` | Unbegrenzter Zugang, monatlich kündbar |
| Pro Jährlich | `pro_yearly` | `active` | Unbegrenzter Zugang, jährlich kündbar (Rabatt) |

---

## 2. LIMITS & TRACKING

Jedes Feature hat seinen **eigenen Counter** im `usageStats` Objekt des Users.

| Feature | Typ | Free Limit | Pro Limit | Erkennung Logik |
|---------|-----|------------|-----------|-----------------|
| **Manuelle Rezepte** | `manualRecipes` | 100 | Unlimited | Kein URL-Import, kein KI-Foto-Scan |
| **Link-Imports** | `linkImports` | 100 | Unlimited | `sourceUrl` ist gesetzt (Web/IG) |
| **KI-Foto-Scans** | `photoScans` | 100 | Unlimited | `sourceImageUrl` ist gesetzt oder AI-Scan Tab aktiv |

**WICHTIG:** Limits sind unabhängig. Ein User kann insgesamt 300 Aktionen haben (100+100+100).

---

## 3. WORKFLOW & LOGIK

### 3.1 Proaktive Prüfung (Frontend)
**Datei:** `components/AddRecipeModal.tsx`
Bevor ein Rezept gespeichert wird, prüft das Frontend proaktiv den Status:
1.  Identifikation des Feature-Typs basierend auf den Formulardaten.
2.  Abfrage der entsprechenden Convex-Query (`canCreateManualRecipe`, etc.).
3.  Falls `canProceed === false`, wird das **UpgradeModal** eingeblendet und der Speicherprozess gestoppt.

### 3.2 Reaktive Prüfung (Backend)
**Datei:** `convex/recipes.ts`
Die Mutation `create` erzwingt das Limit serverseitig:
1.  Check: Ist der User "free"?
2.  Check: Ist das Limit für den erkannten `featureType` erreicht?
3.  Falls ja: Throw `Error(JSON.stringify({ type: "LIMIT_REACHED", ... }))`.

### 3.3 Atomic Counting (Sicherheit)
Wir nutzen ein **"Post-Insert-Increment"** Pattern:
1.  Rezept wird erfolgreich in die Datenbank geschrieben.
2.  Erst danach wird `internal.users.incrementUsageCounter` aufgerufen.
3.  Da Convex Transaktionen atomar sind, führt ein Fehler beim Inkrementieren zum Rollback des Rezept-Inserts (und umgekehrt). **Keine Double-Counts, kein Credit-Verlust.**

---

## 4. WICHTIGE DATEIEN & FUNKTIONEN

### Backend (Convex)
*   `convex/schema.ts`: Definition des `usageStats` Objekts.
*   `convex/users.ts`: 
    *   `FREE_LIMITS`: Zentrale Konstante für alle Limits (aktuell überall 100).
    *   `canCreateManualRecipe` / `canImportFromLink` / `canScanPhoto`: Proaktive Queries für das Frontend.
    *   `setUsageStats`: **Admin-Mutation** zum manuellen Setzen von Counter-Werten.
*   `convex/recipes.ts`: Zentrale `create`-Logik mit Feature-Typ-Erkennung und Enforcement.

### Frontend (React)
*   `pages/ProfilePage.tsx`: Anzeige der Progress-Bars. Nutzt die echten Backend-Limits (keine Magic Numbers!).
*   `components/AddRecipeModal.tsx`: Gatekeeper für die Erstellung. Steuert das Upgrade-Modal.
*   `components/UpgradeModal.tsx`: Visuelles UI für Limit-Überschreitungen.

---

## 5. ADMIN CONTROLS

Es wurde eine Admin-Schnittstelle geschaffen, um Support-Fälle oder manuelle Boni zu ermöglichen.

**Mutation:** `setUsageStats`
Ermöglicht das Überschreiben der Counter für einen spezifischen User via `clerkId`.

**Beispiel via CLI:**
```bash
npx convex run users:setUsageStats '{ "clerkId": "user_2...", "manualRecipes": 0 }'
```

---

## 6. ZU BEACHTEN BEI ÄNDERUNGEN

1.  **Limits ändern:** Nur die Konstante `FREE_LIMITS` in `convex/users.ts` anpassen. Das Frontend zieht sich die Werte automatisch.
2.  **Fehlerbehandlung:** Wenn du neue Fehlertypen im Backend einführst, stelle sicher, dass sie als JSON-String geworfen werden, damit das Frontend (z.B. in `ShareTargetPage.tsx` oder `AddRecipeModal.tsx`) sie korrekt parsen kann.
3.  **Pro Status:** Prüfe immer gegen `user.subscription !== "free"`, um sicherzustellen, dass Pro-User niemals blockiert werden.

---
*Stand: 2026-02-08 | Architektur-Review abgeschlossen.*

