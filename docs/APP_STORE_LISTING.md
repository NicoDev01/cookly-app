# App-Store-Eintrag Cookly (iOS) – Überarbeitung 21.10.2026

Grundlage: die live geschaltete Seite https://apps.apple.com/de/app/id6809963985 (1.4.20, Build 6).
Felder mit ✱ ändern sich nur mit einer neuen Version (1.4.21). Werbetext geht jederzeit.

## 1. Befunde

| # | Befund | Wirkung | Fix |
|---|---|---|---|
| 1 | **Screenshots**: Bild 1 ist die Paywall mit „In-App-Kauf … nicht aktiviert, bitte Web-Version“, Bild 2–4 sind leere Zustände (0 Rezepte, leerer Wochenplan, Lade-Spinner). Keine Überschriften. | Größter Hebel: Screenshots entscheiden über den Download. Der Paywall-Text widerspricht der laufenden App. | Neu aufnehmen, Abschnitt 4 |
| 2 | **Sprache „EN Englisch“**: Das Xcode-Projekt hatte `en` als Entwicklungssprache. | Deutsche Nutzer sehen „Englisch“ und laden seltener. | Im Code auf `de` umgestellt, wirkt ab Build 1.4.21 |
| 3 | **Beschreibung** verspricht „Auch offline verfügbar“. Cookly lädt Rezepte live aus Convex, ohne lokalen Speicher; nach einem Neustart ohne Netz ist nichts da. | Falsches Versprechen (Guideline 2.3, genaue Metadaten) und schlechte Bewertungen. | Gestrichen |
| 4 | Beschreibung nennt „priorisierten Support“ für Pro. Die Paywall nennt das nur beim Jahresabo. | Widerspruch | Gestrichen |
| 5 | Werbetext und Beschreibungsanfang sagen zweimal dasselbe; „Socialmedia“. | Die ersten Zeilen sind die einzigen, die die meisten lesen. | Neu |
| 6 | Kein Untertitel gesetzt (unter dem Namen steht nur die Kategorie). | 30 Zeichen Suchrelevanz verschenkt. | Untertitel ✱ |
| 7 | „Nicht für macOS überprüft“: Die App wird auf Apple-Silicon-Macs angeboten, ungetestet (Share-Extension, Kamera). | Schlechte Bewertungen von Mac-Nutzern | Mac-Verfügbarkeit abschalten |
| 8 | Keine Bewertungen. | Weniger Vertrauen | Bewertungsabfrage in der App (offen) |
| 9 | iPad-Screenshots liegen im Repo, die App ist „Nur für iPhone“. | Keine | Ignorieren |
| 10 | Tippfehler „ohne unterbrechung“ auf dem Import-Bildschirm (sichtbar in Screenshot 4). | Wirkt unfertig | Im Code korrigiert |

## 2. Texte zum Einfügen

Zeichenzahlen geprüft (Limits: Name 30, Untertitel 30, Werbetext 170, Keywords 100, Beschreibung 4000).
Markennamen wie Instagram oder TikTok stehen bewusst **nicht** in Name, Untertitel und Keywords
(Guideline 2.3.7), nur beschreibend im Fließtext.

### Name ✱
```
Cookly: Rezepte speichern
```
„speichern“ ist das Wort, mit dem Nutzer suchen; „importieren“ ist Entwicklersprache.
Konservative Alternative: den heutigen Namen behalten.

### Untertitel ✱
```
Aus Videos, Links & Büchern
```

### Keywords ✱
```
kochbuch,rezept,wochenplan,einkaufsliste,kochen,essensplan,scannen,sammeln,ki,backen,mealprep
```
Keine Wörter aus Name oder Untertitel wiederholen, keine Leerzeichen.

### Werbetext (jederzeit änderbar, 167 Zeichen)
```
Speichere Rezepte aus Instagram, TikTok, Websites und Kochbüchern mit einem Tippen. Cookly erkennt Zutaten und Schritte automatisch – mit Wochenplan und Einkaufsliste.
```
Fasst das ganze Produkt zusammen. Für echte Neuigkeiten oder Aktionen später austauschen.

### Neuerungen in dieser Version (1.4.21) ✱
```
• Cookly ist jetzt auch im App Store als deutsche App eingetragen
• Übersichtlichere Abo-Informationen auf der Pro-Seite
• Zutaten in der Zubereitung werden zuverlässiger hervorgehoben
• Kleine Text- und Fehlerkorrekturen
```
TikTok-Import gehört **nicht** hierher: Er war schon in 1.4.20, der ersten iOS-Version.

