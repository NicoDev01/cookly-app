# P1 – Refactoring & Code-Qualität

> Diese Punkte gefährden nicht unmittelbar Sicherheit oder Betrieb, kosten aber bei jeder
> Weiterentwicklung Zeit oder werden mit wachsender Nutzerzahl zum Problem.
> **Vor größeren Umbauten zuerst V1 (CI + Tests) aus 03-verbesserungen.md umsetzen.**

---

## R1 – Instagram-/Facebook-Importer sind zu ~70 % identisch

### Wo
`convex/instagram.ts` (1029 Zeilen) und `convex/facebook.ts` (948 Zeilen)

### Was
Beide Dateien enthalten dieselbe Pipeline: URL normalisieren → Apify-Actor aufrufen (primär +
Fallback) → besten Kandidaten scoren → Caption extrahieren → Gemini mit JSON-Schema →
`normalizeRecipeData` → Dedupe-Final-Check → Rezept anlegen/aktualisieren. Unterschiede sind im
Kern nur: Actor-Namen, URL-Kanonisierung, Caption-Pfade im Apify-Response.

### Warum
Jeder Bugfix und jede Prompt-Verbesserung muss doppelt gemacht werden; die Dateien driften
bereits auseinander (709 Zeilen Diff). Ein dritter Importer (TikTok? Pinterest?) würde das Problem
verdreifachen.

### Wie
1. Neues Modul `convex/socialImport.ts` (kein `"use node"`-Export nötig, reine Helfer):
   - Gemeinsame Typen (`RecipeData`, `ScrapedCandidate`), `RECIPE_RESPONSE_JSON_SCHEMA`,
     `normalizeRecipeData`, `normalizeInstructionIcon`/`inferInstructionIcon`,
     `deriveTitleFromCaption`, `isGenericRecipeTitle`, `runApifyActor`, `pickBestCandidate`,
     `scoreCandidate`, Gemini-Aufruf inkl. Recovery-Retry, der Dedupe-/Create-Block.
   - Plattform-Adapter als Parameter-Objekt: `{ canonicalizeUrl, isSupportedUrl,
     primaryActor, fallbackActor, captionPaths, promptTemplate, rateLimitBucket }`.
2. `instagram.ts` / `facebook.ts` schrumpfen auf: Adapter-Definition + `scrapePost`-Action,
   die den gemeinsamen Flow aufruft.
3. Verhalten darf sich nicht ändern → vorher die wichtigsten Helfer mit Unit-Tests abdecken
   (sie sind pure functions, ideal für `node --test`): `canonicalizeInstagramUrl`,
   `deriveTitleFromCaption`, `scoreCandidate`, `normalizeRecipeData`.

### Definition of Done
- [x] Beide Actions nutzen denselben Pipeline-Code, Dateien je < 300 Zeilen
- [x] Unit-Tests für die extrahierten Helfer grün
- [ ] Manueller Test: je 1 Instagram-Post, 1 Reel, 1 Facebook-Post, 1 Facebook-Reel importieren

**Aufwand:** ~2–3 Tage.

### ✅ Umgesetzt am 24.08.2026 (zusammen mit dem TikTok-Import)
- `convex/socialImport.ts` — Pipeline-Engine + `SocialPlatform`-Adaptertyp
- `convex/socialImportShared.ts` — reine Helfer (Scoring, Normalisierung, Extraktion)
- `convex/socialImportPrompts.ts` — Prompt-Vorlagen
- `convex/lib/socialUrls.ts`, `convex/lib/tiktokContent.ts` — Convex-freie, unit-getestete URL-/Content-Logik
- `instagram.ts` 1029 → 98 Zeilen, `facebook.ts` 948 → 115 Zeilen, neu `tiktok.ts` 156 Zeilen
- Tests: `utils/socialImportPipeline.test.mjs`, `utils/importTarget.test.mjs`

**Offen:** Der manuelle Regressionstest für Instagram/Facebook auf dem Gerät steht noch aus —
die Adapter wurden verhaltensgleich portiert, aber nicht gegen echte Posts nachgemessen.

---

## R2 – `AddRecipeModal.tsx` aufteilen (1044 Zeilen)

### Wo
`components/AddRecipeModal.tsx`; Teilauslagerung nach `components/addRecipeModal/` ist begonnen
(`ManualRecipeForm.tsx`, `ImageEditor.tsx`, `AiScan.tsx`, `aiScanRecipe.ts` + Tests existieren).

