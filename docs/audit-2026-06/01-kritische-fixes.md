# P0 – Kritische Fixes

> Diese Punkte betreffen Sicherheit, laufende Kosten und Store-Compliance.
> Reihenfolge innerhalb dieses Dokuments = empfohlene Bearbeitungsreihenfolge.

---

## Umsetzungsstatus 2026-06-12

| Punkt | Status | Erledigt | Offen |
|---|---|---|---|
| K1 | ✅ Code-Fix umgesetzt, externe Sicherheitsarbeit offen | Gemini-Foto-Scan läuft serverseitig über `convex/photoScan.ts`; Client lädt nur noch komprimierte Bilder in Convex Storage; Vite injiziert keine Gemini-Keys mehr; lokale Bundle- und Android-Asset-Secret-Suchen ohne Treffer | Alten Gemini-Key deaktivieren/rotieren; `GEMINI_API_KEY` in Production setzen; Prod deployen; Foto-Scan auf echtem Android-Gerät testen |
| K2 | 🟡 Sofortschutz umgesetzt, Zielarchitektur offen | Native App startet keinen Stripe-Checkout und kein Stripe-Portal mehr; Web nutzt Stripe weiter | RevenueCat/Play Billing/App Store Billing vollständig implementieren; Store-Sandbox-Tests; `billingProvider` sauber modellieren |
| K3 | ✅ Code-Fix umgesetzt, Prod-Cleanup offen | Pollinations-Key verlässt den Server nicht mehr; generierte Bilder werden serverseitig in Convex Storage gespeichert; Dev-Cleanup bereinigt 4 Dokumente, Nachlauf 0 Treffer | Production-Cleanup ausführen; alten Pollinations-Key rotieren, falls er produktiv genutzt wurde; Bildgenerierung auf Gerät testen |
| K4 | ✅ Lokal umgesetzt und gebaut | `usesCleartextTraffic` ist `false`; alte Storage-Permissions entfernt; `assembleDebug` erfolgreich | Smoke-Test auf echtem Android-Gerät |
| K5 | ✅ Quick Wins umgesetzt | `stripe_backup_code.txt` lokal gelöscht; tote `convex.config.ts` gelöscht; Apify-Token in Header verschoben; Auth0-Kommentar korrigiert; obsolete Android-Permissions entfernt | Lokale Signing-Secrets in `android/gradle.properties` weiter außerhalb von Git halten bzw. langfristig in sichere Secret-Verwaltung verschieben |

### Zusätzliche Notiz zu `npm run lint:all`

`npm run lint:all` bleibt ein separater Quality-Gate-Todo und wurde dokumentiert in
[10-quality-gate-lint-all.md](10-quality-gate-lint-all.md). Der aktuelle Zustand blockiert diese
Sicherheitsfixes nicht, ist aber noch nicht CI-tauglich.

---

## K1 – Gemini-API-Key liegt im Client-Bundle 🔴

### Wo
- `components/AddRecipeModal.tsx` Zeile ~346 und ~464: `import.meta.env.VITE_GEMINI_API_KEY`
- `components/addRecipeModal/aiScanRecipe.ts` Zeile ~65: `createGeminiClient(apiKey)` – ruft Gemini
  **direkt aus dem Browser/WebView** auf
- `vite.config.ts`, `define`-Block (ca. Zeile 48–51): injiziert zusätzlich
  `process.env.GEMINI_API_KEY` und `process.env.API_KEY` ins Bundle
- `.env.local` / `.env.production`: enthalten `VITE_GEMINI_API_KEY`

### Was / Beweis
Der Foto-Scan (Einzel- und Bulk-Upload) ruft die Gemini-API clientseitig auf. Alles mit
`VITE_`-Präfix wird von Vite wörtlich in den JavaScript-Bundle kompiliert. **Verifiziert:** Der
Key (beginnt mit `AIzaSyCI-nCy…`) steht im Klartext in `dist/assets/AddRecipeModal-*.js` **und**
in `android/app/src/main/assets/public/assets/AddRecipeModal-*.js` – also in jeder ausgelieferten
APK im Play Store.