### Beschreibung ✱
```
Rezepte aus Reels, TikToks und Websites mit einem Tippen speichern. Cookly macht daraus ein sauberes Rezept mit Zutaten, Mengen und Zubereitung – dein digitales Kochbuch, immer dabei.

Schluss mit Screenshots, gespeicherten Reels und Browser-Lesezeichen. Mit Cookly liegen alle deine Lieblingsrezepte an einem Ort.

SO EINFACH GEHT'S
1. Im Video oder auf der Website auf „Teilen“ tippen
2. Cookly auswählen
3. Fertig: Das Rezept liegt sortiert in deinem Kochbuch

WAS COOKLY KANN

• Import aus Instagram, TikTok, Facebook und Websites
Cookly erkennt Zutaten, Mengenangaben und Zubereitungsschritte. Bei Videos liest Cookly auch die gesprochene Anleitung mit.

• Foto-Scan für Kochbücher und Rezeptkarten
Fotografiere Omas handgeschriebenes Rezept oder eine Seite aus deinem Lieblingskochbuch. Die KI macht daraus ein Rezept, das du bearbeiten kannst.

• Wochenplan
Plane deine Gerichte für die ganze Woche.

• Einkaufsliste
Zutaten aus deinen Rezepten mit einem Tippen auf die Liste, sortiert nach Supermarkt-Kategorien.

• Eigene Rezepte
Halte Familienrezepte fest, füge eigene Fotos hinzu und passe Portionen an.

• Kategorien und Favoriten
Neue Rezepte ordnet Cookly automatisch einer Kategorie zu.

KOSTENLOS UND COOKLY PRO
Cookly ist kostenlos: eigene Rezepte, Wochenplan und Einkaufsliste ohne Limit, dazu je 60 Link-Importe und 60 Foto-Scans.
Cookly Pro hebt diese Grenzen auf. Das Abo gibt es monatlich oder jährlich. Es verlängert sich automatisch und ist jederzeit in den Abo-Einstellungen deines Apple-Accounts kündbar.

Nutzungsbedingungen (EULA): https://cookly-app.com/terms
Datenschutz: https://cookly-app.com/privacy
Support & Impressum: https://cookly-app.com
```

## 3. Einstellungen in App Store Connect

1. **App-Informationen → Primäre Sprache:** Deutsch. Falls die Texte unter „Englisch (USA)“ stehen,
   Lokalisierung „Deutsch“ anlegen, Texte dorthin, Englisch entfernen.
2. **App-Informationen → Zweite Kategorie:** „Lifestyle“ (optional, mehr Sichtbarkeit in Rankings).
3. **Preise und Verfügbarkeit → Apple Silicon Macs:** Häkchen „Diese App verfügbar machen“ entfernen,
   solange niemand Cookly auf dem Mac getestet hat.
4. **Bedienungshilfen:** nur angeben, was wirklich getestet ist; sonst leer lassen.

## 4. Screenshots neu aufnehmen

**Erledigt 22.10.2026:** 7 Folien in `app_store_screenshots/ios-2026-10/` (1206 × 2622 und 1320 × 2868).

**Pflicht laut Apple (geprüft 23.10.2026):** nur „iPhone mit Dynamic Island (mittleres Display)“,
1206 × 2622. App Store Connect skaliert für die anderen Größen. Der 1320 × 2868-Satz kann optional
über „Alle Größen in Media Manager anzeigen“ bei „großes Display“ hochgeladen werden.

**Kopfzeile und Suchergebnisse** sind optionale *Creative Assets* (ab iOS 27, Asset Library).
Ohne sie zeigt die Suche die ersten Screenshots. Später nachrüsten, wenn es einen echten Anlass gibt.

**Ursprüngliche Planung:** iPhone 6,9" (1320 × 2868) oder 6,7" (1290 × 2796).
Aufnahme im Simulator „iPhone 16 Pro Max“ oder auf dem eigenen iPhone mit einem **Demo-Account
mit echten, appetitlichen Rezepten** (mind. 15 Rezepte mit Fotos, 3 Kategorien, gefüllter Wochenplan).

Statusleiste aufräumen (Simulator, Terminal auf dem Mac):
`xcrun simctl status_bar booted override --time 9:41 --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3`

| # | Bildschirm | Überschrift |
|---|---|---|
| 1 | Fertig importiertes Rezept mit großem Foto (aus einem Reel) | **Rezepte aus Reels & TikToks speichern** |
| 2 | Teilen-Menü in Instagram/TikTok mit Cookly ausgewählt | **Teilen, Cookly wählen, fertig** |
| 3 | Rezeptdetail: Zutaten und Schritte | **Zutaten & Schritte automatisch erkannt** |
| 4 | Foto-Scan einer Kochbuchseite + Ergebnis | **Kochbuch abfotografieren – fertig** |
| 5 | Kategorien-Übersicht, gut gefüllt | **Alle Rezepte an einem Ort** |
| 6 | Wochenplan, gefüllt | **Die Woche in Minuten geplant** |
| 7 | Einkaufsliste, gefüllt | **Einkaufsliste mit einem Tipp** |

Nicht zeigen: Paywall, leere Zustände, Ladebildschirme, Debug-Texte.
Rohe Aufnahmen nach `app_store_screenshots/raw/` legen; Rahmen und Überschriften kommen
per Vorlage dazu (Cookly-Grün, Schrift Outfit).

## 5. Danach messen

- App Store Connect → Analytics: **Conversion Rate** (Seitenaufrufe → Downloads) eine Woche vor
  und nach dem Wechsel vergleichen.
- Sobald Traffic da ist: Produktseitenoptimierung mit Screenshot-Variante 1 vs. 2 als Aufmacher.
