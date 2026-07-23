# Cookly – verbindlicher Audit-Umsetzungsplan

Stand: 11.07.2026  
Zielgruppe: umsetzender Entwicklungsagent und nachgelagerter Reviewer  
Geltungsbereich: aktuelle Web-/Android-App; iOS erst nach Abschluss der Android- und Backend-Gates

## 1. Zielzustand

Die Umsetzung ist abgeschlossen, wenn folgende Eigenschaften nachweisbar sind:

1. Kein Nutzer kann Cookly als SSRF-Proxy oder als unbegrenzten Datei-/KI-Kostenkanal verwenden.
2. Jede gespeicherte Datei besitzt einen verifizierten Eigentümer, einen Zweck und einen Lebenszyklus.
3. Kostenpflichtige Importvorgänge sind idempotent, transaktional reserviert und auch bei Parallelaufrufen begrenzt.
4. Eine Kontolöschung beendet Stripe-Abrechnung, löscht alle zuordenbaren Daten und ist wiederholbar.
5. Produktionsabhängigkeiten enthalten keine bekannten hohen oder kritischen Schwachstellen.
6. Android erfüllt die technischen Release-Gates; native Abos verwenden Google Play Billing.
7. Lint, Tests, Build, Dependency-Audit und Android-Lint laufen automatisiert in CI.
8. Import-, Listen- und Logging-Code ist skalierbar, datensparsam und modular prüfbar.
9. Der iOS-Port beginnt erst nach Erfüllung der definierten Eingangskriterien.

## 2. Verifizierter Ausgangsstand

| Bereich | Befund am 11.07.2026 |
|---|---|
| Web-Build | `npm run build:check` erfolgreich |
| vorhandene Node-Tests | 74 Tests erfolgreich |
| ESLint | 84 Fehler, 13 Warnungen |
| Produktionsabhängigkeiten | 7 Befunde: 4 hoch, 3 moderat |
| Android-Lint/Unit-Test | erfolgreich; 0 Fehler, 33 Warnungen |
| Android SDK | min 24, compile/target 36 |
| Android Release-Lint | durch `abortOnError false` und `checkReleaseBuilds false` deaktiviert |
| CI | keine `.github/workflows` vorhanden |
| Test-Skript | kein einheitliches `npm test` in `package.json` |
| iOS | kein `ios/`-Projekt und kein `@capacitor/ios` |
| Arbeitsbaum | bereits umfangreich verändert; vorhandene Änderungen gehören nicht automatisch zu diesem Plan |

Kritische Codebelege:

- `convex/recipes.ts`, `proxyExternalImage`: lädt `sourceImageUrl` ohne Netzwerkziel-, Redirect- oder Größenprüfung vollständig in den Speicher.
- `convex/recipes.ts`, `generateAndStoreAiImage`: nur Authentifizierung; keine Nutzungs- oder Budgetgrenze.
- `convex/recipes.ts`, `generateImageUploadUrl`: nur Authentifizierung; keine Zweckbindung oder Eigentumsregistrierung.
- `convex/photoScan.ts`, `scanRecipePhoto`: prüft das Free-Limit vor Gemini, reserviert aber keinen Verbrauch und prüft den Eigentümer des `storageId` nicht.
- `convex/recipes.ts`, `create`: zählt Link-/Fotoverbrauch erst beim Speichern; Apify/Jina/Gemini wurden zu diesem Zeitpunkt bereits aufgerufen.
- `convex/users.ts`, `deleteCurrentUser`: löscht lokal, beendet aber kein Stripe-Abo und entfernt nicht alle namensräumlich gespeicherten API-Limitdaten.
- `convex/recipes.ts`, `listPaginated`: `collect()` plus `slice()` statt Cursor-Pagination.
- `convex/recipes.ts`, `listPreviews`: lädt alle Rezepte eines Nutzers.
- `convex/shopping.ts`: vorhandener Index `by_user_key` wird in den Schreibpfaden nicht genutzt.
- `App.tsx`, `checkIntent`: erkennt Duplikate, navigiert bei Duplikaten jedoch trotzdem; vollständige Share-Daten werden geloggt.
- `utils/logger.ts`: speichert auch in Produktion sämtliche Debug-Daten; Objektinhalte werden nicht rekursiv redigiert.
- `AndroidManifest.xml`: unnötige Kamera-/Medienrechte, `allowBackup=true`, kein `adjustResize`.
- `index.html`: `viewport-fit=cover` fehlt.

## 3. Verbindliche Architekturentscheidungen

Der Umsetzungsagent darf diese Entscheidungen nicht eigenmächtig ändern:

| ID | Entscheidung |
|---|---|
| D1 | Ein erfolgreicher externer Extraktionsvorgang verbraucht das Importkontingent auch dann, wenn der Nutzer den Entwurf anschließend nicht speichert. Fehlschläge vor einer verwertbaren Extraktion verbrauchen kein Produktkontingent, aber weiterhin das technische Rate-Limit. |
| D2 | Kontingente werden vor externen Aufrufen atomar reserviert und danach `committed` oder `released`; bloßes „erst prüfen, später zählen“ ist unzulässig. |
| D3 | Neue Uploads erhalten einen Eintrag in `storageAssets`; unregistrierte oder fremde Storage-IDs dürfen nicht an Rezepte/Kategorien gebunden oder gescannt werden. |
| D4 | Für die native Abrechnung wird RevenueCat mit `@revenuecat/purchases-capacitor` verwendet. Web-Abos bleiben zunächst bei Stripe. Convex bleibt die kanonische Berechtigungsquelle. |
| D5 | Beim Löschen eines Kontos wird ein vorhandener Stripe-Kunde sofort gelöscht; Stripe beendet dadurch aktive Abos. Bei Store-Abos wird die Löschung nicht blockiert, aber der Nutzer muss vorab auf die separate Store-Verwaltung hingewiesen werden. |
| D6 | Kamera- und breite Medienbibliotheksrechte werden entfernt, solange die App ausschließlich den System-Dateiauswahldialog/Web-Dateiinput nutzt. |
| D7 | Kein globaler, nutzerübergreifender Rezept-Extraktionscache in dieser Umsetzungsrunde. Er wird erst nach Datenschutzprüfung und Messung realer Kosten eingeführt. |
| D8 | Kein Big-Bang-Refactoring. Sicherheitsinvarianten werden vor Strukturrefactorings umgesetzt und durch Charakterisierungstests geschützt. |

## 4. Arbeitsvertrag für den Umsetzungsagenten

Immer nur **ein** Arbeitspaket bearbeiten. Der Auftrag an ein schwächeres Modell besteht aus diesem Abschnitt plus genau einem Arbeitspaket.

### Vor jeder Änderung

- [ ] `git status --short` ausführen und fremde Änderungen dokumentieren.
- [ ] Code zuerst über Codebase-Memory suchen; keine Dateinamen oder Aufrufpfade raten.
- [ ] Betroffene Symbole und Aufrufer nennen.
- [ ] Relevante bestehende Tests vor der Änderung ausführen.
- [ ] Keine generierten Dateien in `convex/_generated/`, `dist/` oder `android/app/build/` manuell ändern.
- [ ] Keine Nebenrefactorings und keine automatischen Massenfixes.

### Während der Änderung

- [ ] Datenmodelländerungen rückwärtskompatibel einführen: zuerst neue optionale Felder/Tabellen und Backfill, danach strengere Nutzung.
- [ ] Externe Aufrufe idempotent machen; keine Retry-Logik ohne Idempotenzschlüssel.
- [ ] Nutzerfehler als stabile Fehlercodes modellieren; keine Provider- oder Secret-Details an den Client geben.
- [ ] Neue Grenzwerte zentral in Konfiguration/Konstanten definieren.
- [ ] Bei Fehlern fail-closed handeln, sofern Sicherheit, Eigentum oder Billing betroffen ist.

### Pflichtbericht nach jedem Paket

