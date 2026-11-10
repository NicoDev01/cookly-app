# iOS-Native-Audit (10.11.2026)

Frage: Wo verhält sich Cookly noch wie eine Web-App, und was macht iOS langsam oder ruckelig?
Grundlage: Code auf `main` (07a3506), `npm run build`, Chromium 375×812 und headless WebKit (iPhone 13) gegen den Dev-Server.

Status: **Behoben** = in diesem Branch erledigt. Alles andere ist offen.

## Muss

| # | Befund | Wo | Lösung | Status |
|---|---|---|---|---|
| M1 | Langes Drücken auf jeden Link (Tabs, Rezeptkarten, Favoriten) öffnet Safaris Link-Vorschau. Capacitor-Default ist `allowsLinkPreview = YES`; das kollidiert mit den eigenen Long-Press-Menüs. | `capacitor.config.ts` (`ios`) | `ios.allowsLinkPreview: false`. Wirkt nach `cap sync` (macht `build:ios`). | **Behoben** |
| M2 | Ganze App ist markierbar: Langes Drücken auf Überschriften, Labels, Bilder zeigt Lupe, „Kopieren / Nachschlagen“ bzw. „Bild sichern“. In WebKit gemessen: `body` hatte `user-select: text`. | `index.css` (Basis) | `body { user-select: none; -webkit-touch-callout: none }`, `img { -webkit-user-drag: none }`. Eingabefelder bleiben markierbar; Texte, die kopierbar sein sollen, mit `select-text` freigeben. | **Behoben** |
| M3 | Return auf der iOS-Tastatur im Passwortfeld „klickt“ zuerst „Passwort anzeigen“ (erster Submit-Button im Formular) und zeigt das Passwort im Klartext, dann erst Login. In WebKit reproduziert. | `components/ui/cookly/IconButton.tsx` (betrifft Sign-in, Sign-up, Passwort vergessen) | `type="button"` als Default, per Props überschreibbar. | **Behoben** |
| M4 | Hover-Zustände bleiben nach dem Antippen hängen (Tailwind 3 erzeugt `hover:` ohne Media-Query; dazu 14 rohe `:hover`-Regeln). | `tailwind.config.js`, `styles/components.css` | `future.hoverOnlyWhenSupported: true`; `:hover`-Regeln in `@media (hover: hover)`. | **Behoben** |
| M5 | Kein `@capacitor/keyboard`: Die WKWebView verschiebt beim Fokus die ganze Seite (Ursache des „App verrutscht“-Gefühls, das `ccea167` nur teilweise abfängt), die Formular-Zubehörleiste („‹ › Fertig“) erscheint, und Sheets mit `vh`-Höhe (`BottomSheet.tsx:15` 80vh, `MealPlanModal.tsx:226` 92vh) schrumpfen nicht mit, Eingaben landen unter der Tastatur. | `package.json`, `capacitor.config.ts`, `App.tsx` | `@capacitor/keyboard` 8.0.6 mit `resize: native`, `style: LIGHT`; auf iOS beim Start `setAccessoryBarVisible(false)`, Tab-Leiste über `html.keyboard-open` ausgeblendet, solange die Tastatur offen ist. Wirkungsloser `translateZ(0)`-Fokus-Hack (K7) entfernt. `cap sync` für iOS und Android gelaufen. **Auf dem iPhone noch ungetestet.** | **Behoben** |
| M6 | Offline-Kaltstart: Splash wartet auf `useConvexAuth` + `getCurrentUser` (Netz). Ohne Netz bleibt er bis zum 15-s-Sicherheits-Timeout, danach rendert `ProtectedLayout` `null` (leerer Bildschirm). Ungeprüft, im Flugmodus testen. | `App.tsx:283-317`, `App.tsx:118` | Letzten `currentUser` lokal merken und damit sofort rendern; Splash nach Auth-Token aus dem Speicher statt nach Server-Antwort ausblenden; Offline-Hinweis statt Leere. | offen |

## Sollte

