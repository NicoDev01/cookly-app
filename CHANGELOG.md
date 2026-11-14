# Cookly Changelog


## [Unreleased]

---


## [1.5.1] - 14.11.2026 (Build 51, TestFlight)

### 🚀 Verbesserungen
- **TikTok-Import in rund 3 Sekunden** statt 25–30: Beschreibung, Untertitel und Titelbild direkt von der
  Videoseite; bei zu wenig Text wie bisher über Apify inklusive Transkription.
- **Geteilter Import-Cache:** Hat schon jemand denselben Link importiert, steht das Rezept in Sekundenbruchteilen da
  (nur öffentliche Rezeptdaten, jedes Konto bekommt sein eigenes Rezept und Bild).
- **Offline abhaken, entfernen und favorisieren:** wirkt sofort und wird nachgereicht, sobald wieder Netz da ist;
  Hinzufügen und Bearbeiten sind offline mit Hinweis gesperrt.
- Schnelle Importe blenden das Rezept kürzer ein; **Einfügen** eines gültigen Links startet den Import sofort.

### 🐛 Fixes
- Wischgeste vom linken Rand bewegt nicht mehr das Rezept-Karussell mit und läuft ohne Ruckeln.
- Offline: zweite Kategorie und Wochenplan laden aus dem Gerätespeicher.


## [1.5.1] - 14.11.2026 (Build 50, TestFlight)

### 🚀 Verbesserungen
- **Website-Import in unter einer Sekunde** bei Seiten mit sauberem schema.org-Rezept (z. B. Chefkoch);
  Gemini nur noch bei fremder Sprache, unklarer Kategorie oder unsauberen Daten.
- **Instagram, TikTok, Facebook** starten ohne Node-Kaltstart.
- **Offline und Kaltstart:** zuletzt geladene Kategorien, Listen, Rezepte, Einkaufsliste und Wochenplan
  stehen sofort da, auch ohne Netz; der Server gewinnt, sobald er antwortet.
- **Zurück** geht echt zurück statt neue Seiten zu stapeln; **iOS-Wischgeste** vom linken Rand auf der Rezeptseite.
- Wochenplan-Sheets lassen sich nach unten wegwischen; Splash verschwindet nach dem ersten Bild statt nach 300 ms.

---


## [1.5.1] - 13.11.2026 (Build 49)

### ✨ Neue Features
- **Neues Plus-Menü** zum Hinzufügen: App teilen, Link einfügen, Foto scannen oder selbst schreiben,
  mit kurzer Anleitung zum Teilen aus Instagram, TikTok und Co.
- **Foto-Scan über mehrere Seiten** (bis zu 3 Fotos ergeben ein Rezept), optional mit Foto vom fertigen
  Gericht als Rezeptbild; **mehrere Rezepte auf einmal** (jedes Foto ein Rezept).
- Foto-Scans laufen **im Hintergrund** mit Fortschritt unten wie beim Link-Import; das Rezept wird auf dem
  Server gespeichert und geht auch dann nicht verloren, wenn die App währenddessen geschlossen wird.

### 🚀 Verbesserungen
- Sheets lassen sich nach unten wegwischen; Haptik beim Öffnen, Umschalten, Start und Ergebnis.
- Limit für Foto-Scans wird vor dem Hochladen geprüft.
- Einheitliche, weichere Animationen für Sheets und Dialoge; Einblendungen laufen jetzt sichtbar statt hart.
- Rezept-Formular neu gestaltet; eingefügte Listen werden in einzelne Zutaten und Schritte aufgeteilt.
- Warten auf Importe per Live-Abo statt Abfrage alle 500 ms (weniger Convex-Aufrufe, schnellere Reaktion).

---


## [1.5.0] - 09.11.2026 (Build 36)

### ✨ Neue Features
- **Kochmodus**: Schritte einzeln und groß, Timer direkt aus dem Text (mit Ton, Benachrichtigung
  und laufend über das Schließen hinaus), Bildschirm bleibt an, Hitze- und Vorheiz-Hinweise,
  Weitermachen beim zuletzt offenen Schritt.
- **Portionen umrechnen** auf der Rezeptseite; Mengen werden mitskaliert.
- **Eine Suche für Rezepte, Kategorien und Zutaten** statt Titelsuche plus Zutatenfilter.
  Mehrere Wörter grenzen ein, Tippfehler werden toleriert, bei null Treffern nennt die App das
  Wort, das nirgends vorkommt. Gesucht wird auf dem Server (`recipes.searchPreviews`).
- **Neues Onboarding** für neue Nutzer, mit Paywall und Rechtslinks.

