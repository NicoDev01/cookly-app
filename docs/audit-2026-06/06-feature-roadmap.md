# Feature-Roadmap – Produkt-Lücken & neue Features

> **Methodik:** Abgleich des Ist-Stands (Code-verifiziert, nicht vermutet) mit dem
> Standard-Featureset erfolgreicher Rezept-Apps + den Stärken der vorhandenen Architektur.
> Jedes Feature wie gewohnt mit Wo/Was/Warum/Wie/DoD, damit ein Dev direkt loslegen kann.

## Ist-Stand (verifiziert am 12.06.2026)

| Bereich | Vorhanden ✅ | Fehlt ❌ |
|---|---|---|
| Import | Instagram, Facebook, Website (Jina), Foto-Scan, manuell | **TikTok**, YouTube, Pinterest, reiner Text (WhatsApp-Share) |
| Rezeptansicht | Zutaten-Checkliste, Schritte mit Icons, Bild-Zoom, Favoriten | **Portionen-Skalierung** (nur Anzeige!), **Kochmodus**, Timer, Keep-Awake, Notizen, Nährwerte |
| Planung | Wochenplan (Tag/Woche), Einkaufsliste mit Merge + Supermarkt-Sortierung, Zutat→Liste | **Wochenplan→Einkaufsliste** (keine Verbindung!) |
| Teilen | – | Rezept teilen (Text/Link/Bild), Export (PDF/Datenexport) |
| Offline | Offline-Banner | Offline-Lesen von Rezepten |

Wichtige Code-Befunde dahinter:
- `components/RecipeMeta.tsx:80` zeigt `{portions} Portionen` nur an – nirgendwo wird eine
  Zutatenmenge umgerechnet.
- Kein Keep-Awake-Plugin installiert, kein Timer-/Kochmodus-Code (`grep` über Pages/Components leer).
- `pages/WeeklyPage.tsx` / `MealPlanModal.tsx` haben keinerlei Shopping-Bezug.
- `pages/ShareTargetPage.tsx:118-120`: URL-Klassifizierung kennt nur Instagram/Facebook/generisch –
  eine TikTok-URL fällt in den Website-Scraper (Jina), der an TikTok scheitert → Fehlermeldung.
- `npx knip`: 9 ungenutzte Dependencies (`html2canvas`, `jimp`, `@capacitor/camera`,
  `@capacitor/filesystem`, `react-virtuoso`, `@stripe/stripe-js`, 3× Radix), 7 ungenutzte
  Dateien – Reste früherer Feature-Ansätze (→ Nachtrag zu R8 unten).

---

## F1 – TikTok-Import 🎯 (vom Owner gewünscht)

### Warum
TikTok ist neben Instagram **die** Quelle für virale Rezept-Videos – die Zielgruppe teilt von
dort genauso wie von Instagram. Die Architektur ist nach R1 (gemeinsames Importer-Modul) dafür
gebaut: TikTok ist „nur" ein weiterer Adapter.

### Wie
**Voraussetzung:** R1 aus [02-refactoring.md](02-refactoring.md) zuerst umsetzen – sonst
entsteht eine dritte 1000-Zeilen-Kopie.

1. **Apify-Actor:** `clockworks~tiktok-scraper` (etablierter Actor) mit Input
   `{ postURLs: [url], resultsPerPage: 1 }` über den bestehenden `runApifyActor`-Helper.
   Caption liegt im Feld `text`; Video-Thumbnail in `videoMeta.coverUrl` bzw. `covers[0]`
   (beim Integrieren gegen echte Response verifizieren – Apify-Schemas ändern sich).
2. **URL-Handling** (Adapter analog `canonicalizeInstagramUrl`):
   - Lange Form: `https://www.tiktok.com/@<user>/video/<id>` → kanonisieren (Tracking-Params
     strippen wie `INSTAGRAM_TRACKING_PARAMS_TO_DROP`).
   - **Kurzlinks `vm.tiktok.com/…` / `vt.tiktok.com/…`** (das teilt die App!) → Redirect
     auflösen wie `normalizeInstagramUrl` es für `/share/`-Links tut (GET mit
     `redirect: "follow"`, Timeout 4,5 s).
3. **Convex-Action** `tiktok.scrapePost` über das gemeinsame Modul; Rate-Limit-Bucket
   `"tiktok"` in `convex/rateLimiter.ts` ergänzen; Dedupe über `sourceUrl` (kanonisierte URL)
   funktioniert automatisch.