1. Geänderte Dateien und Zweck je Datei.
2. Erfüllte Akzeptanzkriterien mit Testbeleg.
3. Ausgeführte Befehle samt Exit-Code.
4. Nicht gelöste Befunde und bewusste Abweichungen.
5. Migrations-, Deployment- und Rollback-Hinweise.

### Gemeinsames Abschluss-Gate

Soweit im jeweiligen Paket anwendbar:

```text
npm test
npm run build:check
npm run lint
npm run knip
npm run jscpd
npm run ast-grep
npm audit --omit=dev --audit-level=high
cd android && .\gradlew.bat lintDebug testDebugUnitTest
```

Ein Paket ist nicht abgeschlossen, wenn ein neuer Fehler eingeführt wurde. Bereits vorhandene, außerhalb des Pakets liegende Fehler müssen im Bericht getrennt ausgewiesen werden.

## 5. Reihenfolge und Abhängigkeiten

```text
AP-00 Baseline
  ├─ AP-01 SSRF/Remote-Downloads
  ├─ AP-02 Storage-Eigentum ─┐
  └─ AP-03 Importoperationen/Quota ─┤
                                   ├─ AP-04 Kontolöschung
                                   └─ AP-06 Native Abrechnung
AP-05 Dependency-Sicherheit ────────┘
AP-07 Quality-Gate → AP-08 Tests/CI
AP-09 Android-Härtung
AP-10 Import-Refactoring
AP-11 Datenzugriff/Pagination
AP-12 Logging/Observability
AP-13 Android-Release-Gate
AP-14 iOS-Befähigung
```

AP-01 bis AP-06 sind P0. AP-07 bis AP-13 sind P1. AP-14 ist nachgelagert und darf erst nach dem Android-Release-Gate beginnen.

---

## AP-00 – Baseline und Schutznetz

**Priorität:** P0-Vorbereitung  
**Ziel:** reproduzierbaren Ausgangszustand dokumentieren, ohne Verhalten zu ändern.

### Scope

- `package.json`
- neuer Bericht `docs/implementation-baseline-YYYY-MM-DD.md`
- keine Produktionslogik

### Umsetzung

1. Vorhandene Änderungen mit `git status --short` erfassen; nichts zurücksetzen.
2. Ein `test`-Skript ergänzen, das exakt die derzeit vorhandenen Node-Tests startet:
   `node --test utils/*.test.mjs components/addRecipeModal/*.test.mjs`.
3. Folgende Befunde maschinenlesbar oder als Tabelle festhalten: Build, Tests, ESLint, Knip, JSCPD, Ast-Grep, npm audit, Android-Lint.
4. Für AP-01 bis AP-04 je mindestens einen aktuell fehlschlagenden Sicherheits-/Regressionstest als Testentwurf benennen; die eigentlichen Tests entstehen im jeweiligen Paket.

### Nicht tun

- Keine Lint-Massenbehebung.
- Keine Dependency-Updates.
- Keine Produktionsdateien refactoren.

### Akzeptanzkriterien

- [ ] `npm test` reproduziert die vorhandenen 74 grünen Tests.
- [ ] Baseline nennt Exit-Codes und Zahlen, nicht nur „grün/rot“.
- [ ] Fremde Arbeitsbaumänderungen bleiben unverändert.

---

## AP-01 – SSRF-sichere Remote-Bilder und begrenzte Downloads

**Priorität:** P0  
**Vorgänger:** AP-00  
**Ziel:** `proxyExternalImage` und alle künftigen serverseitigen Bilddownloads dürfen nur öffentliche, zulässige Bildquellen mit festen Ressourcenlimits abrufen.

### Betroffene Stellen

- `convex/recipes.ts`: `proxyExternalImage`, `generateAndStoreAiImage`
- `convex/instagram.ts`, `convex/facebook.ts`, `convex/website.ts`: Herkunft/Provider an den Bildpfad übergeben
- `convex/pollinationsHelper.ts`
- neu: `convex/remoteImages.ts` als Node-Action-Modul
- neu: `convex/lib/remoteImagePolicy.ts` als pure, testbare Regeln
- neue Tests für URL-, DNS-, Redirect-, MIME- und Größenregeln

### Zielarchitektur

`convex/remoteImages.ts` enthält wegen DNS-Auflösung und Node-APIs ausschließlich Actions und beginnt mit `"use node"`. Queries und Mutations verbleiben in anderen Modulen. Jeder Abruf nutzt eine zentrale Funktion `fetchValidatedRemoteImage`.

Die Funktion erhält mindestens:

- `url`
- `provider`: `instagram | facebook | website | pollinations`
- `maxBytes`
- `timeoutMs`

### Umsetzung

1. URL mit WHATWG `URL` parsen; nur `https:` zulassen. `http:`, Credentials, ungewöhnliche Ports, Fragmente und alle Nicht-HTTP-Schemata ablehnen.
2. Für bekannte Provider strikte Host-Suffix-Allowlist verwenden; Suffixprüfung muss Labelgrenzen beachten (`host === suffix` oder `host.endsWith('.' + suffix)`).
3. Bei Website-Bildern Host auflösen und **alle** A-/AAAA-Adressen klassifizieren. Loopback, private, link-local, multicast, unspecified, Carrier-Grade-NAT und Cloud-Metadatenziele ablehnen.
4. `redirect: 'manual'` verwenden. Maximal drei Redirects; jedes Ziel erneut vollständig prüfen. Relative `Location` korrekt gegen die aktuelle URL auflösen.
5. Kein automatisches Retry. Ein Gesamt-Timeout und ein Download-Timeout verwenden.
6. `Content-Length` vorab gegen `MAX_REMOTE_IMAGE_BYTES` prüfen. Body gestreamt lesen und bei Überschreitung sofort abbrechen; kein unbeschränktes `arrayBuffer()`.
7. Nur `image/jpeg`, `image/png`, `image/webp`, optional `image/avif` zulassen. SVG, HTML und unbekannte Typen ablehnen. Zusätzlich Magic Bytes gegen den behaupteten MIME-Type prüfen.
8. Gespeicherten Blob mit verifiziertem MIME-Type anlegen. Fehler nur als stabile Codes zurückgeben, z. B. `REMOTE_IMAGE_BLOCKED`, `REMOTE_IMAGE_TOO_LARGE`, `REMOTE_IMAGE_INVALID_TYPE`, `REMOTE_IMAGE_TIMEOUT`.
9. `proxyExternalImage` in `convex/recipes.ts` durch den neuen Pfad ersetzen oder in das Node-Modul verschieben. Ownership des Rezepts weiterhin vor dem Abruf prüfen.
10. Pollinations-Downloads durch dieselbe Größen-/MIME-Pipeline führen; der bekannte Host darf nicht von einem Clientwert überschrieben werden.
11. Fehler beim optionalen Bild-Proxy dürfen das bereits gespeicherte Rezept nicht löschen; das externe Bild bleibt als Fallback, Sicherheitsfehler werden aber strukturiert geloggt.

### Tests

- [ ] `https://127.0.0.1`, IPv6-Loopback, dezimale/hexadezimale IP-Darstellungen und `localhost` werden abgelehnt.
- [ ] DNS-Antwort mit mindestens einer privaten Adresse wird abgelehnt.
- [ ] Redirect von erlaubtem Host auf private Adresse wird abgelehnt.
- [ ] Redirect-Schleife und mehr als drei Redirects werden abgelehnt.
- [ ] Übergröße mit und ohne `Content-Length` wird abgebrochen.
- [ ] `text/html`, SVG und MIME/Magic-Byte-Widerspruch werden abgelehnt.
- [ ] gültiges JPEG/PNG/WebP innerhalb des Limits wird gespeichert.
- [ ] Rezept eines anderen Nutzers kann nicht geproxyt werden.

### Akzeptanzkriterien