### Warum kritisch
1. Jeder kann die APK entpacken (oder Web-DevTools öffnen) und den Key extrahieren → Nutzung auf
   Kosten des Betreibers, Quota-Diebstahl, mögliche Sperrung des Google-Projekts.
2. Der clientseitige Aufruf **umgeht das serverseitige Rate-Limiting komplett** – der
   `rateLimiter` kennt nur `website`/`instagram`/`facebook`, keinen `photo`-Bucket.
3. Das Free-Limit für Foto-Scans wird erst beim Speichern (`recipes.create`) geprüft – die
   Gemini-Kosten sind dann bereits angefallen.

### Wie fixen (Schritt für Schritt)

**Schritt 1 – Neue Convex-Action `convex/photoScan.ts` erstellen** (Vorbild: `convex/website.ts`):
```
"use node";
// Action: scanRecipePhoto({ storageId: Id<"_storage"> }): Promise<AiScanDoc>
```
1. Auth prüfen via `getAuthUserId` (wie in `website.ts:50`).
2. Neuen Rate-Limit-Bucket `"photo"` in `convex/rateLimiter.ts` ergänzen
   (Union in Zeile 12–16 erweitern) und hier konsumieren.
3. **Vor** dem Gemini-Call das Free-Limit prüfen (Logik aus `users.canScanPhoto` als interne
   Query wiederverwenden) → bei Limit `LIMIT_REACHED`-Error werfen wie in `recipes.create:331`.
4. Bild aus Convex Storage laden (`ctx.storage.get(storageId)`), zu Base64 konvertieren.
5. Gemini serverseitig aufrufen mit `process.env.GEMINI_API_KEY` (wie `website.ts:184`),
   Modell aus `GEMINI_MODELS.recipeImageScan`. Den Prompt `AI_SCAN_PROMPT_FIXED` und die
   Parsing-/Cleaning-Logik (`parseGeminiJson`, `cleanIngredients`, `cleanInstructions`,
   `buildAiScanImageUrl`) aus `components/addRecipeModal/aiScanRecipe.ts` hierher verschieben.
   Die Retry-Logik aus `utils/geminiRetry.ts` kann mitwandern (ist framework-frei).
   Tipp: `responseMimeType: "application/json"` + `responseJsonSchema` verwenden wie in
   `convex/instagram.ts:84` (robuster als Markdown-Stripping).

**Schritt 2 – Client umbauen** (`components/AddRecipeModal.tsx`):
1. `handleSingleImageUpload` / `handleBulkImageUpload`: Bild weiterhin clientseitig komprimieren
   (`compressImageForAi` bleibt im Client – spart Upload-Volumen), dann:
   - Upload-URL holen via bestehender Mutation `api.recipes.generateImageUploadUrl`
   - Komprimiertes JPEG per `fetch(uploadUrl, { method: "POST", body: blob })` hochladen
   - `api.photoScan.scanRecipePhoto({ storageId })` aufrufen
2. `createGeminiClient` und alle `GoogleGenAI`-Importe aus dem Frontend entfernen.
3. Der `__AI_SCAN__`-Marker-Mechanismus (AddRecipeModal.tsx:390) bleibt unverändert.

**Schritt 3 – Build-Konfiguration bereinigen:**
1. `vite.config.ts`: den kompletten `define`-Block mit `process.env.API_KEY` /
   `process.env.GEMINI_API_KEY` **ersatzlos löschen**.
2. `VITE_GEMINI_API_KEY` aus `.env.local`, `.env.production` und `README.md` (Zeile 68, 164) entfernen.
3. `manualChunks` in `vite.config.ts`: `vendor-ai`-Chunk (`@google/genai`) kann entfallen,
   sobald das Paket nur noch im Backend importiert wird. `@google/genai` aus den
   Frontend-Dependencies prüfen (wird von Convex-Node-Actions weiter gebraucht, bleibt also
   in package.json).

