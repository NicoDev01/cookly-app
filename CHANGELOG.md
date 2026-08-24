# Cookly Changelog


## [Unreleased]

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