### Wie
Den eingeschlagenen Weg fortsetzen – Ziel-Struktur:
- `AddRecipeModal.tsx`: nur noch Tab-Container, Modal-Shell, gemeinsamer State (< 250 Zeilen)
- `addRecipeModal/useAiScan.ts`: Single- und Bulk-Scan-Flows (Progress-State, Fehlerbehandlung) –
  fällt mit K1 ohnehin an, da die Gemini-Calls dort durch Convex-Action-Aufrufe ersetzt werden
- `addRecipeModal/UrlImportTab.tsx`: Link-Import-UI
- Formular-State in einen Reducer oder eigenen Hook (`useRecipeFormState`) ziehen, statt
  vieler einzelner `useState`

### Definition of Done
- [ ] Keine Datei im Modal-Bereich > 400 Zeilen, Verhalten unverändert (manueller Smoke-Test
  aller drei Tabs: manuell / KI-Scan / URL-Import)

**Aufwand:** ~1–2 Tage. Sinnvoll **zusammen mit K1** erledigen.

---

## R3 – Unechte Pagination & ungenutzter Suchindex

### Wo
- `convex/recipes.ts`: `list` (~91), `listPaginated` (~145), `getCategoryStats` (~223)
- `convex/schema.ts:113`: `searchIndex("search_title")` ist definiert, wird aber nirgends benutzt

### Was
`listPaginated` lädt **alle** Rezepte des Users (`collect()`), filtert die Suche in-memory und
schneidet dann `slice(0, limit)` ab. `hasMore`/`total` erzwingen das Komplett-Laden. Zusätzlich
wird pro Rezept mit `imageStorageId` einzeln `ctx.storage.getUrl()` aufgerufen.

### Warum
Bei Power-Usern (500+ importierte Rezepte) steigen Latenz und Convex-Bandbreitenkosten linear;
jede Änderung an irgendeinem Rezept invalidiert die große Query (Reaktivität auf das gesamte
Result-Set).

### Wie
1. `listPaginated` auf Convex-Cursor-Pagination umstellen:
   `ctx.db.query("recipes").withIndex("by_user", …).order("desc").paginate(args.paginationOpts)`;
   im Frontend `usePaginatedQuery` aus `convex/react` verwenden (betrifft `CategoryRecipesPage`,
   `FavoritesPage` u. a.).
2. Suche auf den vorhandenen Suchindex umstellen:
   `withSearchIndex("search_title", q => q.search("title", args.search))` –
   Achtung: Suchindex braucht ggf. ein `filterField` für `userId`
   (`searchIndex("search_title", { searchField: "title", filterFields: ["userId"] })` im Schema
   ergänzen, dann `.eq("userId", userId)` im Search-Query).
3. `total`-Anzeigen entweder aus `categoryStats` speisen oder entfernen.

### Definition of Done
- [ ] Keine `collect()`-Aufrufe mehr in Listen-Queries, die unbegrenzt wachsen können
- [ ] Suche nutzt den Suchindex und ist weiterhin user-isoliert (Test mit 2 Accounts!)

**Aufwand:** ~2 Tage (inkl. Frontend-Anpassung auf `usePaginatedQuery`).

---

## R4 – Doppelte Buchführung bei Kategorien

### Wo
- Tabelle `categoryStats` (Schema ~160) – inkrementell gepflegt über `adjustCategoryCount`
  (`convex/recipes.ts:26`)
- `recipes.getCategoryStats` (~223) – zählt live aus den Rezepten
- `recipes.backfillCategoryStats` (~614) – Reparatur-Tool (Existenz deutet auf frühere Drift hin)
- `categories.deleteCategory` löscht die Kategorie, aber **nicht** den zugehörigen
  `categoryStats`-Eintrag → gelöschte Kategorie mit Rezepten taucht in
  `getCategoriesWithStats` wieder auf (Counts aus Stats + Default-Icon)

### Wie
Eine Wahrheitsquelle wählen. Empfehlung: `categoryStats` behalten (vermeidet Full-Scans),
aber konsequent machen:
1. `getCategoryStats` auf `categoryStats`-Tabelle umstellen (statt Rezepte zu zählen).
2. `deleteCategory` definieren: Was soll mit Rezepten der Kategorie passieren?
   (a) Rezepte auf "Sonstiges" umhängen + Stats anpassen, oder (b) Löschen nur erlauben,
   wenn `count == 0`. Entscheidung treffen und implementieren – aktuell ist das Verhalten
   undefiniert/inkonsistent.