4. **Gemini-Prompt:** Der bestehende Instagram-Prompt passt 1:1 (Caption→Rezept). Wichtig:
   TikTok-Captions sind oft kürzer als Instagram → der vorhandene Recovery-Retry
   (instagram.ts:921ff, „kurzer Reel-Text") greift hier besonders oft; Schwellwert
   `MIN_CAPTION_LENGTH` beibehalten.
5. **Frontend** `pages/ShareTargetPage.tsx`: `tiktokMatch`-Regex **vor** `genericUrlMatch`
   einfügen: `/https?:\/\/(?:(?:www|m)\.)?tiktok\.com\/[^\s]+|https?:\/\/(?:vm|vt)\.tiktok\.com\/[^\s]+/i`
   → `api.tiktok.scrapePost` aufrufen (Fehlerbehandlung identisch zu Instagram-Zweig).
6. **Erwartungsmanagement einbauen:** Wenn die Caption kein Rezept enthält (nur „Link in Bio"),
   liefert die Pipeline `NO_RECIPE_CONTENT` → die bestehende Fehler-UI mit Option „manuell
   eingeben" greift. Das wird bei TikTok häufiger passieren als bei Instagram – Fehlertext
   TikTok-spezifisch formulieren („TikTok-Videos ohne Rezept in der Beschreibung können nicht
   importiert werden").

### Definition of Done
- [ ] Share aus der TikTok-App (Kurzlink!) importiert ein Rezept mit Titel, Zutaten, Schritten, Cover-Bild
- [ ] Lange URL + Kurzlink desselben Videos deduplizieren auf dasselbe Rezept
- [ ] Rate-Limit greift; `NO_RECIPE_CONTENT`-Fall zeigt verständliche Meldung
- [ ] Apify-Kosten pro Import einmal gemessen und notiert (Actor-Pricing prüfen!)

**Aufwand:** ~2–3 Tage (nach R1; davon ~1 Tag Testen mit echten TikTok-Links).
**Hinweis Play-Listing:** „TikTok-Import" prominent in die Store-Beschreibung – das ist ein
Differenzierungs-Feature.

---

## F2 – Portionen-Skalierung 🥇 (höchster UX-Impact, rein Frontend)

### Wo
`components/RecipeMeta.tsx` (Anzeige), `components/Ingredients.tsx` (Mengen), neues Util.

### Was / Warum
Portionen sind nur eine statische Zahl („4 Portionen"). **Jede** ernstzunehmende Rezept-App
kann Mengen umrechnen – es ist eine der meistgenutzten Funktionen beim Kochen. Die Daten sind
da (`portions: number`, `ingredients[].amount: string`).

### Wie
1. **Util `utils/scaleAmount.ts`** als pure function (→ testbar mit `node --test`):
   `scaleAmount(amount: string, factor: number): string`
   - Zahlen erkennen: `"200 g"`, `"1,5 EL"` (deutsches Komma!), `"½ TL"` (Unicode-Brüche
     ¼ ½ ¾ ⅓ ⅔ → Dezimal), Bereiche `"1-2 Stück"` (beide Enden skalieren)
   - Nicht-numerische Mengen (`"etwas Salz"`, `"nach Geschmack"`, leer) **unverändert** lassen
   - Ausgabe hübsch runden: max. 1 Nachkommastelle, de-DE-Format, gängige Brüche zurückwandeln
     (0,5 → ½) bei EL/TL/Stück
2. **UI:** Stepper (− / 4 Portionen / +) in `RecipeMeta` bzw. über der Zutatenliste;
   Skalierungsfaktor = `gewählt / recipe.portions` als lokaler State (NICHT in die DB schreiben –
   das Rezept bleibt unverändert).
3. **Einkaufsliste:** Beim Hinzufügen einer Zutat (`Ingredients.tsx` →
   `toggleShoppingItemByDetails`) die **skalierte** Menge übergeben, damit Liste und Ansicht
   konsistent sind.
4. **Tests:** `utils/scaleAmount.test.mjs` mit den Edge Cases aus Schritt 1 (mind. 10 Fälle).

### Definition of Done
- [ ] Stepper ändert alle numerischen Mengen live; nicht-numerische bleiben stehen
- [ ] „½ TL" bei Verdopplung → „1 TL"; „1,5 EL" bei 4→2 Portionen → „¾ EL" o. ä. sinnvoll gerundet
- [ ] In die Einkaufsliste wandert die skalierte Menge
- [ ] Unit-Tests grün, in CI eingebunden

**Aufwand:** ~1–2 Tage.

---

## F3 – Kochmodus (Keep-Awake + Schritt-Ansicht + Timer) 🥈

### Was / Warum
Beim Kochen mit der App geht aktuell das Display aus (kein Wake-Lock) und die Schrittliste ist
eine normale Scroll-Ansicht für saubere Finger. Ein Kochmodus ist **das** Retention-Feature
einer Rezept-App – es macht aus „Rezept-Sammlung" eine „Koch-Begleitung".

### Wie
1. **Keep-Awake:** `npm install @capacitor-community/keep-awake`; beim Betreten des Kochmodus
   `KeepAwake.keepAwake()`, beim Verlassen/Unmount `KeepAwake.allowSleep()` (iOS-kompatibel –
   zahlt auf den Port ein).
2. **Neue Route `/recipe/:id/cook`** (Button „Kochmodus starten" auf der RecipePage):
   - Ein Schritt pro Screen, große Schrift, Schritt-Icon, Fortschritt („3/8")
   - Navigation: große Vor/Zurück-Buttons + Swipe (einfaches Touch-Handling reicht,
     kein Carousel nötig); Zutaten als aufklappbares Bottom-Sheet (`BottomSheet.tsx` existiert)
3. **Timer-Erkennung:** Regex über den Schritttext
   `/(\d+)\s*(?:–|-)?\s*(\d+)?\s*(min(?:uten)?|std|stunden)/i` → Button „⏱ 10 Min Timer".
   Start: In-App-Countdown (State) **plus** `LocalNotifications.schedule` (bereits installiert
   und mit Channel eingerichtet, `utils/notifications.ts`) → Benachrichtigung feuert auch,
   wenn die App in den Hintergrund geht.
4. **Haptics** beim Schrittwechsel (`hooks/useHaptic.ts` existiert) – kleines Detail, große Wirkung.

### Definition of Done
- [ ] Display bleibt im Kochmodus an, geht danach wieder normal aus
- [ ] Schritte einzeln navigierbar, Zutaten ohne Verlassen einsehbar
- [ ] „10 Minuten"-Schritt bietet Timer an; Notification kommt auch bei App im Hintergrund
- [ ] Zurück-Geste/Hardware-Back verlässt den Kochmodus sauber (`useBackButton` einbinden)

**Aufwand:** ~2–3 Tage.

---

## F4 – Wochenplan → Einkaufsliste

### Was / Warum
Wochenplan und Einkaufsliste existieren beide, sind aber **nicht verbunden** – der naheliegendste
Flow („plane die Woche, kauf einmal ein") erfordert, jedes Rezept einzeln zu öffnen und Zutaten
anzuklicken. Die Merge-Logik (Mengen-Zusammenführung über `normalizedName`/`key`) existiert
bereits in `convex/shopping.ts` + `utils/shoppingListView.ts`.

### Wie
1. **Neue Mutation `shopping.addItemsForRecipes`** (`convex/shopping.ts`):
   Args `{ recipeIds: Id<"recipes">[], scaleByPortions?: boolean }` → für jedes Rezept
   (Ownership-Check!) alle Zutaten über die **bestehende** Key-/Merge-Logik von
   `addShoppingItem` einfügen (Logik in Helper extrahieren statt kopieren); `recipeId`/`recipeTitle`
   mitgeben, damit die vorhandene Gruppierungs-Ansicht greift.
2. **UI `pages/WeeklyPage.tsx`:** Button „Woche auf die Einkaufsliste" (+ pro Tag im
   Kontextmenü „Tag auf die Liste"). Danach Snackbar mit „X Zutaten hinzugefügt →
   [Zur Liste]" (Navigation zu `/tabs/shopping`).
3. **Doppel-Klick-Schutz:** Die Key-Logik dedupliziert identische Positionen bereits –
   verifizieren, dass zweimaliges Hinzufügen derselben Woche keine Dubletten erzeugt
   (Test mit 2 Rezepten, die „Zwiebel / 1 Stück" teilen).

### Definition of Done
- [ ] Ein Klick befüllt die Liste mit allen Zutaten der geplanten Woche, gruppiert nach Rezept
- [ ] Gleiche Zutaten+Menge über Rezepte hinweg werden nicht dupliziert
- [ ] Convex-Mutation bleibt unter den Limits (bei 7 Rezepten × 15 Zutaten = ~105 Inserts ok;
  bei mehr: chunken)

**Aufwand:** ~1 Tag.

---

## F5 – Import aus reinem Text (WhatsApp & Co.) – unterschätzter Quick Win

### Was / Warum
Der Android-Share-Intent (`text/plain`, AndroidManifest) liefert **jeden** geteilten Text an
die App – aber `ShareTargetPage` verarbeitet nur URLs (`genericUrlMatch`). Ein per WhatsApp
geschicktes Oma-Rezept oder ein kopierter Text läuft heute ins Leere. Die komplette
Extraktions-Pipeline (Text → Gemini → Rezept) existiert serverseitig schon.

### Wie
1. **Convex-Action `textImport.extractFromText`** (nach R1 trivial): nimmt `{ text: string }`,
   Auth + neuer Rate-Limit-Bucket `"text"`, ruft die gemeinsame Gemini-Extraktion mit dem
   Instagram-Prompt-Schema auf (ohne Apify-Schritt), Mindestlänge ~40 Zeichen, kein `sourceUrl`
   → zählt als `manual_recipes`… **Entscheidung nötig:** eigener Zähler oder `link_imports`?
   Empfehlung: wie Foto-Scan behandeln (KI-Kosten entstehen) → `photo_scans`-artiger Zähler
   oder neues Feld `textImports` in `usageStats`.
2. **`ShareTargetPage`:** Wenn kein URL-Match, aber `combinedText.length > 40` →
   Confirm-Screen („Rezept aus Text erstellen?") → Action aufrufen. Bei kürzerem Text:
   bestehende Fehlermeldung.

### Definition of Done
- [ ] WhatsApp-Text mit Zutaten+Schritten → strukturiertes Rezept
- [ ] Quatsch-Text („Hallo 😄") → saubere `NO_RECIPE_CONTENT`-Meldung statt Crash
- [ ] Rate-Limit + Usage-Zähler greifen

**Aufwand:** ~1 Tag (nach R1).

---

## F6 – Weitere Quellen & kleinere Features (Backlog, bewertet)

| # | Feature | Einschätzung | Aufwand |
|---|---|---|---|
| 6.1 | **Pinterest-Import** | Erst als Experiment: Pin-URL durch den bestehenden Website-Import (Jina) schicken – Pins haben oft Beschreibung+Bild, sonst Outbound-Link auflösen und den verlinkten Blog importieren. Kein eigener Adapter nötig, nur `pinterest.com`-Erkennung + Redirect-Logik in ShareTarget. | ~1 Tag |
| 6.2 | **YouTube-Import** | Video-Beschreibung enthält bei Koch-Kanälen oft das Rezept. Sauber über YouTube Data API v3 (`videos.list`, kostenloses Kontingent, API-Key serverseitig) statt Scraping. Shorts-URLs (`youtube.com/shorts/…`) mit abdecken. | ~2 Tage |
| 6.3 | **Rezept-Notizen** | Schema: `notes: v.optional(v.string())` an `recipes`, Textarea auf der RecipePage, in `update`-Mutation aufnehmen. Klassiker: „beim nächsten Mal weniger Salz". | ~0,5 Tag |
| 6.4 | **Rezept teilen** | `@capacitor/share` installieren; v1: Titel + Zutaten + Schritte als formatierter Text teilen. v2 (später): öffentliche Read-only-Links (`/r/<slug>` auf cookly-app.com, neue public Query ohne Auth – Achtung: bewusste Ausnahme von der Mandantentrennung, nur explizit geteilte Rezepte). Viral-Loop! | v1 ~0,5 Tag |
| 6.5 | **Nährwerte (Kalorien)** | Gemini beim Import zusätzlich `nutritionPerPortion` (kcal, Protein, KH, Fett) schätzen lassen (Schema-Felder optional). Mit „KI-Schätzung"-Disclaimer kennzeichnen. Kein externer Dienst nötig. | ~1–2 Tage |
| 6.6 | **Offline-Lesen** | Convex hat (Stand Juni 2026) keine Offline-Persistenz. Pragmatisch: zuletzt geladene Rezeptliste + besuchte Rezepte in `localStorage`/IndexedDB spiegeln und bei `useOnlineStatus() === false` daraus rendern (Read-only-Banner). Der vorhandene `QueryCacheContext` (R5!) könnte dafür umgebaut werden – dann hätte er endlich einen echten Zweck. Bilder: bereits proxied in Convex Storage → Browser-Cache hilft. | ~3–4 Tage, vorher R5 entscheiden |
| 6.7 | **Kategorien verwalten** | Umbenennen + Reihenfolge per Drag&Drop (Felder `order`, `icon`, `color` existieren im Schema, UI fehlt). Hängt mit R4 (deleteCategory-Verhalten) zusammen → zusammen umsetzen. | ~1–2 Tage |
| 6.8 | **Datenexport für Nutzer** | „Meine Rezepte exportieren" (JSON/Markdown-Zip per Mail/Share). Stärkt Vertrauen + DSGVO-Auskunftsrecht (Art. 20). | ~1 Tag |

---

## F7 – Monetarisierung: Free/Pro-Schnitt (Produktentscheidung, konkretisiert V5)

Aktuell ist Pro kaum kaufbar, weil Free mit 100/100/100 Limits faktisch alles kann.
Vorschlag für einen Schnitt, der zu den neuen Features passt (Entscheidung beim Owner):

| | Free | Pro |
|---|---|---|
| Manuelle Rezepte | unbegrenzt (Goodwill, kostet nichts) | unbegrenzt |
| Link-Imports (IG/FB/Web) | **15/Monat** (statt 100 gesamt → monatlich resetten!) | unbegrenzt |
| Foto-Scans | 5/Monat | unbegrenzt |
| TikTok-/YouTube-Import (F1/6.2) | ❌ | ✅ („Premium-Quellen") |
| KI-Bilder (Pollinations) | 3/Monat | unbegrenzt |
| Kochmodus (F3), Portionen (F2) | ✅ (Retention, nicht paywallen!) | ✅ |
| Wochenplan→Liste (F4) | ✅ | ✅ |
| Nährwerte (6.5) | ❌ | ✅ |

Technisch: `FREE_LIMITS` ist zentral (`convex/constants.ts`), aber es fehlt ein
**monatlicher Reset** (Felder `importsLastReset` existieren als Legacy im Schema → reaktivieren:
beim Limit-Check `if (now - lastReset > 30d) reset`). Bestandsnutzer: Grandfathering erwägen
(alte Limits behalten), um Shitstorm zu vermeiden – im Zweifel nur für Neuregistrierungen ändern.

**Wichtig:** Erst P1 (Analytics) umsetzen, **dann** Limits ändern – sonst ist nicht messbar,
ob die Änderung Conversion bringt oder Nutzer vertreibt.

---

## Nachtrag zu R8 (tote Abhängigkeiten – knip-Befund vom 12.06.2026)

Zusätzlich zu R8 aus [02-refactoring.md](02-refactoring.md), vor F-Arbeiten aufräumen:

- **Ungenutzte Dependencies entfernen** (`npm uninstall …`): `html2canvas`, `jimp`,
  `@capacitor/camera`¹, `@capacitor/filesystem`¹, `react-virtuoso`, `@stripe/stripe-js`²,
  `@radix-ui/react-label`, `@radix-ui/react-progress`, `@radix-ui/react-switch`
- **Ungenutzte Dateien löschen:** `components/CooklySplashScreen.tsx`, `components/ui/label.tsx`,
  `components/ui/switch.tsx`, `components/ui/cookly/{Badge,GlassPanel,Header}.tsx`,
  `convex.config.ts` (= K5.2)
- ¹ `@capacitor/camera`/`filesystem` ungenutzt heißt: Foto-Scan läuft über `<input type=file>`.
  → Dann auch `CAMERA`-Permission + `uses-feature` aus dem AndroidManifest entfernen
  (weniger Permissions = besseres Review) – **außer** F3/F-Features sollen künftig die
  native Kamera nutzen → bewusst entscheiden.
- ² `@stripe/stripe-js` prüfen: Checkout läuft über Redirect-URL, das JS-SDK scheint
  unnötig → entfernen spart Bundle.

**Aufwand:** ~2–3 h inkl. Build-Verifikation (`npm run check`, App-Smoke-Test).

---

## Priorisierung (Impact × Aufwand)

```
Sofort nach den P0-Fixes sinnvoll:
  F2  Portionen-Skalierung     (hoher Impact, klein, kein Backend)
  F4  Woche→Einkaufsliste      (hoher Impact, klein)
  R8-Nachtrag Dead Deps        (Hygiene, 2-3 h)

Nach R1 (Importer-Refactoring):
  F1  TikTok-Import            (Owner-Wunsch, Differenzierung)
  F5  Text-Import (WhatsApp)   (billig, überraschend nützlich)

Mittelfristig:
  F3  Kochmodus                (Retention; zahlt auch auf iOS-Launch ein)
  6.3 Notizen, 6.4 Teilen v1   (je ~0,5 Tag, runden das Produkt ab)
  F7  Free/Pro-Schnitt         (NACH P1/Analytics!)

Backlog / bewusst später:
  6.1 Pinterest, 6.2 YouTube, 6.5 Nährwerte, 6.6 Offline, 6.7 Kategorien, 6.8 Export
```