### 🚀 Verbesserungen
- Rezeptseite: ruhigere Kopfzeile (Portionen · Quelle · Kochmodus), Bild reicht bis unter die Notch.
- Navigationsleiste sitzt tiefer (bis knapp über den Home-Indikator), die Auswahl-Pille fließt zum neuen Tab.
- Kochmodus: kleinere Schrift, Timer als umrandete Pillen; Kochmodus-Button auf der Rezeptseite umrandet.
- Bildansicht startet bildschirmfüllend und bleibt beim Zoomen scharf.
- Profil: Nutzung nennt jetzt alle Quellen (Instagram, TikTok, Facebook, Websites) und was Foto-Scans erfassen; „Jetzt upgraden“ mit animiertem Metallrand.
- Laufende Timer im Kochmodus grau hinterlegt; Navigationspille reagiert sofort beim Tippen.

### 🔧 Bugfixes
- Onboarding: „Mit Apple fortfahren“ wirkte ausgegraut (Schrift wurde dunkel überschrieben).
- Kochmodus ließ sich seitlich scrollen, lange Wörter liefen über den Rand.
- Rezeptseite ließ sich oben über das Bild hinaus herunterziehen (in Build 35 noch nicht wirksam).
- Zutaten-Hervorhebung: „Ei“ markiert nicht mehr „einer“ oder „erhitzen“, Beschreibungen wie
  „rote“ oder „gehackte“ markieren keine fremden Zutaten, Klammer-Notizen werden ignoriert.

### ⚠️ Bekannte Issues
- Android 14+: Timer-Benachrichtigungen bei gesperrtem Gerät können sich verspäten, solange die
  App keine genauen Wecker stellen darf.

---


## [1.4.21] - veröffentlicht (iOS Build 33)

Erstes Update nach dem App-Store-Launch (iOS 1.4.20 Build 6, live seit 21.10.2026).
Android springt von 1.4.20 (versionCode 32, Juli) direkt hierher und bekommt damit auch
alles, was iOS schon mit 1.4.20 ausgeliefert hat. Ab hier teilen sich beide Plattformen
Versions- und Buildnummer (iOS-Build = Android-versionCode, `scripts/version-upgrade.js`).

### 🔧 Bugfixes
- Paywall in den Store-Builds: Hinweis auf automatische Verlängerung und Kündigung über den
  Store-Account ergänzt (Guideline 3.1.2), Stripe-Euro-Gesamtsummen ausgeblendet, weil
  Store-Preise je Land abweichen. Der Verweis auf die Web-Version ist entfernt.
- Gelöschte Rezepte lassen sich wieder importieren.
- Nach dem Löschen des Kontos wurde der Nutzer ungewollt neu angelegt.
### 🚀 Verbesserungen
- `npm run build:ios` bricht ab, wenn in `.env.production` der In-App-Kauf nicht scharf
  geschaltet ist (`scripts/check-ios-env.mjs`).

### ✨ Neue Features
- **TikTok-Import**: Rezepte lassen sich jetzt direkt aus der TikTok-App über „Teilen" nach Cookly
  importieren — inklusive `vm.`/`vt.`-Kurzlinks. Zusätzlich zur Beschreibung liest Cookly die
  TikTok-Untertitel (Spracherkennung) mit, weil bei Video-Rezepten die Anleitung oft nur gesprochen ist.

### 🚀 Verbesserungen
- Instagram-, Facebook- und TikTok-Import teilen sich eine Pipeline (`convex/socialImport.ts`,
  Audit-Punkt R1). `instagram.ts` 1029 → 98 Zeilen, `facebook.ts` 948 → 115 Zeilen; eine weitere
  Plattform ist jetzt ein Adapter statt einer Kopie.
- Apify-Fehler-Items (privat, gelöscht, gesperrt) ergeben jetzt die Meldung „Beitrag ist privat oder
  wurde gelöscht" statt eines generischen Importfehlers.
- Provider-Erkennung im Share-Target liegt in `utils/importTarget.ts` und ist unit-getestet.

### 🔧 Bugfixes
- Bei Punktegleichstand zwischen Erst- und Transkriptions-Versuch gewann bisher der Erstversuch —
  ausgerechnet der ohne Transkript. Die Kandidatenwahl bricht Gleichstände jetzt zugunsten von mehr Text.
- Die Scraping-Phase ist auf 85 s gedeckelt. Vorher konnten zwei Actor-Versuche plus Untertitel das
  120-s-Client-Timeout überschreiten: der Nutzer sah einen Fehler, während der Server das Rezept noch schrieb.