3. `backfillCategoryStats` als Admin-/Migrationsfunktion in `internalMutation` umwandeln
   (aktuell kann jeder eingeloggte User sie aufrufen – harmlos, aber unsauber).

**Aufwand:** ~1 Tag.

---

## R5 – `QueryCacheContext` überdenken

### Wo
`contexts/QueryCacheContext.tsx` + Verwendungen in den Pages

### Was
Handgebauter 5-Minuten-SWR-Cache (`any`-typisiert) über dem Convex-Client, der selbst schon
Subscriptions cached und Updates pusht. Der Cache wird beim **Logout nicht geleert** →
auf einem geteilten Gerät kann Account B kurzzeitig gecachte Daten von Account A sehen
(Datenleck, wenn auch klein).

### Wie
1. Kurzfristig: in der Logout-Logik (`ProfilePage` / überall wo `signOut` aufgerufen wird)
   `clearCache()` aufrufen.
2. Mittelfristig: messen, ob der Cache überhaupt noch etwas bringt (Convex hält Subscriptions
   bei Tab-Wechseln innerhalb der SPA ohnehin warm, solange die Komponenten gemountet bleiben).
   Falls der Nutzen nur "letzter Stand beim Remount" ist: `useQueries`-Helper aus
   `convex-helpers` oder schlicht React-State-Hoisting erwägen und den Custom-Cache löschen.

**Aufwand:** Quick-Fix 1 Stunde; Evaluation ~0,5 Tag.

---

## R6 – `any`-Typen in Convex-Helfern

### Wo
- `convex/recipes.ts`: `getAuthenticatedUserId(ctx: any)`, `adjustCategoryCount(ctx: any, …)`,
  `ensureCategoryExists(ctx: any, …)`, `insertRecipe(ctx: any, …)`
- `convex/weekly.ts`: gleiche Helper-Kopie mit `any`
- `convex/categories.ts` macht es **richtig** (`QueryCtx | MutationCtx`) → als Vorlage nehmen

### Wie
1. Die dreifach kopierte `getAuthenticatedUserId`-Funktion (recipes/weekly/categories) in ein
   gemeinsames `convex/lib/auth.ts` ziehen, typisiert mit `QueryCtx | MutationCtx`.
2. Übrige Helper auf `MutationCtx` typisieren; `args: any` durch abgeleitete Typen ersetzen.

**Aufwand:** ~0,5 Tag. Guter Einstiegs-Task, reduziert Folgefehler bei R3/R4.

---

## R7 – ESLint: 89 Fehler / 13 Warnungen

### Wo
`npm run lint` – Schwerpunkte: `no-var`, `prefer-const`, `@typescript-eslint/no-explicit-any`,
verteilt über Pages/Hooks/`prefetch.ts`.

### Wie
1. `npm run lint -- --fix` (behebt ~15 automatisch).
2. Rest manuell; `any`-Fixes überschneiden sich mit R6.
3. Danach Lint in CI verpflichtend machen (siehe V1), damit der Stand gehalten wird.

**Aufwand:** ~0,5–1 Tag.

---

## R8 – Tote/legacy Artefakte entfernen

| Artefakt | Befund | Aktion |
|---|---|---|
| `convex.config.ts` (Root) | Tote Clerk-Config (siehe K5.2) | Löschen/korrigieren |
| `clerkId`-Felder in `convex/schema.ts` | LEGACY-Kommentare, Migration scheint abgeschlossen | Prüfen ob noch Dokumente mit `clerkId` existieren; falls nein: Felder + zugehörige Code-Pfade entfernen |
| `convex/migrateUserStats.ts` | Einmal-Migration (alte → neue usageStats) | Nach Verifikation auf Prod löschen |
| `convex/unsplashHelper.ts` | Fallback-Helfer; Verwendung unklar | `npx knip` prüfen; ungenutzt → löschen |
| `docs/IOS_GUIDE.md` | Veraltet (referenziert Clerk statt Convex Auth) | Durch [04-ios-port-guide.md](04-ios-port-guide.md) ersetzt → löschen oder Verweis einfügen |
| `CHANGELOG.md` | Einträge seit 1.4.x nur "TODO"-Platzhalter | Pflegen oder Template aus `scripts/version-upgrade.js` entschärfen |
| `vite-dev.log`, `vite-dev.err.log`, `tsconfig.tsbuildinfo` im Root | Build-Artefakte | In `.gitignore` aufnehmen / löschen |

**Aufwand:** ~0,5 Tag.

---