- [ ] Kein direkter `fetch(sourceImageUrl)` verbleibt außerhalb der zentralen Policy.
- [ ] Kein externer Body wird vor Größenprüfung vollständig gepuffert.
- [ ] Redirects sind nicht automatisch aktiviert.
- [ ] Sicherheitsfälle besitzen deterministische Tests.
- [ ] Build und bestehender Share-Import bleiben erfolgreich.

### Rollback

Bei Produktionsproblemen nur den optionalen Bild-Proxy deaktivieren; niemals zur ungeprüften Fetch-Implementierung zurückkehren.

---

## AP-02 – Storage-Eigentum, Zweckbindung und Garbage Collection

**Priorität:** P0  
**Vorgänger:** AP-00; AP-01 für Remote-Importbilder  
**Ziel:** kein fremdes `storageId`, keine unbegrenzten Upload-URLs und keine dauerhaft verwaisten Dateien.

### Datenmodell

Neue Tabelle `storageAssets` in `convex/schema.ts`:

```text
storageId: Id<"_storage">
userId: Id<"users">
purpose: recipe_image | category_image | photo_scan | ai_generated | imported_image
state: pending | claimed | released
recipeId?: Id<"recipes">
categoryId?: Id<"categories">
contentType: string
sizeBytes: number
sha256?: string
createdAt: number
expiresAt?: number
claimedAt?: number
```

Erforderliche Indizes:

- `by_storageId`
- `by_user_state`
- `by_state_expiresAt`
- optional `by_recipe`

### Betroffene Stellen

- `convex/schema.ts`
- `convex/recipes.ts`: Upload-URL, Create/Update, AI-Bild, Delete/Get URL
- `convex/categories.ts`
- `convex/photoScan.ts`
- `components/AddRecipeModal.tsx`
- `components/addRecipeModal/recipeImage.ts`
- neu: `convex/storageAssets.ts`
- neu: `convex/crons.ts` oder bestehende Crons erweitern

### Umsetzung

1. `generateImageUploadUrl` erhält `purpose` und verbraucht ein technisches Upload-Rate-Limit.
2. Nach dem Upload muss der Client `registerUploadedAsset(storageId, purpose)` aufrufen.
3. Diese Mutation liest Metadaten über `ctx.db.system.get('_storage', storageId)`, prüft Existenz, erlaubten MIME-Type und Maximalgröße und legt erst danach `storageAssets` an. Ungültige Dateien sofort löschen.
4. Doppelte Registrierung derselben Storage-ID muss idempotent sein; ein anderer Nutzer erhält `STORAGE_NOT_OWNED`.
5. `scanRecipePhoto` lädt nur Assets des angemeldeten Nutzers mit Zweck `photo_scan` und Zustand `pending`.
6. `recipes.create/update` und Kategorienmutationen akzeptieren nur eigene, passende Assets. Claim und Rezept-/Kategorieänderung müssen in derselben Mutation erfolgen.
7. Ersetzte Rezeptbilder freigeben und nach erfolgreichem Wechsel löschen. Fehler dürfen nicht dazu führen, dass altes und neues Bild beide unreferenziert bleiben.
8. Erfolgreich gescannte `photo_scan`-Assets freigeben; bei retrybaren Fehlern kurze TTL behalten, sonst löschen.
9. `generateAndStoreAiImage` registriert das Ergebnis serverseitig als `ai_generated/pending`. Modal-Abbruch ruft `releaseAsset` auf; fehlender Client-Aufruf wird durch TTL-GC abgefangen.
10. Cron löscht nur `released` oder abgelaufene `pending`-Assets in begrenzten Batches. Legacy-Dateien ohne `storageAssets` niemals automatisch löschen.
11. Backfill für bereits referenzierte Rezept- und Kategoriebilder erstellen. Backfill ist idempotent und markiert diese Assets als `claimed`.
12. Kontolöschung später über `by_user_state` um alle registrierten Assets erweitern.

### Empfohlene Grenzwerte

- Rezept-/Kategorie-/KI-Bild: 10 MiB nach Upload, clientseitig weiterhin komprimieren.
- Scanbild: 15 MiB, sofern Gemini-Modellgrenze dies zulässt.
- Pending-TTL: 60 Minuten; AI-Entwurf optional 24 Stunden.
- GC: stündlich, maximal 100 Dokumente pro Lauf.

Grenzwerte zentral definieren; keine Magic Numbers in Actions oder Komponenten.

### Tests

- [ ] Nutzer A kann Storage-ID von Nutzer B weder scannen, anzeigen, löschen noch claimen.
- [ ] falscher Zweck wird abgelehnt.
- [ ] übergroße und Nicht-Bild-Dateien werden gelöscht und nicht registriert.
- [ ] Registrierung und Claim sind idempotent.
- [ ] Modal-Abbruch gibt ein AI-Bild frei.
- [ ] GC löscht nur abgelaufene neue Assets, nie Legacy-Dateien.
- [ ] Account- und Rezeptlöschung entfernen zugehörige Dateien.

### Akzeptanzkriterien

- [ ] Jeder neue Upload besitzt vor Nutzung einen `storageAssets`-Eintrag.
- [ ] Alle Mutationen mit `storageId` prüfen Eigentum und Zweck serverseitig.
- [ ] Direkte Storage-IDs sind niemals selbst der Berechtigungsnachweis.
- [ ] Backfill und GC können mehrfach sicher ausgeführt werden.

---

## AP-03 – Idempotente Importoperationen, Quota-Reservierung und Kostenlimits

**Priorität:** P0  
**Vorgänger:** AP-00; AP-02 für Foto-Assets  
**Ziel:** parallele oder abgebrochene Aufrufe dürfen Produktlimits und Providerbudgets nicht umgehen.

### Datenmodell

Neue Tabelle `importOperations`:

```text
userId
operationId (UUID vom Client, pro Nutzer eindeutig)
provider: instagram | facebook | website | photo_scan
feature: link_imports | photo_scans
canonicalUrlHash?: string
sourceAssetId?: Id<"_storage">
status: reserved | running | succeeded | failed | released
resultRecipeId?: Id<"recipes">
resultDraft?: RecipeDraft
errorCode?: string
createdAt, updatedAt, expiresAt, committedAt?
```

Indizes:

- `by_user_operation`
- `by_user_feature_status`
- `by_status_expiresAt`
- `by_user_canonicalUrlHash`

Zusätzlich eigene Tabelle `apiRateLimits` statt Wiederverwendung von `authRateLimits`:

```text
userId, bucket, windowStart, count, updatedAt
```

Index: `by_user_bucket`.

### Betroffene Stellen

- `convex/schema.ts`
- `convex/users.ts`: Usage-Helfer
- `convex/rateLimiter.ts`
- `convex/instagram.ts`, `convex/facebook.ts`, `convex/website.ts`, `convex/photoScan.ts`
- `convex/recipes.ts`, `create`
- `pages/ShareTargetPage.tsx`
- `components/AddRecipeModal.tsx`
- neu: `convex/importOperations.ts`

### Zustandsautomat

```text
reserved → running → succeeded
    │          └────→ failed/released
    └───────────────→ released (TTL/Abbruch)
```

`succeeded` bedeutet: eine verwertbare Extraktion oder ein automatisch gespeichertes Rezept liegt vor; das Produktkontingent ist committed. Social-/Website-Importe können direkt `resultRecipeId` liefern. Ein Fotoscan legt den kurzlebigen, nutzereigenen `resultDraft` ab, bis der Nutzer ihn speichert oder verwirft. Wiederholung mit derselben `operationId` gibt dasselbe Resultat zurück und ruft keinen Provider erneut auf.

### Umsetzung