**Schritt 4 – Key rotieren (zwingend!):**
1. In Google AI Studio / Cloud Console einen **neuen** Gemini-Key erzeugen.
2. Neuen Key als `GEMINI_API_KEY` im Convex-Dashboard setzen.
3. **Alten Key deaktivieren.** Der alte Key ist in allen bisher ausgelieferten App-Versionen
   enthalten und muss als kompromittiert gelten – Rotation ohne Sperrung reicht nicht.
4. Neue App-Version bauen und in den Play Store bringen, damit der Foto-Scan für
   Bestandsnutzer weiter funktioniert (alte Versionen verlieren den Foto-Scan, sobald der
   alte Key gesperrt ist → Release-Notes entsprechend formulieren, ggf. In-App-Update-Hinweis).

### Definition of Done
- [x] `grep -r "AIza" dist/assets/` liefert **keine** Treffer nach frischem `npm run build`
- [x] Keine Gemini-Key-Referenzen in Vite-Config, Frontend-Code, Build-Assets oder lokalen `.env`-Dateien; verbleibende `VITE_GEMINI`-Treffer sind Audit-/Regressionstest-Kontext
- [ ] Foto-Scan (einzeln + bulk) funktioniert in der Android-App
- [ ] Rate-Limit greift: 11. Scan innerhalb einer Minute wird abgelehnt
- [x] Free-Limit greift **vor** dem Gemini-Call
- [ ] Alter Key in der Google-Konsole deaktiviert

**Aufwand:** ~1–2 Tage inkl. Tests.

---

## K2 – Stripe-Checkout kollidiert mit Store-Richtlinien (Play + App Store) 🔴

### Wo
- `pages/SubscribePage.tsx` Zeile ~49–76: `window.location.href = result.checkoutUrl`
- `convex/stripe.ts`: `createCheckoutSession` (Checkout), `createPortalSession`, `cancelSubscription`

### Was
Cookly Pro (2,99 €/Monat bzw. 24,99 €/Jahr) ist ein **digitales Abo**, das App-Features
freischaltet, und wird in der Android-App über Stripe-Checkout im Browser verkauft.

### Warum kritisch
- **Google Play:** Die Payments-Policy verlangt für digitale Güter/Abos **Google Play Billing**.
  Externe Checkout-Flows für digitale Inhalte sind ein Policy-Verstoß → latentes Risiko, dass die
  App bei einem Review entfernt wird (bisher nicht aufgefallen ≠ erlaubt).
- **Apple App Store:** Noch strikter (Guideline 3.1.1). Ohne In-App-Purchase kommt der iOS-Port
  mit hoher Wahrscheinlichkeit **nicht durch das Review**. Die EU-DMA-/US-Ausnahmen (externe
  Purchase-Links) existieren, sind aber bürokratisch und für eine Indie-App unpraktikabel.

### Wie fixen (empfohlene Architektur)
**RevenueCat** als Abstraktionsschicht über StoreKit (iOS) + Play Billing (Android) einführen.
Kostenlos bis 2.500 $ Monatsumsatz, offizielles Capacitor-SDK (`@revenuecat/purchases-capacitor`).

1. **Produkte anlegen:** In Play Console + App Store Connect die Abos `pro_monthly` (2,99 €)
   und `pro_yearly` (24,99 €) als Subscription-Produkte anlegen; in RevenueCat als
   "Entitlement" `pro` mit beiden Produkten konfigurieren.
2. **Backend (Convex):**
   - Neue HTTP-Route `/revenuecat/webhook` in `convex/http.ts` (Vorbild: Stripe-Handler dort,
     inkl. Authorization-Header-Prüfung mit Shared Secret und Idempotenz über die bestehende
     `stripeWebhookEvents`-Tabelle – ggf. in `billingWebhookEvents` umbenennen).
   - Webhook-Events (`INITIAL_PURCHASE`, `RENEWAL`, `CANCELLATION`, `EXPIRATION`) auf die
     bestehenden internen Mutations mappen (`users.updateSubscriptionByConvexUserId` etc. –
     die Update-Logik in `convex/users.ts:643ff` kann unverändert wiederverwendet werden).
   - RevenueCat `app_user_id` = Convex-User-ID setzen, damit das Mapping trivial ist.
