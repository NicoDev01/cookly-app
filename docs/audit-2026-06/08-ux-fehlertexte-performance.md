# UX-Polish – Fehlertexte, Loading-Flow & Effizienz-Balance

> **Drei Themen, ein Ziel:** (1) Kein Nutzer sieht je wieder eine kryptische Fehlermeldung,
> (2) die App fühlt sich immer „geladen" an, (3) ohne dass Subscriptions/Prefetching die
> Convex-Bandbreite (= Kosten des Owners) oder das Gerät des Nutzers überladen.
> Alle Befunde sind code-verifiziert (Stand 12.06.2026).

---

# Teil 1: Fehlertexte – „kryptisch" systematisch abschaffen

## Umsetzungsstatus 2026-06-12

| Punkt | Status | Umsetzung | Offen |
|---|---|---|---|
| U1 | ✅ umgesetzt | Fehler-Oberflächen aus dem Inventar bereinigt: Signup, Forgot Password, Profile, Subscribe, Weekly, AddRecipeModal und ShareTarget zeigen keine rohen Backend-Texte mehr | Manuelle Gerätetests: falsches Passwort, doppelte Registrierung, falscher Code, Flugmodus-Speichern |
| U2 | ✅ umgesetzt | Neues zentrales Modul `utils/userErrors.ts` mit Convex-Noise-Stripping, strukturierten Backend-Fehlern, Auth-, Netzwerk-, Import-, Bild-, Billing- und Save-Fallbacks; `utils/authErrors.ts` delegiert darauf | Spätere Erweiterung um Sentry-Kontext aus Teil 4 |
| U3 | ✅ umgesetzt | `NotificationContext` unterstützt generische `showToast(message, tone)`-Toasts; alle `alert()`-Stellen in App-Code ersetzt | Visueller Smoke-Test der Toasts auf kleinem Android-Viewport |

## U1 – Ist-Zustand: Inventar aller Fehler-Oberflächen

| Oberfläche | Stelle | Ist-Zustand | Problem |
|---|---|---|---|
| Login | [SignInPage.tsx:64](../../pages/SignInPage.tsx) | ✅ `getPasswordSignInErrorMessage` | Vorbild – aber nur 3 Fälle gemappt |
| **Registrierung** | [SignUpPage.tsx:44-48, 63-67](../../pages/SignUpPage.tsx) | ❌ rohes `err.message` | Nutzer sieht `[CONVEX A(auth:signIn)] [Request ID: …] Server Error: Uncaught Error: …` |
| **Passwort vergessen** | [ForgotPasswordPage.tsx:41-45, 73-77](../../pages/ForgotPasswordPage.tsx) | ❌ rohes `err.message` | dito |
| **Account löschen / Abo kündigen** | [ProfilePage.tsx:52, 67](../../pages/ProfilePage.tsx) | ❌ Browser-`alert()` mit rohem `error.message` | alert() wirkt wie ein Absturz; Text technisch |
| Checkout / Portal | [SubscribePage.tsx:61, 80](../../pages/SubscribePage.tsx) | ⚠️ `alert()`, immerhin deutscher Text | alert() ersetzen |
| Plan kopiert (Erfolg!) | [WeeklyPage.tsx:247](../../pages/WeeklyPage.tsx) | ⚠️ `alert()` für eine Erfolgsmeldung | gehört in einen Toast |
| KI-Scan | [AddRecipeModal.tsx:446](../../components/AddRecipeModal.tsx) | ✅ `getAiScanErrorMessage` (gut!) | – |
| Bild erzeugen / verarbeiten | [AddRecipeModal.tsx:192, 645](../../components/AddRecipeModal.tsx) | ❌ `'Fehler …: ' + getErrorMessage(err)` | roher Anhang |
| Speichern | [AddRecipeModal.tsx:893](../../components/AddRecipeModal.tsx) | ❌ `"Fehler beim Speichern: " + errorMessage` | roher Anhang |
| Share-Import Fallback | [ShareTargetPage.tsx:258, 273](../../pages/ShareTargetPage.tsx) | ❌ rohes `msg` | engl. Backend-Fehler sichtbar |