| # | Befund | Wo | Lösung | Status |
|---|---|---|---|---|
| S1 | Start-Bundle: `manualChunks` steckte **alle** `node_modules` in `vendor-base`, also auch Shader (`@paper-design/shaders`), Embla-Karussell, RevenueCat, blurhash, tailwind-merge, die nur Unterseiten brauchen. Start lud 600 kB JS (gzip 192 kB). | `vite.config.ts` | Nur React, Router, Sentry, `@capacitor/core` in `vendor-base`; Rest legt Rollup zu den Seiten. Jetzt 485 kB (gzip 155 kB), −19 %. | **Behoben** |
| S2 | PostHog (309 kB) wurde direkt beim Start importiert und konkurrierte mit erstem Bild und Convex-Verbindung. | `services/analytics.ts` | Import im Idle (≤ 3 s, WKWebView ohne `requestIdleCallback`: 1,5 s); Events puffert `pending` schon heute. | **Behoben** |
| S3 | Session-Recording ist im Client an (`disable_session_recording: false`, Autocapture an). Wenn es im PostHog-Projekt aktiv ist, beobachtet rrweb jede DOM-Änderung, auch beim Scrollen und bei Animationen. | `services/analytics.ts:71` | Im PostHog-Projekt prüfen; falls nicht genutzt `disable_session_recording: true`, sonst sampeln. | offen (Entscheidung) |
| S4 | Aktiven Tab nochmal antippen scrollte nicht nach oben (iOS-Standard). | `components/AppNav.tsx`, `components/TabsLayout.tsx` | Tab-Container bekommen `data-tab-scroll`; Re-Tap scrollt weich nach oben. In WebKit geprüft (300 → 0). | **Behoben** |
| S5 | Keine Zurück-Wischgeste. Auf der Rezeptseite ist horizontales Wischen zudem schon mit dem Rezept-Karussell belegt. | `pages/RecipePage.tsx:345` | Randzone (ca. 20 px links) als Zurück-Geste mit `handleBack`, Embla dort nicht ziehen lassen. Alternative: `allowsBackForwardNavigationGestures` in einem eigenen `CAPBridgeViewController`, passt aber schlecht zur zustandsbasierten Zurück-Logik (S7). | offen |
| S6 | Sheets lassen sich nicht nach unten wegwischen und verschwinden ohne Ausblend-Animation. | `components/weekly/BottomSheet.tsx`, `components/MealPlanModal.tsx` | Gemeinsamer Drag-to-dismiss am Griff/Kopf (Pointer-Events, Schwelle ~100 px oder Geschwindigkeit) plus Exit-Animation. | offen |
| S7 | „Zurück“ navigiert per `navigate(ziel)` vorwärts statt `navigate(-1)`: Der Verlauf wächst endlos, und eine spätere Wischgeste hätte keinen echten Rückweg. | `hooks/useBackNavigation.ts:35-57` | Wenn ein Vorgänger im Verlauf existiert (`location.key !== 'default'`), `navigate(-1)`; sonst wie heute. | offen |
| S8 | Start fühlt sich träger an als nötig: Splash wird erst 300 ms nach „bereit“ ausgeblendet, danach blendet die Kategorienseite noch 300 ms von Deckkraft 0 ein (zusätzlich zu `page-enter`). | `App.tsx:311`, `pages/CategoriesPage.tsx:96, 253` | Splash nach `requestAnimationFrame` statt 300 ms ausblenden; Opacity-Fade der Kategorienseite streichen (`page-enter` reicht). Optik vorher auf dem iPhone ansehen. | offen |

## Kann