1. Client erzeugt pro Nutzeraktion genau eine UUID. Retries verwenden dieselbe UUID.
2. Öffentliche Startmutation `startImport` authentifiziert, normalisiert den Provider/URL-Typ, prüft vorhandene Operation und reserviert atomar einen Slot.
3. Bei Free-Nutzern berechnet die Reservierung `committed usage + aktive Reservierungen`. Ist das Limit erreicht, wird kein Job und kein externer Aufruf gestartet.
4. Bei Pro-Nutzern entfällt das Produktlimit, nicht jedoch Rate-Limit und globaler Kosten-Notaus.
5. Die Startmutation plant die interne Action mit `ctx.scheduler.runAfter(0, ...)`. Der Client ruft Provider-Actions nicht mehr direkt auf.
6. Action setzt `running`, ruft genau einen Provider auf und schließt über eine interne Mutation mit `succeeded` oder `failed/released` ab. Fotoscan-Ergebnisse werden als validierter `resultDraft` gespeichert und nur dem Eigentümer der Operation ausgegeben.
7. Commit erhöht den vorhandenen `usageStats`-Zähler in derselben Mutation, die `succeeded` setzt. Ein zweiter Commit ist wirkungslos.
8. `recipes.create` erhält optional `importOperationId`. Bei Link-/Fotoimport validiert sie eine eigene erfolgreiche Operation und zählt nicht erneut. Manuelle Rezepte bleiben atomar in `create` begrenzt.
9. ShareTarget abonniert den Operationsstatus und kann nach App-Resume denselben Job fortsetzen. Doppelte Android-Intents dürfen keine zweite Operation starten.
10. Fehlgeschlagene Provideraufrufe geben die Produktreservierung frei. Das technische Rate-Limit wird nicht zurückerstattet.
11. Abgelaufene Reservierungen werden per Cron freigegeben. Eine noch laufende Action darf nicht durch einen zu kurzen TTL-Lauf überschrieben werden; Heartbeat/`updatedAt` beachten.
12. Für `generateAndStoreAiImage` und Upload-URL-Ausgabe separate technische Buckets ergänzen. Diese Funktionen benötigen keine Produktentscheidung, aber Missbrauchsschutz.
13. Globalen Provider-Notaus vorsehen: konfigurierbarer Tageszähler je `apify`, `jina`, `gemini`, `pollinations`. Bei Überschreitung Fehlercode `PROVIDER_BUDGET_EXHAUSTED`; keine Secrets oder Kostenwerte an den Client.
14. `resultDraft` nach Claim/Speichern löschen; verworfene oder abgelaufene Drafts per Cron entfernen. Kontolöschung entfernt alle verbliebenen Drafts.

### Semantik der Zähler

- Linkimport: Commit nach erfolgreicher strukturierter Extraktion bzw. automatischer Speicherung.
- Fotoscan: Commit nach gültiger Gemini-Antwort.
- Manueller Eintrag: Commit zusammen mit Recipe-Insert.
- Providerfehler/ungültiger Inhalt: kein Produktcommit.
- Nutzer bricht nach erfolgreicher Extraktion ab: Produktcommit bleibt bestehen, da Kosten entstanden sind.

### Tests

- [ ] Zwei parallele letzte Free-Slots ergeben genau einen Providerstart.
- [ ] Zehn Retries derselben UUID ergeben genau einen Providerstart und ein Resultat.
- [ ] Fehler gibt Reservierung frei, Commit erhöht genau einmal.
- [ ] Pro-Nutzer umgeht Produktlimit, aber nicht Rate-Limit.
- [ ] Manipulierte/fremde Operation kann nicht in `recipes.create` verwendet werden.
- [ ] Abgelaufene Reservierung wird freigegeben; laufender, aktueller Job nicht.
- [ ] App-Neustart/Resume kann Status und Resultat wieder aufnehmen.
- [ ] AI-Bild- und Upload-URL-Spam wird begrenzt.

### Akzeptanzkriterien

- [ ] Kein Apify-, Jina-, Gemini- oder Pollinations-Aufruf erfolgt ohne vorherigen Kosten-/Rate-Limit-Entscheid.
- [ ] Client ruft Import-Actions nicht direkt auf.
- [ ] Produktverbrauch ist idempotent und transaktional.
- [ ] Providerkosten und Produktkontingente sind getrennte Konzepte.

---

## AP-04 – Sichere, billingfähige Kontolöschung

**Priorität:** P0  
**Vorgänger:** AP-02 und AP-03  
**Ziel:** keine fortgesetzte Stripe-Abrechnung, keine verwaisten Assets/Limits und kein partiell gelöschtes Konto.

### Betroffene Stellen

- `pages/ProfilePage.tsx`, `handleDeleteAccount`
- `convex/users.ts`, bestehendes `deleteCurrentUser`
- `convex/stripe.ts`, `convex/stripeInternal.ts`, `convex/http.ts`
- `convex/schema.ts`
- `convex/storageAssets.ts`, `convex/importOperations.ts`, `convex/rateLimiter.ts`
- neu: `convex/accountDeletion.ts` als orchestrierende Action plus interne Mutationen

### Datenmodell

Neue Tabelle `accountDeletionRequests`:

```text
userId
requestId
status: requested | billing_cleanup | local_cleanup | completed | failed
stripeCustomerId?
lastErrorCode?
createdAt, updatedAt, completedAt?
```

Keine Captions, E-Mails oder Secrets in dieser Tabelle. Nach erfolgreichem Abschluss nur minimal notwendige, zeitlich begrenzte Tombstone-Daten behalten.

### Umsetzung

1. UI zeigt konkret, dass Rezepte und Konto gelöscht werden und ein Stripe-Abo sofort endet. Bei Play/App Store wird auf getrennte Store-Verwaltung hingewiesen.
2. Nutzer bestätigt explizit; Button ist während des Vorgangs gesperrt. Doppeltap erzeugt dieselbe `requestId`.
3. Öffentliche Action authentifiziert und erzeugt/liest idempotenten Löschauftrag.
4. Falls `stripeCustomerId` vorhanden: `stripe.customers.del(customerId)` aufrufen. Dies löscht Zahlungsdaten und beendet aktive Stripe-Abos sofort.
5. Erst nach erfolgreicher oder nachweislich bereits erfolgter Stripe-Löschung lokale Daten löschen. Bei Stripe-Timeout Status auf `failed`/retrybar lassen; Benutzerbezug nicht vorher entfernen.
6. Lokalen Cleanup in eine interne Mutation/Helfer aufteilen, die mehrfach sicher ausgeführt werden kann.
7. Zusätzlich löschen: `storageAssets` plus Dateien, `importOperations`, `apiRateLimits`, Kategorien/Stats, Wochenplan, Einkaufsliste, Rezepte und Auth-Zustand.
8. `authRateLimits` nach exakt bekannten E-Mail-/Auth-Identifiern entfernen. API-Limits werden künftig über `apiRateLimits.userId` gefunden.
9. Webhook-Verarbeitung muss Events eines bereits gelöschten Stripe-Kunden idempotent ignorieren, nicht wieder einen Nutzer anlegen.
10. Erst nach `completed` im Client `signOut()` ausführen und lokalen Cache/Logs löschen.
11. Fehlerdialog bietet Retry mit derselben `requestId`; keine pauschale Erfolgsmeldung bei Teilfehlern.

### Tests

- [ ] Aktiver Stripe-Kunde wird vor lokaler Löschung entfernt.
- [ ] Stripe-Fehler lässt Nutzerbezug bestehen und ist retrybar.
- [ ] Zweiter Löschaufruf ist idempotent.
- [ ] Alle nutzerbezogenen Tabellen und Storage-Assets sind danach leer.
- [ ] Spätes Stripe-Webhook führt nicht zur Wiederanlage.
- [ ] Store-Abo-Hinweis blockiert Kontolöschung nicht.
- [ ] UI loggt den Vorgang nicht mit E-Mail/Customer-ID.

### Akzeptanzkriterien

- [ ] Kein lokaler „Erfolg“, solange Billing-Cleanup ungeklärt ist.
- [ ] Vollständiger Cleanup ist automatisiert testbar.
- [ ] Accountlöschung ist wiederholbar und crash-resistent.

---

## AP-05 – Dependency-Sicherheitsupdate