**Grundregel ab jetzt (in CLAUDE.md / Review-Checkliste aufnehmen):**
`err.message` ist **nie** UI-Text. Rohfehler gehen in `console.error` + Sentry (P1);
der Nutzer bekommt immer einen gemappten oder generischen deutschen Text.

## U2 – Zentrales Fehlertext-Modul `utils/userErrors.ts`

`utils/authErrors.ts` (klein, getestet) zum allgemeinen Mapping ausbauen:

```ts
// Signatur-Idee
getUserErrorMessage(error: unknown, context: 'auth-signin' | 'auth-signup' |
  'auth-reset' | 'save' | 'import' | 'image' | 'billing' | 'generic'): string
```

1. **Convex-Rauschen strippen:** Muster `[CONVEX …] [Request ID: …] Server Error: Uncaught Error:`
   per Regex entfernen, bevor gematcht wird – erst dadurch werden die eigentlichen
   Fehlercodes (`InvalidSecret`, `TooManyFailedAttempts`, `LIMIT_REACHED`-JSON …) zuverlässig erkennbar.
2. **Mapping-Tabelle** (Auszug – beim Implementieren gegen echte Fehlertexte verifizieren):
   - `InvalidAccountId` / `InvalidSecret` → „E-Mail oder Passwort ist falsch."
   - `TooManyFailedAttempts` → bestehender Rate-Limit-Text
   - Signup, Account existiert (Convex Auth wirft hier i. d. R. `InvalidAccountId` beim
     `flow: "signUp"` bzw. „account already exists") → „Diese E-Mail ist bereits registriert. Möchtest du dich anmelden?" (+ Link zu /sign-in)
   - Ungültiger/abgelaufener Verifizierungscode → „Der Code ist ungültig oder abgelaufen. Fordere einen neuen an."
   - `Failed to fetch` / `NetworkError` / `Connection lost` → „Keine Verbindung. Prüfe dein Internet und versuche es erneut."
   - JSON-Strukturfehler (`LIMIT_REACHED`, `RATE_LIMIT_EXCEEDED`, `API_UNAVAILABLE`,
     `NO_RECIPE_CONTENT`) → bestehende Texte (Logik aus ShareTargetPage hierher zentralisieren)
   - Fallback je Kontext: „Speichern hat nicht geklappt. Bitte versuche es erneut." statt Technik-Text
3. **Tests:** `utils/userErrors.test.mjs` nach dem Muster von `authErrors.test.mjs` –
   ein Testfall pro Mapping inkl. eines echten, vollständigen Convex-Fehlerstrings.
4. **Einbauen** an allen ❌/⚠️-Stellen der Tabelle oben; die Speziallogik
   `getAiScanErrorMessage` bleibt (delegiert für Nicht-Gemini-Fälle an das neue Modul).

### Definition of Done
- [x] Suche `grep -rn "err.message\|error.message\|errorMessage" pages components` zeigt keine
  Stelle mehr, die Rohtext rendert (nur noch console/Sentry)
- [x] `alert(` kommt im App-Code nicht mehr vor
- [ ] Manuelle Tests: falsches Passwort, doppelte Registrierung, falscher Verify-Code,
  Flugmodus-Speichern → überall verständliche deutsche Texte

**Aufwand:** ~1 Tag inkl. Tests.

## U3 – Generischer Toast (Voraussetzung für U1/U2)

[contexts/NotificationContext.tsx](../../contexts/NotificationContext.tsx) kennt nur
`showImportToast(recipeId)`. Es fehlt ein allgemeiner Kanal:

1. API erweitern: `showToast(message: string, tone?: 'success' | 'error' | 'info')` –
   gleiche Optik wie der Import-Toast (Komponente existiert, nur parametrisieren).
2. Alle `alert()`-Stellen ersetzen (ProfilePage ×2, SubscribePage ×2, WeeklyPage ×1).
3. Erfolgsmeldungen vereinheitlichen: „Plan kopiert", „Abo gekündigt – aktiv bis …",
   Konto-Lösch-Bestätigung.

**Aufwand:** ~0,5 Tag.

---

# Teil 2: Loading-Flow & Animationen

## Umsetzungsstatus 2026-06-12

| Punkt | Status | Umsetzung | Offen |
|---|---|---|---|
| U4 | ✅ umgesetzt | `PageLoader` und `ModalLoader` eingeführt; `App`, `TabsLayout`, `RecipePage` und `RecipeHero` nutzen keine `fallback={null}`-Suspense-Grenzen mehr | Slow-3G-Smoke-Test im Browser und Gerätetest auf Android |
| U5 | ✅ Kern umgesetzt | Motion-Tokens in Tailwind/CSS ergänzt, zentrale Animationen darauf umgestellt, globale `prefers-reduced-motion`-Regel ergänzt, ShareTarget-Phasen auf Mindestanzeigezeit gekoppelt | Optionale Detailarbeit: echte Modal-Exit-Animationen für hart unmountende Bottom-Sheets |

## U4 – Blank Screens durch `fallback={null}` beseitigen

### Befund
Alle drei `<Suspense>`-Grenzen ([App.tsx:210](../../App.tsx),
[TabsLayout.tsx:130, 186](../../components/TabsLayout.tsx)) haben `fallback={null}` →
beim Nachladen eines Lazy-Chunks (langsames Netz, erster Besuch einer Route, Web-Version)
sieht der Nutzer einen **leeren Bildschirm**. Auf Android kaschiert der Splash + das
Tab-Prefetching das meiste, aber: AddRecipeModal-Chunk, RecipePage-Direktlinks und die
Web-Version treffen es.

### Umsetzung
1. Kleine Komponente `components/PageLoader.tsx`: zentrierter Marken-Spinner
   (gleiche Optik wie der existierende Spinner in RecipePage:325) – als Fallback für die
   beiden Routen-Suspenses.
2. Für das AddRecipeModal: Fallback = abgedunkelter Backdrop + Spinner, damit der
   Tap aufs „+" sofort sichtbares Feedback gibt (aktuell: Tap → nichts → Modal ploppt).
3. Bestehende Skeletons (`animate-pulse` in CategoriesPage/FavoritesPage/RecipePage/
   ProfilePage ✅) und das „alte Daten während Wochenwechsel anzeigen"-Muster der
   WeeklyPage (Zeile 74-83) sind **gut** – WeeklyPage-Muster als Standard für alle
   Filter-/Suchwechsel übernehmen (z. B. CategoryRecipesPage bei Suche).

### Definition of Done
- [ ] Mit Chrome-DevTools-Throttling „Slow 3G" (Web-Build): keine weiße/leere Fläche
  > 200 ms ohne Spinner/Skeleton auf den Kernrouten

**Aufwand:** ~0,5 Tag.

## U5 – Animations-Leitplanken (klein halten, konsistent machen)

Vorhandene Basis ist gut (`page-enter`, `animate-in`, Blurhash-Fades, Haptics, gespeicherte
`imageAspectRatio` verhindert Layout-Shift). Was fehlt, ist Konsistenz statt mehr Animation:

1. **Motion-Tokens** in `tailwind.config.js`: zwei Dauern (150 ms „snappy" für Taps/Toasts,
   300 ms „smooth" für Seiten/Modals) + ein Easing (`cubic-bezier(0.2, 0, 0, 1)`).
   Alle bestehenden Animationen auf diese Tokens umstellen – ungleiche Dauern sind das,
   was Apps „unruhig" wirken lässt.
2. **`prefers-reduced-motion` respektieren:** globale CSS-Regel, die Animationen auf
   `transition: none` reduziert (Barrierefreiheit + von Google/Apple-Guidelines erwartet).
3. **Übergänge, die sich lohnen** (je ~1–2 h): Modal-Exit (BottomSheet/AddRecipeModal
   schließen aktuell hart), Checkbox-Feedback in der Einkaufsliste (Scale-Tick),
   FAB-Press-State. **Nicht** lohnenswert: aufwendige Page-Transitions (HashRouter +
   permanente Tabs machen das fragil; Display-Toggle ist okay).
4. ShareTargetPage-Phasen („Wird analysiert → Extrahieren → Importieren") laufen aktuell
   synchron durch (Phase 1→2 ohne Pause, [ShareTargetPage.tsx:130-133](../../pages/ShareTargetPage.tsx)) –
   Phasenwechsel an Mindestanzeigezeiten koppeln (z. B. je ≥ 800 ms), sonst „springt" der Text.

**Aufwand gesamt:** ~1 Tag.

---

# Teil 3: Effizienz – Smooth bleiben, ohne Kosten/Gerät zu überladen

## Umsetzungsstatus 2026-06-12

| Punkt | Status | Umsetzung | Offen |
|---|---|---|---|
| E1 | ✅ umgesetzt | `recipes.listPreviews` eingeführt; `TabsLayout` lädt keine Rezeptliste mehr; `MealPlanModal`, `FavoritesPage` und `CategoryRecipesPage` nutzen Preview-Queries ohne `ingredients`/`instructions`; `CategoriesPage` nutzt Voll-Query nur noch für aktiven Zutatenfilter | Convex-Dashboard: Bandwidth vorher/nachher manuell notieren |
| E2 | ✅ umgesetzt | Subscription-Budget-Regeln in `CLAUDE.md` festgehalten | Optional: später PostHog/Usage-Dashboard für Kosten-Proxys |
| E3 | ✅ umgesetzt | App-Start-Bildprefetch entfernt; `prefetchRecipeImages` auf 6 Bilder begrenzt und Data-Saver-aware gemacht; Listenbilder defaulten auf `decoding="async"` | Realgerät-Smoke-Test mit Data Saver / Mobilfunk |

## E1 – Größter Kostenhebel: `recipes.list` wird komplett und dauerhaft abonniert 🔴

### Befund
[TabsLayout.tsx:61](../../components/TabsLayout.tsx):
`useQuery(api.recipes.list, {})` lädt **alle Rezepte des Users inklusive aller Zutaten und
Anleitungen** – dauerhaft subscribed, auf jeder Tab-Route – **nur um die ersten 20 Bilder
vorzuladen**. Dazu kommt [MealPlanModal.tsx:74](../../components/MealPlanModal.tsx) mit
derselben Voll-Query (braucht nur Titel + Bild).

Konsequenz bei z. B. 300 Rezepten à ~3–8 KB: jede einzelne Rezept-Änderung (Favorit togglen,
Zutat abhaken im Rezept) pusht das **gesamte Result-Set** neu an den Client → Convex-Bandbreite
(Kostenfaktor!) und Akku/Datenvolumen des Nutzers. Genau das „Zu-viel-Speichern", das du
vermeiden willst.

### Umsetzung
1. Neue schlanke Query `recipes.listPreviews` (oder `list` mit `fields: "preview"`):
   gibt nur `_id, title, category, image, imageBlurhash, imageAspectRatio, prepTimeMinutes,
   difficulty, isFavorite` zurück – **ohne** `ingredients` UND **ohne** `instructions`
   (Achtung: das bestehende `includeIngredients: false` entfernt nur Zutaten, die
   Anleitungen bleiben drin – [recipes.ts:123-127](../../convex/recipes.ts)).
2. TabsLayout-Bild-Prefetch auf `listPreviews` umstellen – oder ganz streichen: die
   CategoriesPage zeigt die Bilder ohnehin sofort, der Browser-Cache übernimmt den Rest.
   Empfehlung: **streichen** und nur behalten, falls messbar schlechter (P1-Analytics!).
3. MealPlanModal auf `listPreviews` umstellen (+ clientseitige Suche statt Server-Suche –
   die Daten sind dann klein genug).
4. Zusammen mit R3 (echte Pagination) ist das der komplette Bandbreiten-Fix.

### Definition of Done
- [x] Kein dauerhaft aktives Abo mehr, das `ingredients`/`instructions` aller Rezepte enthält
- [ ] Convex-Dashboard → Usage: Bandbreite pro Tag vor/nach dem Umbau notiert (Erfolg messbar)

**Aufwand:** ~0,5–1 Tag. **Impact:** der mit Abstand größte Kosten-/Effizienz-Gewinn.

## E2 – Subscription-Budget pro Sitzung (Leitplanke für die Zukunft)

Da alle 6 Tabs permanent gemountet sind (bewusster „instant tabs"-Trade-off), ist die Zahl
**dauerhaft aktiver** Subscriptions die zentrale Stellgröße. Ist-Stand nach E1-Umbau: ~8–10
aktive Queries (Kategorien+Stats, Previews, Favoriten-IDs, Woche, Einkaufsliste, User,
Pricing …) – das ist okay.

**Regeln festhalten (CLAUDE.md):**
1. Neue Queries auf Tab-Ebene nur mit `"skip"` bis der Tab erstmals aktiv war
   (Muster existiert schon in App.tsx:251).
2. Detail-Daten (Zutaten, Anleitungen) immer nur pro geöffnetem Rezept laden, nie in Listen.
3. Vor jedem Release einen Blick ins Convex-Dashboard → Usage (Function Calls + Bandwidth);
   bei P1 ein PostHog-Dashboard „Convex-Kosten-Proxys" (Importe/Tag, aktive Nutzer) daneben.
4. `ImportTiming`-Logs (V6) drosseln – Logs zählen ins Convex-Kontingent.

## E3 – Bild-Strategie: gut, mit zwei Stellschrauben

Vorhanden und richtig: Blurhash-Platzhalter, gespeicherte Aspect-Ratio (kein Layout-Shift),
Komprimierung auf 1200 px/0.75 vor Upload, Proxy in Convex Storage für Instagram-Bilder.

1. **Eager-Prefetch zähmen:** `prefetchRecipeImages` lädt beim App-Start bis zu 20 Bilder
   ([prefetch.ts](../../prefetch.ts)) – im Mobilfunknetz unnötiges Datenvolumen.
   Nach E1-Entscheidung entweder streichen oder auf die ~6 sichtbaren Kategorie-Vorschaubilder
   begrenzen; `navigator.connection?.saveData === true` respektieren (Data-Saver-Modus).
2. **`loading="lazy"` + `decoding="async"`** auf allen Listen-`<img>` sicherstellen
   (SafeImage/ImageWithBlurhash prüfen) – Bilder unterhalb des Folds laden erst beim Scrollen.
3. Convex-Storage-URLs sind CDN-gecacht – kein Handlungsbedarf bei wiederholten Aufrufen.

**Aufwand:** ~2–3 h.

---

## Priorisierung dieses Pakets

```
Zuerst (höchstes Nutzer-Ärgernis / höchste Ersparnis):
  U3 Toast-API  →  U1/U2 Fehlertexte zentral     (~1,5 Tage zusammen)
  E1 recipes.list verschlanken                    (~1 Tag, größter Kostenhebel)
Danach:
  U4 Loading-Fallbacks                            (~0,5 Tag)
  E3 Bild-Prefetch zähmen                         (~3 h)
  U5 Motion-Tokens + reduced-motion               (~1 Tag)
Laufend:
  E2-Regeln in CLAUDE.md verankern, Usage je Release prüfen
```

Gesamt: **~4 Entwicklertage** für spürbar professionellere UX **und** niedrigere laufende
Kosten – die beiden Ziele zahlen hier aufeinander ein statt gegeneinander.

---

# Teil 4: Entwickler-Logs ohne Nutzer-Störung (Observability-Architektur)

> Beantwortet die Frage: „Wie bekomme ich als Entwickler weiterhin alle Informationen,
> während der Nutzer im Frontend nichts Technisches mehr sieht?" – Das Standard-Muster
> dafür ist ein **Drei-Schichten-Modell**: Jeder Fehler existiert zweimal – einmal als
> freundlicher Text für den Nutzer, einmal als vollständiger Datensatz für den Entwickler.
> Die Schichten sind strikt getrennt.

## Umsetzungsstatus 2026-06-12

| Bereich | Status | Umsetzung |
|---|---|---|
| Logger-Kern (Schicht 3) | ✅ umgesetzt | `utils/logger.ts`: Ringpuffer (200), Dev-Konsole/Prod-stumm, `serializeLogData`, `getRecentLogLines`; pure Helfer in `utils/logger.test.mjs` (9 Tests) |
| Sentry-Hook (Schicht 2) | ✅ vorbereitet | `registerLogSink(sink)` leitet warn/error an Sinks weiter. **Sentry selbst ist NICHT verdrahtet** (gehört zu P1) – Anbindung ist ein Einzeiler, keine Call-Site muss erneut angefasst werden |
| Call-Sites umgestellt | ✅ vollständig | **0 rohe `console.*` mehr im gesamten App-Code** (`pages/`, `components/`, `services/`, `hooks/`, `contexts/`, `utils/`, `App.tsx`, `index.tsx`) – inkl. beider ErrorBoundaries + globaler `window.onerror`/`unhandledrejection`-Handler |
| WebView-Debugging | ✅ umgesetzt | `capacitor.config.ts`: `webContentsDebuggingEnabled` standardmäßig AUS; Opt-in via `COOKLY_DEBUG_WEBVIEW=1` (bewusst kein NODE_ENV-Default, da `cap sync` eigener Prozess) |
| Debug-Menü | ✅ umgesetzt | `components/DebugSheet.tsx` + 7×-Tap auf die Versionsnummer in der ProfilePage; zeigt Version/Plattform/gekürzte User-ID + Ringpuffer-Logs, Buttons „kopieren"/„per E-Mail"/„Puffer leeren". App-Version via Vite-`define` aus `build.gradle` (`utils/appInfo.ts`, `__APP_VERSION__`) |

**Verifiziert:** `npx tsc -p tsconfig.app.json --noEmit` grün · `node --test …` 74/74 grün ·
`npm run build:check` grün · Version `1.4.8` im Bundle · `grep "console\."` über den App-Code = 0
(verbleibende console-Referenzen in den Bundles: der Dev-Zweig des Loggers selbst – in Prod via
`isDev=false` nie aufgerufen – sowie Drittbibliotheken wie convex/auth).

**Offen (gehört zu P1):** Sentry-Account/SDK + `registerLogSink`-Anbindung (warn/error →
Breadcrumb, error → captureException + Ringpuffer als Attachment); Convex-Exception-Reporting.
**Offen (Gerätetest):** Debug-APK mit `COOKLY_DEBUG_WEBVIEW=1` über `chrome://inspect` prüfen;
7×-Tap-Menü auf echtem Gerät öffnen.

## Schicht 1 – Nutzer: Nur gemappte Texte + Graceful Degradation

Bereits geplant in U1–U3. Ergänzend als Regel: Jede Fehlerstelle entscheidet sich für eine
von drei Reaktionen — (a) **Fallback** (Import-Pipeline macht das vorbildlich: Jina down →
manuelle Eingabe), (b) **Retry-Angebot** („Erneut versuchen"-Button statt Sackgasse),
(c) **gemappte Meldung** via `getUserErrorMessage`. Die ErrorBoundary bekommt einen
freundlichen Screen mit „App neu laden"-Button (aktuell prüfen, was sie rendert).

## Schicht 2 – Entwickler in Produktion: Sentry als „Konsole für draußen"

Das ist die direkte Antwort auf die Frage. Sentry (P1) ersetzt das, was in der Entwicklung
`console.log` war:

1. **`captureException` an jeder Stelle, die bisher nur `console.error` macht** – mit
   Kontext-Tags: `Sentry.captureException(err, { tags: { flow: "import" | "auth" |
   "billing" | "scan" }, extra: { url, recipeId } })`. Du siehst dann im Dashboard: welcher
   User (pseudonym), welche App-Version, welches Gerät, welcher Flow.
2. **Breadcrumbs = dein Log-Trail:** Sentry zeichnet automatisch die letzten Navigationen,
   Klicks und Netzwerk-Requests auf. Ein Fehlerreport enthält also „was der Nutzer davor
   getan hat" – das, wofür du in der Entwicklung die Konsole mitliest.
3. **Convex-Seite:** Server-Logs (alle `console.log` in Actions/Mutations) landen im
   Convex-Dashboard → Logs; zusätzlich Convex-Exception-Reporting auf dasselbe
   Sentry-Projekt schalten. Damit korrelierst du Frontend-Fehler („Import fehlgeschlagen")
   mit der Backend-Ursache (Apify-Timeout) in einem Tool.

## Schicht 3 – Entwickler lokal/am Gerät: Logger-Wrapper + Debug-Zugänge

**Zentraler Logger `utils/logger.ts`** (ersetzt nach und nach alle direkten console-Aufrufe):

```ts
// Verhalten:
// - schreibt IMMER in einen In-Memory-Ringpuffer (max. 200 Einträge, kostet nichts)
// - im DEV-Build (import.meta.env.DEV): zusätzlich console-Ausgabe wie bisher
// - im PROD-Build: console bleibt stumm; warn/error werden Sentry-Breadcrumbs,
//   error zusätzlich captureException
logger.debug("Import", "checkIntent", { source });   // dev-only sichtbar
logger.error("Auth", "Code exchange failed", err);    // user merkt nichts, du alles
```

Der Ringpuffer ist der Trick: Bei jedem Sentry-Report werden die letzten ~200 Log-Zeilen
als Attachment mitgeschickt → du bekommst in Produktion denselben Detailgrad wie in der
Entwicklung, ohne dass je etwas beim Nutzer aufpoppt oder dauerhaft Logs gesendet werden.

**Dazu zwei Zugänge für dich selbst:**
1. **WebView-Remote-Debugging reparieren:** `capacitor.config.ts` setzt
   `webContentsDebuggingEnabled: false` global – das deaktiviert `chrome://inspect`
   **auch für Debug-Builds**. Umstellen auf umgebungsabhängig (z. B.
   `webContentsDebuggingEnabled: process.env.NODE_ENV !== "production"` oder zwei
   Config-Varianten), damit Debug-APKs wieder voll inspizierbar sind, Release sicher bleibt.
2. **Verstecktes Debug-Menü (optional, ~2 h):** 7× auf die Versionsnummer in der
   ProfilePage tippen → Screen mit App-Version, gekürzter User-ID, den letzten
   Ringpuffer-Logs und einem „Logs teilen"-Button (mailto). Gold wert für Support-Fälle
   („schick mir mal deine Logs"), ohne irgendetwas für normale Nutzer zu ändern.

### Definition of Done
- [x] `utils/logger.ts` existiert, ShareTargetPage + AddRecipeModal + Auth-Seiten umgestellt
  (darüber hinaus: gesamter App-Code, beide ErrorBoundaries, globale Handler)
- [x] Prod-Build: unsere Logs sind still (Logger-`isDev`-Guard); Ringpuffer + `registerLogSink`
  für Sentry vorbereitet — **Sentry-Anbindung selbst offen (P1)**
- [x] Code-Pfad für „Debug-APK inspizierbar, Release nicht" umgesetzt (`COOKLY_DEBUG_WEBVIEW`);
  Gerätetest mit `chrome://inspect` steht aus
- [x] V6 (Logging-Hygiene) aus 03-verbesserungen abgedeckt → dort als „ersetzt durch 08/Teil 4" markiert

**Aufwand:** ~1 Tag (ohne Debug-Menü), Voraussetzung: Sentry aus P1.