3. **Frontend:** `pages/SubscribePage.tsx` plattformabhängig verzweigen:
   - `Capacitor.isNativePlatform()` → RevenueCat-Paywall/`purchasePackage()`
   - Web → bestehender Stripe-Flow (im Web ist Stripe erlaubt und bleibt!)
4. **Abo-Quelle im User-Dokument vermerken** (neues optionales Feld `billingProvider:
   "stripe" | "revenuecat"` in `convex/schema.ts`), damit `createPortalSession` /
   `cancelSubscription` wissen, wohin sie leiten müssen (Stripe-Portal vs. Store-Abo-Verwaltung).
5. **Migration Bestandskunden:** Bestehende Stripe-Abos weiterlaufen lassen (Grandfathering).
   Nur Neuabschlüsse in der App laufen über die Stores.

### Definition of Done
- [ ] Android: Abo-Abschluss läuft über Play Billing (Sandbox-Test mit Lizenztester-Account)
- [ ] Webhook setzt `subscription`/`subscriptionStatus` korrekt in Convex
- [ ] Kündigung/Ablauf führt zu Downgrade auf `free` (inkl. `resetOnDowngrade`-Logik)
- [x] Web-Version nutzt weiterhin Stripe
- [ ] Beide Wege landen konsistent im selben User-Dokument
- [ ] Stripe-Bestandskunden behalten ihren Pro-Status

**Aufwand:** ~1–2 Wochen inkl. Store-Konfiguration und Sandbox-Tests.
**Hinweis:** Dieser Umbau ist Voraussetzung für den iOS-Port → [04-ios-port-guide.md](04-ios-port-guide.md).

---

## K3 – Pollinations-API-Key leakt über Bild-URLs an den Client 🟠

### Wo
- `convex/pollinationsHelper.ts`: `buildPollinationsUrl()` hängt `key: apiKey` als Query-Parameter an
- `convex/recipes.ts` Zeile ~760–775 (`generateAndStoreAiImage`): gibt diese URL **an den Client zurück**
- `components/AddRecipeModal.tsx` Zeile ~45/153: verwendet die URL im Frontend; sie wird
  anschließend im Rezept (`image`-Feld) gespeichert
- Auch `proxyExternalImage` (recipes.ts ~797) baut solche URLs als Fallback

### Was / Warum
Jede generierte Bild-URL enthält `?key=POLLINATIONS_API_KEY`. Die URL geht an den Client, wird in
der DB gespeichert und vom `<img>`-Tag geladen → der Key ist für jeden Nutzer sichtbar
(Netzwerk-Tab) und liegt dauerhaft in Rezept-Dokumenten. Schadenpotenzial geringer als bei K1
(Pollinations ist günstig), aber gleiches Muster: fremde Nutzung auf eigene Kosten.

### Wie fixen
1. `generateAndStoreAiImage` umbauen: Bild **serverseitig** von Pollinations fetchen
   (Code dafür existiert schon in `proxyExternalImage`, recipes.ts ~804–828), in Convex Storage
   speichern und **nur die Storage-URL** zurückgeben. Die Pollinations-URL mit Key verlässt den
   Server nie.
2. Alternativ (einfacher, falls ohne Key akzeptabel): die key-lose Variante
   `https://image.pollinations.ai/prompt/...?nologo=true` verwenden, wie sie `convex/website.ts:233`
   und `aiScanRecipe.ts` bereits nutzen → dann `POLLINATIONS_API_KEY` komplett streichen.
   (Entscheidung: Key bringt höhere Rate-Limits/Qualität bei `gen.pollinations.ai` – prüfen, ob nötig.)
3. **Bestandsdaten bereinigen:** Internal Mutation schreiben, die alle `recipes` mit
   `key=` in `image`/`sourceImageUrl` findet und den Query-Parameter entfernt oder das Bild
   über `proxyExternalImage` in Storage überführt.