**Priorität:** P0  
**Vorgänger:** AP-00  
**Ziel:** 0 hohe/kritische Produktionsbefunde ohne unkontrollierte Major-Upgrades.

### Aktuelle Befunde

| Kette | Befund | erste Maßnahme |
|---|---|---|
| `react-router-dom` → `react-router` | mehrere hohe/moderate Advisories | innerhalb Major auf mindestens 7.18.x aktualisieren |
| `@google/genai` → `protobufjs`, `ws` | DoS/Memory-Befunde | zunächst innerhalb `@google/genai` Major 1 auf aktuelle 1.x-Version aktualisieren |
| `stripe` → `qs` | moderater DoS-Befund | Stripe innerhalb Major 20 aktualisieren |
| `@capacitor/cli` → `tar`, `brace-expansion` | moderate Befunde | Capacitor-8-Pakete koordiniert aktualisieren; CLI in `devDependencies` verschieben |

### Umsetzung

1. Vorher Lockfile sichern und `npm audit --omit=dev --json` ablegen.
2. Nur Patch/Minor innerhalb bestehender Majors aktualisieren. Kein `npm audit fix --force`.
3. `react-router-dom` zuerst separat aktualisieren; Routing, Deep Links und ShareTarget smoke-testen.
4. `@google/genai` 1.x separat aktualisieren; JSON-Schema-Antworten für Instagram, Facebook, Website und Foto testen.
5. `stripe` 20.x separat aktualisieren; Checkout-/Portal-Erstellung im Testmodus und Webhook-Signaturtests ausführen.
6. Alle Capacitor-Core-Pakete auf kompatible 8.x-Versionen angleichen; danach `npx cap sync android` und Gradle-Tests.
7. Falls ein transitive Befund verbleibt, zuerst Upstream-Version prüfen. `overrides` nur gezielt, mit Kompatibilitätstest und Kommentar; keine pauschalen Overrides.
8. Major-Upgrades (`@google/genai` 2, Stripe 22, Vite 8, Tailwind 4 usw.) in separate spätere Pakete verschieben.

### Tests und Akzeptanz

- [ ] `npm audit --omit=dev --audit-level=high` Exit 0.
- [ ] `npm test` und `npm run build:check` erfolgreich.
- [ ] Login, Routing, drei Importprovider, Foto-Scan, Stripe-Testcheckout smoke-getestet.
- [ ] `npx cap sync android` und Gradle-Lint/Tests erfolgreich.
- [ ] Lockfile enthält keine unerklärten großflächigen Änderungen.

---

## AP-06 – Einheitliche Berechtigungen und Google Play Billing

**Priorität:** P0 vor öffentlicher Monetarisierung; aktueller Native-Checkout bleibt bis dahin deaktiviert  
**Vorgänger:** AP-04 und AP-05  
**Ziel:** Web, Android und später iOS liefern dieselbe Pro-Berechtigung über unterschiedliche zulässige Zahlungswege.

### Zielarchitektur

Neue Tabelle `billingEntitlements` statt nur einzelner Stripe-Felder am Nutzer:

```text
userId
provider: stripe | google_play | app_store | promotional
externalCustomerId?
externalSubscriptionId?
productId
plan: pro_monthly | pro_yearly
status: active | grace_period | past_due | canceled | expired
periodEnd?
willRenew?
environment: sandbox | production
updatedAt
```

Indizes: `by_user_provider`, `by_externalSubscription`, `by_user_status`.

`users.subscription` darf vorübergehend als abgeleitetes Kompatibilitätsfeld bleiben. Autoritativ ist: mindestens ein gültiges `billingEntitlements`-Dokument.

### Umsetzung

1. Für jeden Nutzer stabile UUID `billingUserId` erzeugen und backfillen; keine E-Mail als Store-Identität verwenden.
2. RevenueCat-Projekt, Android-App, Produkte/Base-Plans und Entitlement `pro` konfigurieren. Produkt-IDs zwischen Code, Play Console und RevenueCat dokumentieren.
3. `@revenuecat/purchases-capacitor` installieren und `npx cap sync android` ausführen.
4. Android-`launchMode` von `singleTask` auf `singleTop` ändern, weil RevenueCat bei anderen Modi abgebrochene Zahlungsflüsse dokumentiert. Danach Share Intent und OAuth-Deep-Link ausdrücklich neu testen.
5. Kleine Plattformabstraktion erstellen, z. B. `services/billing/`:
   - Web: Stripe Checkout/Portal.
   - Android: RevenueCat Offerings/Purchase/Restore/CustomerInfo.
   - iOS später: derselbe RevenueCat-Adapter.
6. `SubscribePage` darf nicht direkt zwischen Stripe- und Native-APIs verzweigen; sie konsumiert die Abstraktion und rendert providerabhängige Aktionen.
7. RevenueCat-Webhook in `convex/http.ts` mit eigenem Auth-Secret, Idempotenz-Tabelle und stabiler Event-Zuordnung implementieren.
8. Webhook schreibt/aktualisiert `billingEntitlements`; Client-`CustomerInfo` kann optimistisch anzeigen, Convex entscheidet jedoch über serverseitige Limits.
9. Stripe-Webhook ebenfalls in `billingEntitlements` spiegeln. Aktive Berechtigung ist die Vereinigung aktiver Provider, nicht „letztes Event gewinnt“.
10. Restore-Purchases-Aktion und „Abo verwalten“ für Google Play bereitstellen.
11. Native Fehlermeldung „Web-Version verwenden“ erst entfernen, wenn Sandboxkauf, Restore und Webhook Ende-zu-Ende funktionieren.
12. Accountlöschung providerabhängig behandeln: Stripe sofort löschen; Store-Verwaltungslink/Hinweis, dann lokale Löschung zulassen.

### Tests

- [ ] Google-Lizenztester: monatlicher und jährlicher Kauf.
- [ ] Kauf wird nach Neustart und Neuinstallation wiederhergestellt.
- [ ] Webhook aktiviert und beendet Convex-Entitlement korrekt.
- [ ] Storno, Ablauf, Grace Period, Billing Issue und Refund werden korrekt abgebildet.
- [ ] Aktives Stripe-Abo bleibt auf Android als Berechtigung sichtbar, ohne externen Kauflink.
- [ ] Gleichzeitiges Stripe- und Play-Abo führt nicht zu versehentlicher Entziehung.
- [ ] `singleTop` bricht Share Intent, OAuth-Rückkehr und Warm-Start nicht.

### Akzeptanzkriterien

- [ ] Kein externer Stripe-Kauflink in der Android-App.
- [ ] Native Berechtigungen werden serverseitig verifiziert/synchronisiert.
- [ ] Restore und Store-Verwaltung sind erreichbar.
- [ ] Sandbox-/Produktionsschlüssel und -events sind strikt getrennt.

---

## AP-07 – Belastbares Quality-Gate

**Priorität:** P1  
**Vorgänger:** AP-05  
**Ziel:** Tooling prüft ausschließlich gepflegten Quellcode und liefert reproduzierbare Ergebnisse.

### Umsetzung

1. ESLint global um `android/app/build/**`, `android/app/src/main/assets/public/**`, `convex/_generated/**`, `reports/**`, `graphify-out/**` und `dist/**` bereinigen.
2. Lint-Befunde in getrennten Commits lösen:
   - ungenutzte Variablen, `prefer-const`, `no-var`;
   - `any`-Typen;
   - React-Hook-/Ref-Regeln mit gezielten Regressionstests.
3. Knip-Ausgabe einzeln klassifizieren: echt ungenutzt, dynamisch genutzt, natives Plugin oder Fehlkonfiguration. Nichts blind löschen.
4. Nicht verwendete `@capacitor/camera`- und `@capacitor/filesystem`-Pakete nach AP-09 entfernen, sofern weiterhin keine Imports existieren.
5. JSCPD-Skript mit expliziten Quellpfaden ausführen (`components`, `convex`, `pages`, `utils`, `hooks`, `services`). Report muss eine positive Anzahl geprüfter Dateien enthalten.
6. Ast-Grep-Regeln für TypeScript und TSX getrennt oder nachweislich gemeinsam konfigurieren. Testfixture mit absichtlichem `console.log` muss das Gate scheitern lassen.
7. `lint:all` so gestalten, dass alle Teilberichte laufen und der Gesamtstatus korrekt fehlschlägt; keine stillen Nullscans.

