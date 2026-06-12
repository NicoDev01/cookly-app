# Logik-Review – Bugs & Root Cause (Tiefenprüfung 12.06.2026)

> **Scope:** Zweiter, zeilengenauer Durchgang durch die gesamte Frontend-Logik
> (AddRecipeModal komplett, ShareTargetPage komplett, WeeklyPage, MealPlanModal, TabsLayout,
> SubscribePage, ProfilePage, CategoriesPage, Shopping-Flow, Back-Button-Cluster, Auth-Seiten,
> Notifications) sowie die restlichen Backend-Teile (shopping.ts, users.ts komplett,
> instagram.ts komplett, facebook.ts-Spezifika). Damit ist der Code vollständig auditiert.
>
> Ergebnis: **7 konkrete Logik-Bugs (B1–B7)** und **eine Root Cause (R10)**, die erklärt,
> warum der Compiler sie nicht gemeldet hat. Die App „funktioniert", weil die Bugs in
> selten genutzten Pfaden liegen oder still degradieren – genau deshalb sind sie bisher
> nicht aufgefallen.

---

## Umsetzungsstatus 2026-06-12

| Punkt | Status | Umsetzung | Offen |
|---|---|---|---|
| B1 | ✅ umgesetzt | `isInWeeklyList` aus beiden Foto-Scan-`createRecipe`-Pfaden entfernt; Regressionstest gegen unbekannte Convex-Argumente ergänzt | Gerätetest: Bulk-Scan mit 3 Bildern und Auto-Save-Pfad |
| B2 | ✅ umgesetzt | Abo-Status über `getSubscriptionViewState`; `undefined` lädt, fehlendes `subscription` gilt als `free`; Page zeigt während Ladezustand keinen Pro-Verwaltungszustand | Browser-/Geräte-Smoke-Test bei langsamem Netz |
| B3 | ✅ Variante A umgesetzt | `amount` wird in `shoppingItems` persistiert, bei Legacy-Migrationen erhalten und in der Einkaufsliste angezeigt | Bestehende Legacy-Daten ohne `amount` bleiben unverändert |
| B4 | ✅ umgesetzt | Limit-Check nutzt `addModalImportUrl` statt Phantomfeld `formData.sourceUrl` | Import-Limit-UX im Modal manuell testen |
| B5 | ✅ Symptom entfernt, R4 bleibt offen | Unerreichbarer clientseitiger `backfillCategoryStats`-Trigger entfernt, damit keine schwere Mutation durch falsches Signal feuert | R4: eine belastbare Wahrheitsquelle/Reparaturstrategie für Kategorie-Zähler |
| B6 | ✅ umgesetzt | Formular-Defaults und manueller Kategorie-Abbruch nutzen die kanonische Kategorie `Sonstiges`; Regressionstest ergänzt | Optionale Bestandsdaten-Migration `Hauptgericht` → `Sonstiges` bleibt Produktentscheidung |
| B7 | ✅ umgesetzt | Ein globaler Capacitor-Back-Button-Listener mit Override-Registry; ShareTargetPage nutzt Override statt eigenem Listener; toter Legacy-Service gelöscht | Gerätetest: Share-Import abbrechen während Import läuft |
| R10 | ✅ umgesetzt | `tsconfig.app.json` auf `strict: true`; Strict-Fehler in App, Convex, Capacitor und Stripe bereinigt; Regressionstest ergänzt | `noUnusedLocals`/`noUnusedParameters` bleiben als separater Cleanup-Schritt |

---

## B1 – Bulk-Foto-Scan & Auto-Save erzeugen ungültige Convex-Argumente 🔴

### Wo
[components/AddRecipeModal.tsx:435](../../components/AddRecipeModal.tsx) und
[:519](../../components/AddRecipeModal.tsx) – beide `createRecipe(...)`-Aufrufe übergeben
`isInWeeklyList: false`.