4. Pollinations-Key rotieren (gleiche Begründung wie K1).

### Definition of Done
- [x] Kein `key=`-Parameter mehr in URLs, die an den Client gehen
- [x] Cleanup-Mutation auf Dev ausgeführt: 4 Rezepte bereinigt, Nachlauf 0 Treffer
- [ ] Cleanup-Mutation auf Prod ausgeführt (Anzahl bereinigter Rezepte loggen)
- [ ] Bild-Generierung im "Neues Bild"-Flow funktioniert weiterhin

**Aufwand:** ~0,5–1 Tag.

---

## K4 – `usesCleartextTraffic="true"` im Android-Manifest 🟠

### Wo
`android/app/src/main/AndroidManifest.xml`, Zeile ~11 (`<application android:usesCleartextTraffic="true">`)

### Was / Warum
Erlaubt unverschlüsselte HTTP-Verbindungen in der ganzen App – widerspricht direkt dem Kommentar
`allowMixedContent: false // SECURITY: Only HTTPS in production` in `capacitor.config.ts:29`.
Alle Backend-Dienste (Convex, Stripe, Apify, Jina, Pollinations) sind HTTPS-only; es gibt keinen
bekannten Grund für Cleartext.

### Wie fixen
1. Attribut auf `android:usesCleartextTraffic="false"` setzen (oder ganz entfernen – Default ist
   `false` seit API 28).
2. Debug-Build auf Gerät testen: App-Start, Login, Rezept-Import, Bilder-Laden. Falls ein Dienst
   (z. B. ein gescraptes Rezeptbild mit `http://`-URL) bricht: gezielt eine
   `network_security_config.xml` mit Ausnahmen verwenden statt global Cleartext zu erlauben.
   Hinweis: `proxyExternalImage` überführt externe Bilder ohnehin in Convex Storage (HTTPS).

### Definition of Done
- [x] Manifest ohne Cleartext-Erlaubnis
- [x] Nativer Debug-Build erfolgreich
- [ ] Smoke-Test der Kernflows auf echtem Gerät bestanden

**Aufwand:** ~1 Stunde.

---

## K5 – Sicherheits-Hygiene (Quick Wins) 🟡

1. **`stripe_backup_code.txt` im Projektordner** (Repo-Root): enthält einen echten
   Stripe-Backup-Code im Klartext. Ist gitignored, liegt aber unverschlüsselt auf der Platte.
   → In Passwort-Manager übertragen, Datei löschen. Falls die Datei jemals committet war
   (`git log --all -- stripe_backup_code.txt` prüfen): Code bei Stripe neu generieren.
2. **`convex.config.ts` (Repo-Root)** enthält tote Clerk-Konfiguration
   (`CLERK_JWT_ISSUER_DOMAIN`, hardcodierte Clerk-Dev-Domain). Auth läuft längst über
   `@convex-dev/auth` (`convex/auth.config.js`). → Datei löschen oder auf den tatsächlichen
   Stand reduzieren; vorher mit `npx convex dev` verifizieren, dass nichts bricht.
3. **Veraltete Manifest-Permissions:** `READ_EXTERNAL_STORAGE` / `WRITE_EXTERNAL_STORAGE` sind ab
   targetSdk 33+ wirkungslos bzw. durch `READ_MEDIA_IMAGES` ersetzt → entfernen
   (weniger Permissions = besseres Play-Review).
4. **Apify-Token als URL-Query-Parameter** (`convex/instagram.ts:564`, `convex/facebook.ts:580`):
   Token in URLs landen in Server-/Proxy-Logs. → Stattdessen Header
   `Authorization: Bearer ${APIFY_TOKEN}` verwenden (von Apify unterstützt).
5. **`index.html`:** Preconnect-Kommentar "Auth0" ist irreführend (es gibt kein Auth0);
   `accounts.cookly-app.com`-Preconnect prüfen und ggf. entfernen.

**Aufwand:** ~2–3 Stunden gesamt.