### Akzeptanzkriterien

- [ ] ESLint: 0 Fehler, 0 ungeklärte Warnungen im gepflegten Code.
- [ ] Knip: jeder verbleibende Ignore ist kommentiert/begründet.
- [ ] JSCPD und Ast-Grep weisen in einem Selbsttest nach, dass sie tatsächlich Dateien/Regeln prüfen.
- [ ] Keine Regel wird global deaktiviert, nur um das Gate grün zu machen.

---

## AP-08 – Backend-, Web- und CI-Tests

**Priorität:** P1  
**Vorgänger:** AP-07  
**Ziel:** Sicherheits- und Kernflows werden vor jedem Merge automatisch geprüft.

### Testpyramide

1. Pure Node-Tests: URL-/IP-Policy, Normalisierung, Logger-Redaktion, Quota-Zustandsautomat.
2. Convex-Integrationstests: Mutationstransaktionen, Eigentum, Reservierung, Kontolöschung, Entitlements. Bevorzugt `convex-test` plus Vitest nach Prüfung der aktuellen Convex-Kompatibilität.
3. Web-E2E: Login-Testmodus, manuelles Rezept, Linkimport mit gemocktem Provider, Foto-Scan-Fehlerpfad, Abo-UI.
4. Android-Smoke: Gradle-Lint/Unit-Test in CI; reale Share-/Billing-Flows auf Gerät/Testtrack.

### CI-Workflows

Neue GitHub-Actions-Workflows:

- `quality.yml`: `npm ci`, Tests, Build, Lint, Knip, JSCPD, Ast-Grep, Produktionsaudit.
- `android.yml`: JDK/Android-Setup, Web-Build, `cap sync android`, `lintDebug`, `testDebugUnitTest`, optional Debug-AAB als Artefakt.
- Release-Signing nur in gesondertem geschütztem Workflow mit Secrets und manueller Freigabe.

### Anforderungen

- npm/Node-Version festlegen; Dependency-Cache über Lockfile-Key.
- Provideraufrufe in CI vollständig mocken; keine realen Apify/Gemini/Jina/Pollinations-Kosten.
- Testdaten pro Test isolieren; keine Produktions-Convex-Deployment-URL.
- CI mit minimalen Berechtigungen und ohne Secrets bei Pull Requests aus fremden Forks.
- Abbruch bei hohem/kritischem Produktionsaudit; moderate Befunde dokumentiert bewerten.

### Akzeptanzkriterien

- [ ] Ein einziger dokumentierter PR-Gate-Workflow ist grün.
- [ ] Ein absichtlich verletztes Ownership-/Quota-/SSRF-Verhalten lässt CI rot werden.
- [ ] Keine Testausführung ruft kostenpflichtige Provider auf.
- [ ] Android-Job erzeugt reproduzierbare Lint-/Testberichte.

---

## AP-09 – Android-Härtung und Mobile-WebView

**Priorität:** P1  
**Vorgänger:** AP-05; AP-06 wegen `launchMode` koordinieren  
**Ziel:** minimale Berechtigungen, sichere lokale Daten, korrekte Tastatur-/Safe-Area- und Share-Intent-Behandlung.

### Umsetzung

1. Manifest-Rechte vor `<application>` anordnen.
2. Da keine Imports von Camera/Filesystem existieren: `CAMERA`, `READ_MEDIA_IMAGES` und Kamera-Features entfernen; entsprechende ungenutzte Capacitor-Pakete entfernen und synchronisieren.
3. `POST_NOTIFICATIONS` behalten, aber ausschließlich kontextbezogen anfordern; Ablehnung darf Importe nicht blockieren.
4. `android:allowBackup="false"` setzen. Zusätzlich Backup-/Data-Extraction-Regeln anlegen, die Auth- und WebView-Daten ausschließen; Gerätehersteller können Device-to-Device-Transfer anders behandeln.
5. `android:windowSoftInputMode="adjustResize"` ergänzen und alle Auth-/Rezeptformulare auf kleinen Geräten testen.
6. `index.html` um `viewport-fit=cover` ergänzen; vorhandene Safe-Area-CSS-Variablen auf feste/sticky Elemente anwenden.
7. `checkIntent` erhält zeitgebundene In-Memory-Deduplizierung: gleiche Signatur innerhalb eines kurzen Fensters beendet die Verarbeitung vor Navigation. Signatur/Caption/URL nicht loggen.
8. Adaptive Icons neu aus getrenntem Vordergrund/Hintergrund erzeugen. Aktuell existiert nur `assets/splash.png`; fehlende 1024×1024-Iconquellen sind ein Designartefakt und dürfen nicht aus kleinen Rastericons hochskaliert werden.
9. Monochromes Icon für Themed Icons ergänzen; runde und quadratische Varianten tatsächlich passend erzeugen.
10. Release-Lint wieder aktivieren: `checkReleaseBuilds true`, `abortOnError true`. Zuvor verbleibende relevante Warnungen beheben.
11. WebView-Debugging bleibt explizites Opt-in; Cleartext/Mixed Content bleiben deaktiviert.

### Gerätetestmatrix

- Android 8/9, 13, 14, 15/16 soweit verfügbar.
- Gesten- und Drei-Tasten-Navigation.
- kleines Display, große Schrift, Dark Mode.
- Tastatur in Login, manuellem Rezept, Einkaufsliste.
- Share aus Instagram, Facebook und Browser: Cold Start, Warm Start, Hintergrund, Doppel-Resume.
- Benachrichtigungsrecht erlaubt/abgelehnt.
- Offline während Import und Resume nach Netzrückkehr.

### Akzeptanzkriterien

- [ ] Manifest enthält nur nachweislich verwendete gefährliche Rechte.
- [ ] Kein doppelter Import durch Cold-Start/Resume-Doppelereignis.
- [ ] Tastatur überdeckt keine primären Eingaben/Aktionen.
- [ ] Android-Lint Release läuft und hat 0 Fehler.
- [ ] Signiertes AAB besteht internen Test und Play Pre-Launch Report ohne Blocker.

---

## AP-10 – Importlogik konsolidieren und härten

**Priorität:** P1  
**Vorgänger:** AP-03 und AP-08  
**Ziel:** weniger Duplikation und deterministischere Providerergebnisse, ohne Verhaltensänderung als Nebenprodukt.

### Vorbedingung

Vor dem Verschieben von Code müssen Fixture-/Charakterisierungstests für je mindestens drei Instagram-, Facebook- und Website-Payloads existieren: normal, unvollständig, falscher Kandidat.

### Backend-Struktur

Gemeinsame pure Module, zum Beispiel:

```text
convex/imports/shared/urlPolicy.ts
convex/imports/shared/captionExtraction.ts
convex/imports/shared/candidateScoring.ts
convex/imports/shared/recipeNormalization.ts
convex/imports/shared/geminiSchema.ts
convex/imports/providers/instagram.ts
convex/imports/providers/facebook.ts
convex/imports/providers/website.ts
```

Providerdateien enthalten nur providerspezifische URL-Normalisierung, Apify/Jina-Aufruf und Payload-Mapping. Rezeptnormalisierung, Icon-Ableitung, Fehlerformate und Gemini-Schema sind gemeinsam.

### Umsetzung

