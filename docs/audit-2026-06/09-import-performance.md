# Import-Performance – Warum der Import langsam ist & wie er schnell wird

> **Frage des Owners:** „Apify selbst ist schnell, Gemini flash-lite ist schnell – warum
> dauert der Import trotzdem so lange?" **Antwort:** Es ist nicht EIN Bottleneck, sondern
> eine Kette von 6–8 **sequenziellen** Schritten, von denen jeder einzeln harmlos aussieht.
> Code-verifiziert am 12.06.2026.

## 1. Die komplette Latenz-Kette (Ist-Zustand, Instagram-Beispiel)

Vom Tippen auf „Teilen mit Cookly" bis zum sichtbaren Rezept – alles **nacheinander**:

| # | Schritt | Wo | Typische Dauer | Anmerkung |
|---|---|---|---|---|
| 1 | App-Start (cold/warm) | Capacitor/WebView, Bundle, Convex-WS-Connect, Auth | 1–4 s (cold) / 0,3–1 s (warm) | Splash wartet auf `currentUser`-Query |
| 2 | ShareTargetPage-Chunk laden | [App.tsx:26](../../App.tsx) `React.lazy` – **nicht** im Tab-Prefetch! | 0,2–1 s | Der wichtigste Flow lädt seinen Code erst bei Bedarf |
| 3 | **Lambda-Cold-Start der Action** | `"use node"` in instagram/facebook/website.ts (jeweils Zeile 1) | 0,5–2,5 s (cold) | Node-Actions laufen in AWS Lambda; Default-Runtime-Actions nicht |
| 4 | Rate-Limit + Dedupe + Stale-Check | 3 sequenzielle `ctx.run*`-Roundtrips ([instagram.ts:715-740](../../convex/instagram.ts)) | 0,15–0,5 s | Jeder Roundtrip Lambda↔Convex kostet 50–150 ms |
| 5 | Redirect-Auflösung `/share/`-Links | [instagram.ts:261-286](../../convex/instagram.ts), Timeout 4,5 s | 0,3–4,5 s | Die Instagram-App teilt genau diese Link-Form! |
| 6 | **Apify primär** (`run-sync-get-dataset-items`) | Timeout 15 s | **5–15 s** | Container-Boot des Actors (~2–5 s) + Scrape. „Auf der Apify-Seite schnell" = dort läuft oft ein schon warmer Run/anderes Actor-Setup |
| 7 | Apify-Fallback (nur bei Fehlschlag) | Timeout 10 s, **sequenziell danach** | +5–10 s | Worst Case addiert sich |
| 8 | Gemini flash-lite | inkl. evtl. Recovery-Retry bei dünner Caption | 1–3 s (+1–3 s Retry) | Kein `thinkingBudget: 0` gesetzt → Modell darf „nachdenken" |
| 9 | Final-Dedupe + Create | 2–3 weitere `ctx.run*`-Roundtrips | 0,1–0,4 s | |
| 10 | Bild-Proxy | async nach Erfolg (✅ richtig gelöst) | 0 s gefühlt | |

**Typischer Gesamtwert: 8–25 Sekunden**, dominiert von #6 (Apify-Actor-Boot) – aber #1–#5
addieren davor schon 2–8 s, die sich vollständig wegoptimieren lassen.

## 2. Schritt 0: Erst messen, dann optimieren (Telemetrie existiert schon!)

`createImportTimer` ([convex/importTiming.ts](../../convex/importTiming.ts)) loggt jeden
Schritt mit `msSincePrev`. **Vor jeder Optimierung:**
1. Convex-Dashboard → Logs → nach `[ImportTiming][instagram] summary` filtern,
   10–20 echte Importe ansehen und die p50/p95 je Step notieren (insb.
   `rate_limit_checked`→`url_normalized`, `url_normalized`→`apify_primary_done`,
   `gemini_structured_ok`).
2. Dieselbe Messung nach jedem Umbau wiederholen → jede Optimierung bekommt eine Zahl.
   (Mit P1/Sentry später automatisch als Performance-Spans.)

## 3. Optimierungen, nach Wirkung sortiert

### O1 – `"use node"` entfernen → Convex-Default-Runtime 🥇 (spart ~1–3 s, v. a. den Cold Start)

**Was:** Alle drei Import-Actions laufen als Node-Actions in AWS Lambda (Cold Starts,
langsamere `ctx.run*`-Roundtrips). Der Code benutzt aber nur `fetch`, `URL`, `JSON` und das
`@google/genai`-SDK – nichts Node-spezifisches.

**Wie:**
1. `"use node";` aus `instagram.ts`, `facebook.ts`, `website.ts` entfernen, `npx convex dev`
   → Fehler ansehen.
2. Zwei bekannte Stolpersteine:
   - `@google/genai` ist isomorph (läuft im Browser) und sollte funktionieren – falls nicht:
     SDK durch direkten REST-Call ersetzen (`fetch("https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent?key=…")`
     mit demselben JSON-Schema-Body). Das entfernt nebenbei eine Dependency.
   - `AbortSignal.timeout(...)`: Verfügbarkeit in der Convex-Runtime testen; sonst
     Mini-Helfer mit `AbortController` + `setTimeout` schreiben.
3. Messen (Schritt 0): `env_checked`→`authenticated` und Gesamt-`totalMs` vorher/nachher.

### O2 – Apify beschleunigen 🥈 (spart 2–10 s, der dickste Block)