| # | Befund | Wo | Lösung |
|---|---|---|---|
| K1 | Rund 1 MB ungenutzte Dateien landen in jedem App-Paket: `welcome-video.webm` (522 kB), `alle-rezepte1.webp` (255 kB), `favcon.jpg` (100 kB), `cookly-mascot.webp`, `play-store-icon-512.png`. Keine Referenz im Code. | `public/` | Löschen oder nach `assets/` verschieben. |
| K2 | Logo auf der Startseite ist 67 kB für 40 px Höhe. | `pages/CategoriesPage.tsx:259` | Auf 3× Anzeigegröße verkleinern (wenige kB). |
| K3 | Keine Universal Links (`applinks:` fehlt in den Entitlements); `https://cookly-app.com/…` öffnet Safari statt der App. | `ios/App/App/App.entitlements` | Associated Domains + `apple-app-site-association` auf der Website (separates Repo). |
| K4 | Quell-Link im Rezept (`target="_blank"`) und `window.open` in „So funktioniert's“ verlassen die App (Capacitor reicht an `UIApplication.open` weiter). Für Instagram/TikTok ist das richtig (öffnet die App), für Webseiten wäre `Browser.open` (In-App-Safari) nativer. | `components/RecipeMeta.tsx:108`, `components/HowItWorksModal.tsx:69` | Nach Host unterscheiden: Social-Hosts extern, sonst `ExternalLink`/`Browser.open`. |
| K5 | Fehlerseite „Zur Startseite“ lädt die ganze App neu. | `components/ErrorState.tsx:119` | Als Fehler-Fallback vertretbar; alternativ Hash setzen und Boundary zurücksetzen. |
| K6 | `console.log` mit Convex-URL und Origin bei jedem Start, auch im Release. | `convexClient.ts:5-6` | Über `logger.debug` laufen lassen. |
| K7 | ~~`transform: translateZ(0)` auf fokussierten Feldern~~ mit M5 entfernt. `scroll-margin-bottom: 50vh` bleibt; auf dem Gerät prüfen, ob Felder dadurch zu weit nach oben springen. | `index.css:282` | Bei Bedarf auf einen festen Wert (z. B. 6rem) senken. |
| K8 | Emojis als Ladeindikatoren (⏳ 🧠 ⚙️) im Foto-Scan wirken nach Webseite. | `components/addRecipeModal/AiScan.tsx:91-136` | Durch die vorhandenen Lade-Komponenten ersetzen. |
| K9 | Jede Rezeptseite abonniert die komplette Einkaufsliste, nur um markierte Zutaten zu zeigen. Klein, aber pro geöffnetem Rezept ein Abo mehr. | `components/Ingredients.tsx:16` | Bei Bedarf schlanke Query (nur Keys); laut Budget-Regel vertretbar. |

## Geprüft, in Ordnung

- **Zoom/Verschieben bei Eingaben:** 16-px-Felder, `maximum-scale=1`, Shell `fixed` + `html.app-shell` (seit `ccea167`). Rest siehe M5.
- **Rubber-Band:** Capacitor setzt `scrollView.bounces = false`; die Tab-Container federn nativ und haben `overscroll-y-contain`.
- **Tap-Highlight:** global `transparent`. **Kein** `alert`/`confirm` im App-Code, kein Pull-to-Refresh.
- **Safe Areas:** Notch und Home-Indikator über `env(safe-area-inset-*)` in allen Tabs, Sheets und der Navigationsleiste.
- **Tabs:** bleiben über `<Activity>` gemountet, kein Neuladen. Scroll-Position je Tab bleibt erhalten (Chromium und WebKit gemessen).
- **Convex je Tab:** Listen nutzen Vorschau-Queries (`listPreviews`, `searchPreviews`), Details nur auf der Rezeptseite, optionale Queries mit `"skip"`.
- **Bilder:** `ImageWithBlurhash` lädt erst im Sichtbereich und fordert die passende Größe an.
- **Shader** (`liquid-metal-border.tsx`): nur im Profil für Free-Nutzer, pausiert außerhalb des Sichtbereichs und wird beim Tab-Wechsel entsorgt. Mit S1 nicht mehr im Start-Bundle.
- **Haptik, Statusleiste, Lottie-Splash, Deep Links (OAuth, Share-Target), App-Resume (Share-Intent):** vorhanden und plausibel.

## Import-Screen (nur aufgenommen)

`pages/ShareTargetPage.tsx` ist lazy und nicht vorgeladen; der erste Share nach Kaltstart wartet zusätzlich auf diesen Chunk. Details zur Import-Dauer stehen in `docs/audit-2026-06` (Doc 09). Nicht angefasst.

## Messwerte

| | vorher | nachher |
|---|---|---|
| JS im Startpfad (index + vendor-base + vendor-convex) | 600 kB / gzip 192 kB | 485 kB / gzip 155 kB |
| PostHog | beim Start importiert | im Idle, ca. 1,5–3 s nach Start |

Convex-Usage (Function Calls, Bandwidth) vor dem Release im Dashboard notieren; dieser Branch ändert keine Queries.