1. Instagram/Facebook-Funktionen mit Graph/JSCPD vergleichen und pure Duplikate zuerst extrahieren.
2. Ein gemeinsames validiertes `RecipeDraft`-Schema definieren; alle Provider liefern exakt dieses Format.
3. Website-Gemini-Aufruf erhält dasselbe `responseMimeType`/`responseJsonSchema`-Prinzip wie Social-Importe.
4. Kandidatenabgleich wird fail-closed: niedrige Übereinstimmung erzeugt `SOURCE_MISMATCH`; bloßes Logging und Fortfahren ist unzulässig.
5. URLs vor Speicherung kanonisieren. Neues Feld `sourceCanonicalUrl` plus Index `by_user_canonicalSourceUrl` einführen; Original-URL darf für Anzeige erhalten bleiben.
6. Gleiche kanonische URL desselben Nutzers liefert vorhandenes Rezept oder klaren Duplicate-Status statt zweiten Provideraufruf.
7. `AddRecipeModal.tsx` schrittweise zerlegen:
   - Bildauswahl/-editor in bestehenden Bildmodulen,
   - Foto-Scan-Orchestrierung in `usePhotoScanImport`,
   - AI-Bild-Lebenszyklus in `useRecipeImageAsset`,
   - Modal bleibt Präsentation/Zustandszusammenführung.
8. Jede Extraktion einzeln committen und Tests nach jedem Schritt ausführen; keine gleichzeitige UI-Neugestaltung.

### Qualitätsziele

- `AddRecipeModal` deutlich unter der bisherigen Größe; keine neue Datei über ca. 400 Zeilen ohne Begründung.
- Providerhandler koordinieren, pure Helfer bleiben klein und testbar.
- Instagram/Facebook-Duplikation laut funktionsfähigem JSCPD-Report wesentlich reduziert.
- Keine Providerantwort oder Caption in dauerhaften Logs.

### Akzeptanzkriterien

- [ ] Fixture-Ausgaben vor/nach Refactoring sind semantisch gleich oder bewusst versioniert.
- [ ] Website-, Instagram- und Facebook-Ausgaben durchlaufen dasselbe Draft-Schema.
- [ ] Falscher Kandidat kann kein fremdes Rezept speichern.
- [ ] Duplicate-Link startet keinen neuen kostenpflichtigen Job.

---

## AP-11 – Echte Pagination, Suche und indexierte Shopping-Mutationen

**Priorität:** P1  
**Vorgänger:** AP-08 und möglichst AP-10  
**Ziel:** kein vollständiges Laden großer Nutzersammlungen für Listen- und Suchansichten.

### Backend

1. `listPaginated` auf Convex `paginationOptsValidator` und `.paginate()` umstellen; `limit`, `slice` und exakte Gesamtsumme entfernen.
2. Suchindex `search_title` mindestens mit `filterFields: ['userId', 'category', 'isFavorite']` konfigurieren. Suche immer mit `userId` filtern.
3. Nicht-Suchpfade verwenden `by_user`, `by_category` oder `by_favorite` plus Cursor-Pagination.
4. Seitenresultat nur in Preview-DTO transformieren; Bild-URLs nur für die aktuelle Seite auflösen.
5. `listPreviews` nach Migration aller Aufrufer deprecaten und entfernen.
6. Aufrufer migrieren:
   - `CategoryRecipesPage`
   - `FavoritesPage`
   - `MealPlanModal`
   - filternde Teile von `CategoriesPage`
7. Für Zutatenfilter serverseitiges normalisiertes Suchfeld/Materialisierung entwerfen, statt dauerhaft alle vollständigen Rezepte an den Client zu senden. Dies ist ein eigenes Teilstück mit Migration und Tests.
8. `shopping.addShoppingItem` und `toggleShoppingItemByDetails` verwenden `by_user_key` direkt. Legacy-Schlüssel über wenige gezielte Indexabfragen prüfen, nicht per `collect().find()`.
9. Exakte Counts nur dort liefern, wo ein gepflegtes Aggregat existiert (`categoryStats`); keine Vollabfrage nur für `total`.

### Frontend

- `usePaginatedQuery` verwenden.
- `Load more` oder Virtuoso-End-Callback; keine automatische unbeschränkte Nachladung.
- Suchbegriff debouncen und bei Änderung Cursor zurücksetzen.
- Leere, erste Lade-, Nachlade- und Fehlerzustände getrennt behandeln.

### Tests

- [ ] Nutzerisolation auch im Search Index.
- [ ] 1.000+ Rezepte: erste Seite liest nicht alle Dokumente.
- [ ] Cursor liefert lücken-/duplikatfreie Folgeseiten bei Insert/Delete.
- [ ] Kategorie/Favorit/Suche kombinierbar.
- [ ] Shopping-Duplikat wird über Index verhindert.

### Akzeptanzkriterien

- [ ] Kein `collect()` plus `slice()` in paginierten Nutzerlisten.
- [ ] Search Index besitzt `userId` als Filterfeld.
- [ ] Alle bisherigen `listPreviews`-Aufrufer sind migriert oder begründet begrenzt.

---

## AP-12 – Datenschutzgerechtes Logging und Betriebsbeobachtung

**Priorität:** P1  
**Vorgänger:** AP-03 und AP-08  
**Ziel:** Fehler analysierbar machen, ohne Captions, URLs, Tokens oder personenbezogene Inhalte zu sammeln.

### Logging-Sicherheit

1. `serializeLogData` durch rekursiven, tiefenbegrenzten Sanitizer ersetzen.
2. Schlüssel wie `token`, `secret`, `authorization`, `cookie`, `password`, `caption`, `description`, `signature`, `url`, `email` redigieren. URLs nur als Host plus gehashter Pfad oder vollständig redigiert.
3. Fehlerstacks in Produktion normalisieren und auf eigenen Code begrenzen; Queryparameter entfernen.
4. Debug-/Info-Einträge in Produktion standardmäßig nicht in den Ringpuffer schreiben. Temporäre Diagnose nur nach expliziter Nutzeraktion, mit Ablaufzeit.
5. `App.checkIntent` und `ShareTargetPage` loggen nur `provider`, `operationId`, Phase, Dauer und Fehlercode; niemals Share-Payload.
6. `DebugSheet` zeigt vor Export eine Vorschau und verlangt aktive Zustimmung. Export löscht keine Daten automatisch, bietet aber „Logs löschen“.

### Operative Metriken

Auf Basis von `importOperations` erfassen, ohne Rohinhalte:

- Provider und stabiler Fehlercode
- Erfolg/Fehlschlag
- Phasendauern und Gesamtzeit
- Cache/Duplicate-Status
- Providerbudget-/Rate-Limit-Ereignisse
- App-Version und Plattform, keine Geräte-ID

Zielmetriken: Import-Erfolgsquote, P50/P95-Latenz, Fehlerquote je Provider, Kostenoperationen je Tag. Aufbewahrung begrenzen, z. B. 30 Tage, mit Cron-Bereinigung.

Remote-Error-Monitoring erst nach Datenschutz-/AVV-Entscheidung anbinden. Ein Sentry-Sink ist möglich, aber keine Voraussetzung für die sichere Logger-Basis.

### Tests und Akzeptanz

- [ ] Verschachtelte Secrets, URLs und Captions erscheinen weder in Ringpuffer noch Export/Sink.
- [ ] Produktions-Debug ist standardmäßig aus.
- [ ] Diagnosemodus läuft automatisch ab.
- [ ] Importmetriken enthalten keine Roh-URL/Caption/E-Mail.
- [ ] Fehler können über `operationId`/Trace-ID korreliert werden.

---

## AP-13 – Android-Release-Gate

**Priorität:** P1, Abschluss vor iOS  
**Vorgänger:** AP-01 bis AP-12  
**Ziel:** nachweisbare Freigabe der verbesserten Android-Version im internen Testtrack.

### Gate