### Was
`recipes.create` ([convex/recipes.ts:250](../../convex/recipes.ts)) kennt **kein** Argument
`isInWeeklyList`. Convex validiert Argumente strikt – unbekannte Felder führen zu einem
`ArgumentValidationError` zur **Laufzeit**. Betroffen sind genau zwei Pfade:
1. Einzel-Foto-Scan mit deaktiviertem „Nach Scan bearbeiten" (`editAfterScan === false`) –
   der Auto-Save-Pfad
2. **Jeder Bulk-Foto-Upload** (jedes Bild würde im `catch` als Fehler gezählt →
   „Bulk-Upload abgeschlossen, aber es konnte kein Rezept erstellt werden.")

Der Standardpfad (Scan → Formular → Speichern) ist **nicht** betroffen, weil `handleSave`
das Feld nicht übergibt – deshalb ist der Bug im Alltag unsichtbar.

### Wie fixen
1. `isInWeeklyList: false` aus beiden Aufrufen entfernen (das Feld hat im Datenmodell keine
   Entsprechung; Wochenplan läuft über die `weeklyMeals`-Tabelle).
2. **Vorher am Gerät verifizieren** (Bulk-Scan mit 2 Bildern starten und Convex-Logs
   beobachten), damit der Fix den dokumentierten Fehler nachweislich behebt.

### Definition of Done
- [ ] Bulk-Scan mit 3 Bildern erstellt 3 Rezepte ohne Fehlerzähler
- [ ] Einzel-Scan mit ausgeschaltetem „Nach Scan bearbeiten" speichert direkt
- [x] Kein Foto-Scan-`createRecipe`-Aufruf übergibt `isInWeeklyList`

**Aufwand:** 15 Minuten + Gerätetest. **Schweregrad:** Hoch (Kernfeature-Pfad defekt).

---

## B2 – SubscribePage hält Free-User für Pro 🔴

### Wo
[pages/SubscribePage.tsx:44](../../pages/SubscribePage.tsx):
`const isPro = currentUser?.subscription !== "free";`

### Was
Zwei Fälle ergeben fälschlich `true`:
1. **Während des Ladens** (`currentUser === undefined` → `undefined !== "free"` → `true`)
2. **User ohne gesetztes `subscription`-Feld** (Schema-Feld ist optional; Alt-Accounts vor
   `createOrSyncUser`-Befüllung)

Folge: Die Seite zeigt diesen Nutzern die Pro-Ansicht („Abo verwalten") statt der
Kauf-Buttons – im schlimmsten Fall kann ein zahlungswilliger Nutzer **nicht abonnieren**.
[ProfilePage.tsx:82](../../pages/ProfilePage.tsx) löst es korrekt über ein
`safeCurrentUser`-Default-Objekt; das Backend nutzt durchgehend `?? "free"`.

### Wie fixen
```ts
const isLoadingUser = currentUser === undefined;
const isPro = (currentUser?.subscription ?? "free") !== "free";
// Während isLoadingUser: Spinner statt Pro-/Free-UI rendern
```

### Definition of Done
- [x] Free-Account sieht beim Öffnen der Seite im Ladezustand nicht die Pro-Ansicht
- [x] Testfall: User-Dokument ohne `subscription`-Feld → Kauf-Buttons sichtbar

**Aufwand:** 30 Minuten. **Schweregrad:** Hoch (blockiert potenziell Umsatz).

---

## B3 – Einkaufslisten-Mengen gehen verloren 🟠

### Wo
- [convex/shopping.ts:108](../../convex/shopping.ts) `addShoppingItem` und
  [:158](../../convex/shopping.ts) `toggleShoppingItemByDetails`: nehmen `amount` als
  Argument an, **speichern es aber nicht** (`ctx.db.insert` ohne `amount`-Feld, obwohl das
  Schema es vorsieht)
- [components/Ingredients.tsx:31](../../components/Ingredients.tsx): Optimistic Update setzt
  sogar explizit `amount: undefined`

### Was
Wer „200 g Mehl" aus einem Rezept auf die Einkaufsliste setzt, sieht dort nur „Mehl".
Die `ShoppingPage` rendert keine Mengen (kann sie nicht – sie sind nie da). Die
Legacy-Key-Funktionen (`buildLegacyShoppingItemKeys` mit Amount-Anteil) zeigen, dass Mengen
früher gespeichert wurden – das ist bei einem Refactoring stillschweigend entfallen.

### Wie fixen (Entscheidung nötig)
- **Variante A (empfohlen):** `amount` wieder persistieren (`insert` um
  `amount: args.amount` ergänzen, Patch-Pfade ebenso) und in der ShoppingPage anzeigen.
  Spielt direkt mit F2 (Portionen-Skalierung) und F4 (Woche→Liste) zusammen.
- **Variante B:** Bewusst ohne Mengen → dann den toten `amount`-Parameter aus Mutations,
  Optimistic Update und `Ingredients.tsx` entfernen, damit der Code die Wahrheit sagt.

### Definition of Done
- [x] Mengen sichtbar auf der Liste (Variante A)
- [x] Bestehende Unit-Tests in `utils/shoppingListView.test.mjs` angepasst

**Aufwand:** A ~0,5 Tag / B ~1 h.

---

## B4 – Toter Limit-Check-Zweig durch nicht existierendes Feld 🟡

### Wo
[components/AddRecipeModal.tsx:732](../../components/AddRecipeModal.tsx):
`if (formData.sourceUrl)` – der Form-State **hat kein Feld `sourceUrl`** (nur
`sourceImageUrl`). Der Ausdruck ist immer `undefined`.

### Was
Der proaktive `canImportFromLink`-Check in `handleSave` kann nie greifen; Link-Imports im
Modal laufen ohne Vorab-Limit-Prüfung (das Backend-Limit greift weiterhin – der Nutzer
bekommt den Fehler nur später und unschöner). Klassischer Bug, den `strict: true`
gemeldet hätte (→ R10).

### Wie fixen
Feature-Erkennung auf existierende Signale stützen, z. B. `addModalImportUrl` aus dem
ModalContext bzw. ein explizites `importMode`-Flag im State – nicht auf ein Phantom-Feld.

**Aufwand:** 30 Minuten. 

---

## B5 – Backfill-Trigger kann mathematisch nie feuern 🟡

### Wo
[pages/CategoriesPage.tsx:101-108](../../pages/CategoriesPage.tsx) ruft
`backfillCategoryStats()` auf, wenn `categoriesWithStats.length > 0 && totalCount === 0`.

### Was
`getCategoriesWithStats` ([convex/categories.ts](../../convex/categories.ts)) filtert
serverseitig `count > 0` heraus. Wenn das Array nicht leer ist, ist `totalCount` zwingend
≥ 1 → die Bedingung ist **unerfüllbar**, die „Migration für Bestandsnutzer" läuft nie.
Harmlos im Alltag, aber: Nutzer, deren Stats tatsächlich inkonsistent sind (das Szenario,
für das der Code existiert), werden nicht repariert.

### Wie fixen
Im Zuge von R4 (eine Wahrheitsquelle für Kategorie-Zähler) ersatzlos streichen – oder, falls
die Reparatur gewollt ist, das Signal korrekt wählen (z. B. Vergleich
`recipes.getCategoryStats.total` vs. Summe der `categoryStats`). Nicht isoliert „fixen",
sonst feuert eine schwere Mutation plötzlich bei vielen Nutzern gleichzeitig.

**Aufwand:** in R4 enthalten.

---

## B6 – Default-Kategorie „Hauptgericht" existiert nicht im Kategorien-Kanon 🟡

### Wo
[components/AddRecipeModal.tsx:227](../../components/AddRecipeModal.tsx) und
[:287](../../components/AddRecipeModal.tsx): `category: 'Hauptgericht'` als Formular-Default.

### Was
`RECIPE_CATEGORIES` ([convex/constants.ts:19](../../convex/constants.ts)) kennt
„Hauptgericht" nicht (Importe normalisieren auf Pasta/Salat/…/Sonstiges). Manuell erstellte
Rezepte mit unverändertem Default landen in einer Kategorie, die kein Import je erzeugt –
die Kategorienliste fragmentiert (zwei Welten: Import-Kategorien vs. Manuell-Kategorien).

### Wie fixen
Default auf `'Sonstiges'` ändern (oder Dropdown ohne Vorauswahl mit Pflichtfeld).
Bestandsdaten: optionale Mini-Migration „Hauptgericht" → „Sonstiges" oder bewusst belassen.

### Definition of Done
- [x] Neue manuelle Rezepte starten mit `Sonstiges`
- [x] Kategorie-Abbruch fällt auf `Sonstiges` zurück
- [x] Regressionstest verhindert erneute Nutzung von `Hauptgericht` als Default

**Aufwand:** 15 Minuten (+ optionale Migration).

---

## B7 – Konkurrierende Back-Button-Handler + tote Implementierung 🟡

### Wo
- [hooks/useBackButton.ts](../../hooks/useBackButton.ts) – globaler Handler (App.tsx)
- [pages/ShareTargetPage.tsx:289-303](../../pages/ShareTargetPage.tsx) – registriert
  **zusätzlich** einen eigenen `backButton`-Listener während des Imports
- [services/backButtonHandler.ts](../../services/backButtonHandler.ts) – **wird von niemandem
  importiert** (toter Code; wäre mit HashRouter ohnehin defekt, da er
  `window.location.pathname` statt des Hash liest)

### Was
Capacitor ruft **alle** registrierten `backButton`-Listener auf. Während eines laufenden
Imports feuern also beide: ShareTargetPage will die App schließen (`exitApp`), der globale
Handler navigiert parallel zu `/tabs/categories`. In der Praxis „gewinnt" exitApp, aber das
Verhalten ist undefiniert und bricht, sobald einer der Handler geändert wird.

### Wie fixen
1. `services/backButtonHandler.ts` löschen (tot).
2. Eine einzige Back-Button-Quelle: `useBackButton` um eine Priority-/Override-Mechanik
   erweitern (z. B. Context mit `registerBackOverride(fn)`), die ShareTargetPage nutzt,
   statt einen zweiten Capacitor-Listener zu registrieren.

### Definition of Done
- [x] Nur `useBackButton` registriert einen Capacitor-`backButton`-Listener
- [x] ShareTargetPage registriert nur noch einen globalen Override
- [x] `services/backButtonHandler.ts` gelöscht
- [x] Back-Navigation ist in `services/backNavigation.ts` isoliert und getestet

**Aufwand:** ~2–3 h.

---

## R10 – Root Cause: `"strict": false` in der TypeScript-Konfiguration 🔴 (wichtigster zusätzlicher Refactor)

### Wo
[tsconfig.app.json](../../tsconfig.app.json): `"strict": false`, zusätzlich
`"noUnusedLocals": false`, `"noUnusedParameters": false`.

### Was / Warum
**Das ist die Antwort auf „gibt es noch einen kritischen Refactor?"** – B1 und B4 (und
vermutlich künftige Bugs derselben Art) existieren nur, weil der Compiler im laxen Modus
Phantom-Felder und überzählige Properties durchwinkt. `tsc --noEmit` „grün" hat dadurch
deutlich weniger Aussagekraft als es scheint. Für eine App mit Bezahlfunktion ist
Strict-Mode der Refactor mit dem besten Verhältnis aus Aufwand zu verhinderten Folgefehlern.

### Wie (schrittweise, nicht Big Bang)
1. `"strict": true` setzen, `npx tsc --noEmit` laufen lassen, Fehlerzahl erfassen.
2. Fehler in 3 Wellen abbauen: (a) triviale (`null`-Checks, fehlende Typen),
   (b) Convex-Aufrufe mit falschen Argumenten (= echte Bugs wie B1!),
   (c) `any`-Helfer (deckt sich mit R6).
3. Übergangsweise einzelne Dateien mit `// @ts-expect-error` + TODO markieren statt den
   Schalter zurückzudrehen; CI (P2) erzwingt ab dann den Stand.
4. Danach `noUnusedLocals`/`noUnusedParameters` aktivieren (ersetzt einen Teil von knip).

### Definition of Done
- [x] `strict: true` in `tsconfig.app.json` und `tsconfig.node.json`
- [x] `npx tsc -p tsconfig.app.json --noEmit --pretty false` grün
- [x] Keine neuen `@ts-expect-error`-Marker eingeführt
- [ ] Danach `noUnusedLocals`/`noUnusedParameters` für App-Code aktivieren

**Aufwand:** realistisch 2–4 Tage verteilt; mit R6 zusammenlegen.

---

## Kleinbefunde (gesammelt, je < 1 h)

| # | Befund | Wo | Aktion |
|---|---|---|---|
| 1 | `parseInt(...) \|\| 0` erlaubt 0 Portionen / 0 Minuten; Backend validiert keine Min-Werte | [ManualRecipeForm.tsx:348,360](../../components/addRecipeModal/ManualRecipeForm.tsx) | UI `min=1` + Fallback 1; relevant für F2 (Division durch Portionen!) |
| 2 | Fehler-Mapping `getPasswordSignInErrorMessage` nur in SignInPage; SignUp/ForgotPassword zeigen rohe Fehlertexte | pages/SignUpPage.tsx, ForgotPasswordPage.tsx | Mapping aus `utils/authErrors.ts` überall nutzen |
| 3 | ShareTargetPage zeigt im Fallback rohe (englische) Fehlermeldungen | [ShareTargetPage.tsx:258,273](../../pages/ShareTargetPage.tsx) | Generische deutsche Meldung + Original nur in Sentry (P1) |
| 4 | `LIMIT_REACHED`-Fallback nutzt `limit: 50`, tatsächliche Limits sind 100 | [ShareTargetPage.tsx:242](../../pages/ShareTargetPage.tsx) | `FREE_LIMITS` importieren statt Magic Number |
| 5 | Facebook-Regex im ShareTarget matcht jede facebook.com-URL (Profile, Marketplace …) – Backend lehnt sauber ab, aber Nutzer sieht erst spät den Fehler | [ShareTargetPage.tsx:119](../../pages/ShareTargetPage.tsx) | Früh prüfen via Pattern analog `isSupportedFacebookUrl` |
| 6 | `sourceImageUrl: '__AI_SCAN__'`-Marker ist ein magischer String in der DB; `proxyExternalImage` versucht ihn zu fetchen (schlägt still fehl) | AddRecipeModal.tsx:390,514 | Bei K1-Umbau durch explizites `importSource`-Feld o. ä. ersetzen |
| 7 | TabsLayout hält alle 6 Tabs permanent gemountet → alle Queries dauerhaft live (bewusster Trade-off „instant tabs", aber Bandbreite/Reaktivität) | [TabsLayout.tsx:130-150](../../components/TabsLayout.tsx) | Bei R3 mitdenken; mindestens dokumentieren |
| 8 | `apify`-Reel-Scraper-Input nutzt `username: [url]` – funktioniert offenbar, ist aber undokumentiert/fragil | instagram.ts:769 | Beim R1-Refactor gegen Actor-Doku verifizieren |

---

## Abschlussstatus des Audits

Mit diesem Dokument ist der Code **vollständig** durchgesehen: Backend zeilengenau,
Frontend-Logik zeilengenau, präsentationale Komponenten (RecipeHero, Instructions,
EmptyState, UI-Kit, Onboarding) auf Muster geprüft. Nicht abgedeckt bleibt – wie in jedem
statischen Audit – Laufzeitverhalten auf echten Geräten (Gerätetest-Empfehlungen stehen in
den jeweiligen DoD-Checklisten) und die inhaltliche Qualität der KI-Ausgaben (nur durch
Nutzung messbar → P1/Analytics).

**Empfohlene Einordnung in die Roadmap:** B1 + B2 zusammen mit den K-Fixes in Woche 1
(beides < 1 h Fix-Aufwand, hoher Schaden), B3–B7 als Sammel-PR danach, R10 parallel zu R6/R7.