1. **Primär+Fallback parallel statt sequenziell** (Race): Beide Actor-Runs gleichzeitig
   starten, erster brauchbarer Kandidat gewinnt, zweiter wird abgebrochen.
   Trade-off: ~2× Apify-Kosten pro Import in den Fällen, wo der Primäre gereicht hätte.
   Günstigere Variante: Primär-Timeout auf 8 s senken und Fallback früher starten
   („hedged request" ab Sekunde 5).
2. **Globaler Scrape-Cache (Kosten- UND Geschwindigkeits-Hebel):** Dedupe ist heute
   **pro User** – wenn 50 Nutzer dasselbe virale Reel importieren, zahlt jeder den vollen
   Apify+Gemini-Durchlauf. Neue Tabelle `scrapeCache` (key = kanonische URL, value =
   extrahiertes Rezept-JSON + Bild-URL, TTL z. B. 30 Tage): Treffer → Import in < 1 s,
   null Apify-/Gemini-Kosten. Öffentliche Post-Daten, kein Privacy-Problem; User-Rezept
   wird weiterhin als eigene Kopie angelegt.
3. **Actor-Tuning:** `run-sync`-Aufruf um `&memory=1024` (oder höher) ergänzen – mehr
   Memory = schnellerer Boot/Run bei Apify; gegen Kosten abwägen. Prüfen, ob es für
   Einzel-Post-Abrufe einen leichteren/schnelleren Actor gibt als den
   Full-Profile-Scraper (`apify~instagram-scraper` ist für Massen-Scraping gebaut) –
   Kandidaten im Apify Store vergleichen (Boot-Zeit, Preis pro Run). Ebenso prüfen:
   Actors mit **Standby-Modus** (laufen warm, antworten wie eine API ohne Container-Boot)
   – das wäre der größte Einzelgewinn, falls für IG/FB verfügbar.

### O3 – Vorgelagerte Sekunden einsammeln (spart 1–5 s)

1. **ShareTargetPage-Chunk vorladen:** In den Prefetch-Block von
   [TabsLayout.tsx:48-58](../../components/TabsLayout.tsx) aufnehmen (oder nicht-lazy
   importieren – es ist der Kern-Flow der App).
2. **Redirect-Auflösung straffen:** Timeout 4,5 s → 2,5 s; zusätzlich testen, ob die
   Apify-Actors `/share/`-URLs selbst auflösen (dann entfällt der eigene Fetch komplett).
3. **Roundtrips bündeln:** Rate-Limit + Dedupe + Stale-Check in EINE interne Mutation/Query
   zusammenfassen (`internal.imports.preflight`), Final-Dedupe + Create ebenso →
   aus 6 `ctx.run*`-Aufrufen werden 2–3.
4. **Gemini:** `thinkingConfig: { thinkingBudget: 0 }` setzen (flash-lite braucht für
   Struktur-Extraktion kein Thinking; aktuell ungesetzt → Default kann Latenz kosten).
   Recovery-Retry beibehalten, aber messen, wie oft er feuert (`gemini_structured_failed`
   in den Logs) – falls häufig, lieber den Erst-Prompt verbessern als doppelt zahlen.

### O4 – Gefühlte Geschwindigkeit (kostet nichts, wirkt sofort)

1. **Echte Fortschrittsphasen:** Die UI-Phasen sind heute Fake (springen synchron durch,
   [ShareTargetPage.tsx:130-139](../../pages/ShareTargetPage.tsx)) – der Nutzer sieht
   ~20 s lang denselben Spinner.變ariante A (einfach): Mindestanzeigezeiten + Phase an
   grobe Zeitschätzung koppeln. Variante B (richtig): Action schreibt Fortschritt in eine
   `importJobs`-Tabelle (`status: scraping | extracting | saving`), Client subscribed
   darauf – Convex-Reaktivität macht das trivial, und es ist die Vorstufe zu
   „Import läuft im Hintergrund weiter, auch wenn der Nutzer die App schließt".
2. **Skeleton statt Spinner:** Sobald Apify den Kandidaten liefert (Titel/Bild bekannt
   wären), Rezept-Skeleton mit Bild anzeigen, während Gemini extrahiert (erfordert
   Variante B bzw. Aufteilung in zwei Actions: `scrape` → liefert Titel+Bild schnell,
   `extract` → füllt Rest).

## 4. Erwartung nach Umsetzung

| Paket | Aufwand | Ersparnis (typisch) |
|---|---|---|
| O1 Runtime-Wechsel | ~0,5–1 Tag | 1–3 s |
| O3 Vorlauf straffen (Chunk, Redirect, Roundtrips, Thinking) | ~1 Tag | 1–4 s |
| O2.1 Hedged/Parallel-Apify | ~0,5 Tag | 2–8 s im Fallback-Fall |
| O2.2 Globaler Scrape-Cache | ~1 Tag | virale Posts: 15 s → < 1 s, plus Apify-Kosten ↓ |
| O4 Fortschritt/Skeleton | ~1 Tag | 0 s real, gefühlt riesig |

**Realistisches Ziel:** p50 von heute ~10–15 s auf **5–8 s**, Cache-Treffer **< 1 s** –
ohne an Apify selbst etwas ändern zu müssen. Die harte Untergrenze bleibt der
Apify-Actor-Run (~4–8 s), solange kein Standby-/leichterer Actor verfügbar ist.

**Reihenfolge für den Dev:** Schritt 0 (Messen) → O3.1+O3.4 (Quick Wins, je < 1 h) →
O1 → O2.2 (Cache) → O2.1 → O4. Nach R1 (gemeinsames Importer-Modul) gelten alle
Optimierungen automatisch für Instagram, Facebook, Website **und** künftig TikTok (F1).