- [ ] Alle P0-Pakete reviewt und ohne offene P0/P1-Sicherheitsbefunde.
- [ ] Produktionsaudit: 0 hohe/kritische Befunde.
- [ ] Web-/Backend-/Android-CI grün.
- [ ] Release-Lint aktiviert und grün.
- [ ] Google-Play-Sandboxkauf, Restore, Kündigung/Ablauf und Webhook getestet.
- [ ] Share-Intent-Matrix auf mindestens zwei realen Geräten bestanden.
- [ ] Kontolöschung mit aktivem Stripe-Testabo bestanden.
- [ ] Kontolöschung mit Play-Testabo und Store-Hinweis geprüft.
- [ ] Permission- und Backup-Verhalten dokumentiert.
- [ ] Play Pre-Launch Report ohne Blocker.
- [ ] Rollback-Version und Datenmodell-Rollback beschrieben.

Erst nach diesem Gate neue AAB-Version in den geschlossenen/offenen Testtrack hochladen. Produktionsrollout stufenweise, zunächst kleiner Prozentsatz mit Beobachtung der Import- und Crashmetriken.

---

## AP-14 – iOS-Befähigung nach Android-Stabilisierung

**Priorität:** nachgelagert  
**Vorgänger:** AP-13 vollständig erfüllt  
**Ziel:** bestehende React/Vite-App via Capacitor für iOS bereitstellen; keine Neuentwicklung in anderer Sprache, außer notwendiger Share Extension.

### Phase A – Projekt und Grundkonfiguration

1. Auf macOS/Xcode `@capacitor/ios` passend zur Capacitor-8-Version installieren.
2. `npx cap add ios`, `npx cap sync ios`, Signing/Bundle-ID `com.cookly.recipe` konfigurieren.
3. `viewport-fit=cover`, Safe Areas, Statusbar, Tastatur und dynamische Viewport-Höhen auf Notch/Dynamic-Island-Geräten prüfen.
4. Info.plist-Nutzungstexte nur für tatsächlich verwendete Kamera-/Fotofunktionen ergänzen.
5. `PrivacyInfo.xcprivacy` aus realen SDK-/Datenflüssen erstellen; keine generische Vorlage blind übernehmen.
6. OAuth-Custom-Scheme/Universal-Link und Login-Persistenz auf echtem Gerät testen.

### Phase B – iOS Share Extension

1. Eigenes Share-Extension-Target in Xcode erstellen.
2. App Group, z. B. `group.com.cookly.recipe`, für Host und Extension aktivieren.
3. Extension akzeptiert ausschließlich URL/Text, schreibt minimalen Payload sicher in den gemeinsamen Container und öffnet/übergibt an die Haupt-App.
4. Haupt-App erzeugt daraus dieselbe `importOperation` wie Android. Keine Providerlogik in der Extension.
5. Extension darf keine Secrets enthalten und keinen langlaufenden Import ausführen.
6. Testmatrix: Instagram Post/Reel, Facebook, Safari, Cold/Warm Start, bereits laufender Import.

### Phase C – StoreKit/RevenueCat

1. In-App-Purchase-Capability aktivieren; App-Store-Produkte mit RevenueCat verbinden.
2. Derselbe Billing-Adapter und dasselbe Convex-Entitlement wie Android.
3. Kauf, Restore, Manage Subscription, Ablauf, Refund und Family-/Ownership-Fälle in Sandbox testen.
4. Keine externen Stripe-Kauflinks im iOS-Build; Web bleibt separat.

### Phase D – TestFlight/App Review

- Privacy Labels, Datenschutzerklärung, Nutzungsbedingungen und Demo-Account.
- Accountlöschung in der App.
- Icons/Splash ohne Alpha- oder Skalierungsfehler.
- echte Geräte: mindestens aktuelles iPhone, kleineres iPhone, optional iPad nur bei Universal-Support.
- TestFlight intern, danach externe Beta und Review.

### Akzeptanzkriterien

- [ ] Kern-Webcode wird wiederverwendet; Swift/Objective-C nur für native Extension/Plattformintegration.
- [ ] Share Extension übergibt zuverlässig an `importOperations`.
- [ ] StoreKit-Berechtigung landet idempotent in Convex.
- [ ] Privacy Manifest und Store-Deklarationen entsprechen den tatsächlichen Datenflüssen.

## 6. Reviewer-Checkliste je Arbeitspaket

Der Reviewer prüft nicht nur grüne Tests:

- [ ] Diff enthält ausschließlich Paket-Scope.
- [ ] Sicherheitsinvariante ist serverseitig, nicht nur in der UI umgesetzt.
- [ ] Negativtests decken fremde Nutzer, Parallelität, Retry, Timeout und Teilfehler ab.
- [ ] Neue Tabelle besitzt notwendige Indizes und Retention/GC.
- [ ] Migration ist idempotent und für bestehende Daten sicher.
- [ ] Logs/Fehler enthalten keine Secrets oder Rohinhalte.
- [ ] Provideraufrufe sind mockbar und werden in CI nicht real ausgeführt.
- [ ] Rollback lässt Daten in gültigem Zustand.
- [ ] Öffentliche API-Änderung ist rückwärtskompatibel ausgerollt oder Client/Backend-Reihenfolge ist dokumentiert.
- [ ] Dokumentation und reale Befehlsausgaben stimmen überein.

## 7. Übergabeformat für jedes Paket

Dem Umsetzungsagenten wird folgender Auftrag vorangestellt:

```text
Setze ausschließlich Arbeitspaket AP-XX aus docs/IMPLEMENTATION_MASTERPLAN_2026-07.md um.
Halte den Arbeitsvertrag aus Abschnitt 4 ein. Lies vor Änderungen die betroffenen Symbole
mit Codebase-Memory und nenne Scope/Aufrufer. Bewahre fremde Änderungen. Implementiere
Tests zusammen mit der Änderung. Stoppe, wenn eine notwendige Produktentscheidung von
Abschnitt 3 abweicht oder ein externer Zugang/Secret fehlt. Liefere am Ende den dort
geforderten Pflichtbericht; committe oder pushe nichts ohne ausdrücklichen Auftrag.
```

Danach wird **nur** der Text des konkreten Arbeitspakets angehängt. Mehrere Pakete in einem Auftrag sind unzulässig.

## 8. Primärquellen und technische Grundlagen

- OWASP: [Server Side Request Forgery Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html)
- OWASP: [SSRF Prevention in Node.js](https://owasp.org/www-community/pages/controls/SSRF_Prevention_in_Nodejs.html)
- Convex: [Functions – Queries, Mutations und Actions](https://docs.convex.dev/functions/overview)
- Convex: [Actions und transaktionale Grenzen](https://docs.convex.dev/functions/actions)
- Convex: [Dateiupload](https://docs.convex.dev/file-storage/upload-files)
- Convex: [Dateimetadaten über `_storage`](https://docs.convex.dev/file-storage/file-metadata)
- Convex: [Dateisicherheitsmodell](https://docs.convex.dev/file-storage/overview)
- Convex: [Cursor-Pagination](https://docs.convex.dev/database/pagination)
- Convex: [Cron Jobs](https://docs.convex.dev/scheduling/cron-jobs)
- Stripe: [Customer löschen; aktive Abos werden sofort beendet](https://docs.stripe.com/api/customers/delete?lang=node)
- Google Play: [Payments Policy](https://support.google.com/googleplay/android-developer/answer/9858738?hl=de)
- RevenueCat: [Capacitor SDK und Android-`launchMode`](https://www.revenuecat.com/docs/getting-started/installation/capacitor)
- RevenueCat: [Subscription Status/Entitlements](https://www.revenuecat.com/docs/customers/customer-info)
- Android: [Selected Photos und Photo Picker](https://developer.android.com/about/versions/14/changes/partial-photo-video-access?hl=en)
- Android: [Auto Backup und Data Extraction Rules](https://developer.android.com/identity/data/autobackup?hl=en)
- Android: [Google-Play-Target-API-Anforderungen](https://developer.android.com/google/play/requirements/target-sdk)
- Apple: [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- Apple: [Privacy Manifest](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files)
- Apple: [App Groups für Host und Extension](https://developer.apple.com/documentation/xcode/configuring-app-groups/)
- Capacitor: [offizielle Dokumentation](https://capacitorjs.com/docs)