## R11 – Duplizierte Logik zusammenführen (Nachtrag aus dem Logik-Review)

Vier Stellen, an denen dieselbe Logik mehrfach existiert und **auseinanderdriften kann** –
das gefährlichste Muster, weil ein Fix an einer Stelle die andere nicht mitnimmt:

1. **Einkaufslisten-Key-Logik doppelt (Client + Server!):**
   `buildShoppingItemKey` / `buildLegacyShoppingItemKeys` existieren in
   [convex/shopping.ts:9-22](../../convex/shopping.ts) **und** in
   [utils/shoppingListView.ts:104-115](../../utils/shoppingListView.ts) – sogar mit
   **unterschiedlichen Signaturen** (Client-Version hat einen ignorierten `_amount`-Parameter).
   Die Optimistic Updates in `Ingredients.tsx` hängen davon ab, dass beide Versionen exakt
   dieselben Keys produzieren – driftet das, erscheinen Geister-Einträge auf der Liste.
   → In ein gemeinsames Modul ziehen (`utils/shoppingKeys.ts`), das **beide** Seiten
   importieren (Convex kann aus `utils/` importieren, solange kein Node-/DOM-Code drin ist).
   Die bestehenden Tests in `shoppingListView.test.mjs` decken dann beide Seiten ab.
2. **Datums-/Wochenlogik doppelt:** Montags-Berechnung (inkl. Sonntag-Edge-Case) und
   `formatDate` (YYYY-MM-DD, lokale Zeit) stehen identisch in
   [WeeklyPage.tsx:13-51](../../pages/WeeklyPage.tsx) und
   [MealPlanModal.tsx:47-95](../../components/MealPlanModal.tsx).
   → `utils/week.ts` mit `getWeekStart(date)`, `formatLocalDate(date)`, `getWeekDays(start)`
   + Unit-Tests (Datums-Edge-Cases: Jahreswechsel, Sonntag, Zeitumstellung).
3. **`getAuthenticatedUserId` vierfach kopiert:** in `recipes.ts`, `weekly.ts` (beide mit
   `any`), `categories.ts`, `shopping.ts` (beide typisiert). Bereits Teil von R6 –
   hier explizit: Ziel ist **eine** Implementierung in `convex/lib/auth.ts`.
4. **Strukturierte-Fehler-Parsing doppelt:** das `JSON.parse(err.message)` +
   `LIMIT_REACHED`/`RATE_LIMIT_EXCEEDED`/`API_UNAVAILABLE`-Switch existiert in
   [ShareTargetPage.tsx:235-276](../../pages/ShareTargetPage.tsx) und
   [AddRecipeModal.tsx:857-898](../../components/AddRecipeModal.tsx).
   → Wird durch `utils/userErrors.ts` (08/U2) zentralisiert – bei der Umsetzung beide
   Stellen umstellen, nicht nur neue Texte einsetzen.

**Aufwand:** ~1 Tag gesamt; Punkte 1+2 sind reine Pure-Function-Extraktionen mit Tests
(risikoarm, gute Einsteiger-Tasks).

---

## R9 – Kleinere Performance-Punkte (gesammelt)

1. **`weekly.getWeek`** (`convex/weekly.ts`): lädt alle `weeklyMeals` des Users und filtert
   das Datum in-memory. Der Index `by_user_date` unterstützt Range-Queries:
   `q.eq("userId", userId).gte("date", args.startDate).lte("date", args.endDate)`.
2. **`categories.getCategoriesWithStats`**: N+1-Muster – pro Kategorie 4 Rezepte + Storage-URLs.
   Wird beim App-Start vorgeladen (App.tsx:251f). Bei vielen Kategorien spürbar →
   Rezept-Vorschaubilder einmalig pro Kategorie denormalisieren (z. B. `previewImages`-Feld
   an der Kategorie pflegen) oder Query in zwei Stufen aufteilen (Liste sofort, Bilder lazy).
3. **`recipes.deleteStorageFile` / `getStorageUrl`**: laden alle User-Rezepte zur
   Ownership-Prüfung. Funktioniert, ist aber O(n) – bei R3 gleich mit auf einen Index/
   `filter`-freien Lookup umstellen.
4. **`recipes.deleteRecipes`** (Bulk-Delete): sequentielle Loop-Deletes; bei großen Mengen
   Convex-Mutation-Limits beachten → Batching (z. B. 50er-Chunks vom Client).

**Aufwand:** je ~1–3 Stunden, unabhängig voneinander machbar.