- Rezept-Kachel zeigte für TikTok-Quellen Globus + "Web" statt des TikTok-Icons.
- Beim ersten Öffnen nach einem Kaltstart sah die App kurz verzerrt aus: Outfit und der
  Material-Symbols-Font kamen von `fonts.googleapis.com` und fehlten bei leerem WebView-Cache
  noch. Text stand dann in der Fallback-Schrift, und Icons rendern als Ligaturen — ohne Font
  erschien statt des Icons der rohe Name ("account_balance_wallet", 256 px statt 24 px breit),
  was das Layout zerriss. Offline blieb dieser Zustand dauerhaft.
  Beide Fonts liegen jetzt im APK (`assets/fonts/`, erzeugt von `npm run fonts:sync`); der
  Icon-Font ist dabei auf die 101 tatsächlich benutzten Glyphen subsettet (3,8 MB → 124 KB,
  Variable-Achsen FILL/wght/GRAD/opsz bleiben erhalten). Zusätzlich wartet der Splashscreen
  auf `document.fonts.ready`, sodass der erste sichtbare Frame garantiert fertig gesetzt ist.
  `npm run fonts:check` läuft im Build und bricht ab, wenn ein Icon benutzt wird, das nicht
  im Subset liegt; `utils/iconScanner.test.mjs` sichert zusätzlich ab, dass der Scanner beide
  Icon-Allowlists (Frontend `utils/iconUtils.ts`, Backend `convex/socialImportShared.ts`)
  vollständig sieht.

### ⚠️ Bekannte Issues
- Ein TikTok-Import dauert 12–25 s; dominiert vom Actor-Boot bei Apify (gemessen 24.08.2026).
  Der Actor bietet keinen Standby-Modus, die Zeit lässt sich von uns aus nicht verkürzen.

---


## [1.4.20] - 21.07.2026

### 🔧 Bugfixes
- TODO: Beschreibe die Bugfixes

### ✨ Neue Features
- TODO: Beschreibe die neuen Features

### 🚀 Verbesserungen
- TODO: Beschreibe die Verbesserungen

### ⚠️ Bekannte Issues
- TODO: Liste bekannte Probleme

---


## [1.4.19] - 20.07.2026

### 🔧 Bugfixes
- TODO: Beschreibe die Bugfixes

### ✨ Neue Features
- TODO: Beschreibe die neuen Features

### 🚀 Verbesserungen
- TODO: Beschreibe die Verbesserungen

### ⚠️ Bekannte Issues
- TODO: Liste bekannte Probleme

---


## [1.4.18] - 18.07.2026

### 🔧 Bugfixes
- Behebt Abstürze auf Android-Geräten ohne `crypto.randomUUID`.
- Behebt fehlende Bilder nach Instagram-, Facebook- und Website-Importen.
- Entfernt den fehlerhaften doppelten Bildabruf im Wochenplan.

### ✨ Neue Features
- Keine.

### 🚀 Verbesserungen
- Importbilder werden zuverlässig serverseitig gespeichert, auch wenn die App geschlossen wird.
- Externe Bilder werden weiterhin größen-, typ- und netzwerkseitig validiert.

### ⚠️ Bekannte Issues
- Keine release-blockierenden Probleme bekannt.

---


## [1.4.17] - 18.07.2026

### 🔧 Bugfixes
- TODO: Beschreibe die Bugfixes

### ✨ Neue Features
- TODO: Beschreibe die neuen Features

### 🚀 Verbesserungen
- TODO: Beschreibe die Verbesserungen

### ⚠️ Bekannte Issues
- TODO: Liste bekannte Probleme

---


## [1.4.16] - 18.07.2026

### 🔧 Bugfixes
- TODO: Beschreibe die Bugfixes

### ✨ Neue Features
- TODO: Beschreibe die neuen Features

### 🚀 Verbesserungen
- TODO: Beschreibe die Verbesserungen

### ⚠️ Bekannte Issues
- TODO: Liste bekannte Probleme

---


## [1.4.15] - 18.07.2026

### 🔧 Bugfixes
- Rezeptimporte und Account-Löschung durch Beseitigung konkurrierender Analytics-Schreibvorgänge stabilisiert
- Google-OAuth-Callback und Session-Austausch für Android abgesichert

### 🚀 Verbesserungen
- Backendfehler inklusive Convex Request-ID in Sentry sichtbar gemacht
- Analytics-Attribution idempotent und ressourcenschonend ausgeführt

---


## [1.4.14] - 18.07.2026

### 🔧 Bugfixes
- TODO: Beschreibe die Bugfixes

### ✨ Neue Features
- TODO: Beschreibe die neuen Features

### 🚀 Verbesserungen
- TODO: Beschreibe die Verbesserungen

### ⚠️ Bekannte Issues
- TODO: Liste bekannte Probleme

---


## [1.4.13] - 18.07.2026

### 🔧 Bugfixes
- Google-Anmeldung auf Android wiederhergestellt: OAuth wird im sicheren Systembrowser statt in der WebView geöffnet.
- Convex-PKCE-Verifier und App-Deep-Link werden korrekt durch den vollständigen Login-Ablauf übertragen.

### ✨ Neue Features
- Keine.

### 🚀 Verbesserungen
- Produktions-OAuth-Flow gegen Convex und Google validiert.

### ⚠️ Bekannte Issues
- Keine bekannten OAuth-Probleme.

---


## [1.4.12] - 18.07.2026

### 🔧 Bugfixes
- TODO: Beschreibe die Bugfixes

### ✨ Neue Features
- TODO: Beschreibe die neuen Features

### 🚀 Verbesserungen
- TODO: Beschreibe die Verbesserungen

### ⚠️ Bekannte Issues
- TODO: Liste bekannte Probleme

---


## [1.4.11] - 17.07.2026

### 🔧 Bugfixes
- TODO: Beschreibe die Bugfixes

### ✨ Neue Features
- TODO: Beschreibe die neuen Features

### 🚀 Verbesserungen
- TODO: Beschreibe die Verbesserungen

### ⚠️ Bekannte Issues
- TODO: Liste bekannte Probleme

---


## [1.4.10] - 17.07.2026

### 🔧 Bugfixes
- TODO: Beschreibe die Bugfixes

### ✨ Neue Features
- TODO: Beschreibe die neuen Features

### 🚀 Verbesserungen
- TODO: Beschreibe die Verbesserungen

### ⚠️ Bekannte Issues
- TODO: Liste bekannte Probleme

---


## [1.4.9] - 17.07.2026

### 🔧 Bugfixes
- TODO: Beschreibe die Bugfixes

### ✨ Neue Features
- TODO: Beschreibe die neuen Features

### 🚀 Verbesserungen
- TODO: Beschreibe die Verbesserungen

### ⚠️ Bekannte Issues
- TODO: Liste bekannte Probleme

---


## [1.4.8] - 03.04.2026

### 🔧 Bugfixes
- TODO: Beschreibe die Bugfixes

### ✨ Neue Features
- TODO: Beschreibe die neuen Features

### 🚀 Verbesserungen
- TODO: Beschreibe die Verbesserungen

### ⚠️ Bekannte Issues
- TODO: Liste bekannte Probleme

---


## [1.4.7] - 31.03.2026

### 🔧 Bugfixes
- TODO: Beschreibe die Bugfixes

### ✨ Neue Features
- TODO: Beschreibe die neuen Features

### 🚀 Verbesserungen
- TODO: Beschreibe die Verbesserungen

### ⚠️ Bekannte Issues
- TODO: Liste bekannte Probleme

---


## [1.4.6] - 31.03.2026

### 🔧 Bugfixes
- TODO: Beschreibe die Bugfixes

### ✨ Neue Features
- TODO: Beschreibe die neuen Features

### 🚀 Verbesserungen
- TODO: Beschreibe die Verbesserungen

### ⚠️ Bekannte Issues
- TODO: Liste bekannte Probleme

---


## [1.4.5] - 22.03.2026

### 🔧 Bugfixes
- TODO: Beschreibe die Bugfixes

### ✨ Neue Features
- TODO: Beschreibe die neuen Features

### 🚀 Verbesserungen
- TODO: Beschreibe die Verbesserungen

### ⚠️ Bekannte Issues
- TODO: Liste bekannte Probleme

---


## [1.4.4] - 22.03.2026

### 🔧 Bugfixes
- TODO: Beschreibe die Bugfixes

### ✨ Neue Features
- TODO: Beschreibe die neuen Features

### 🚀 Verbesserungen
- TODO: Beschreibe die Verbesserungen

### ⚠️ Bekannte Issues
- TODO: Liste bekannte Probleme

---


## [1.4.3] - 22.03.2026

### 🔧 Bugfixes
- TODO: Beschreibe die Bugfixes

### ✨ Neue Features
- TODO: Beschreibe die neuen Features

### 🚀 Verbesserungen
- TODO: Beschreibe die Verbesserungen

### ⚠️ Bekannte Issues
- TODO: Liste bekannte Probleme

---


## [1.4.2] - 22.03.2026

### 🔧 Bugfixes
- TODO: Beschreibe die Bugfixes

### ✨ Neue Features
- TODO: Beschreibe die neuen Features

### 🚀 Verbesserungen
- TODO: Beschreibe die Verbesserungen

### ⚠️ Bekannte Issues
- TODO: Liste bekannte Probleme

---


## [1.4.1] - 25.02.2026

### 🔧 Bugfixes
- TODO: Beschreibe die Bugfixes

### ✨ Neue Features
- TODO: Beschreibe die neuen Features

### 🚀 Verbesserungen
- TODO: Beschreibe die Verbesserungen

### ⚠️ Bekannte Issues
- TODO: Liste bekannte Probleme

---
