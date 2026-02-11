# Cookly Changelog


## [1.1.0] - 08.02.2026

### 🔧 Bugfixes
- TODO: Beschreibe die Bugfixes

### ✨ Neue Features
- TODO: Beschreibe die neuen Features

### 🚀 Verbesserungen
- TODO: Beschreibe die Verbesserungen

### ⚠️ Bekannte Issues
- TODO: Liste bekannte Probleme

---


## [1.0.3] - 28.01.2026

### 🔧 Bugfixes
- TODO: Beschreibe die Bugfixes

### ✨ Neue Features
- TODO: Beschreibe die neuen Features

### 🚀 Verbesserungen
- TODO: Beschreibe die Verbesserungen

### ⚠️ Bekannte Issues
- TODO: Liste bekannte Probleme

---

Alle wichtigen Änderungen an diesem Projekt werden in diesem Dokument festgehalten.

Das Format basiert auf [Keep a Changelog](https://keepachangelog.com/de-DE/1.0.0/),
und dieses Projekt hält sich an die [Semantic Versioning](https://semver.org/lang/de/) Richtlinien.

---

## [1.0.2] - 27.01.2026

### 🔧 Bugfixes
- Android Lint-Fehler behoben (Splash-Screen False Positives)
- Build-Prozess für Windows optimiert

### ✨ Neue Features
- **Automatischer Release-Workflow** mit `npm run release:patch/minor/major`
- Automatische Version-Incrementierung
- CHANGELOG.md wird automatisch mit neuen Versionen aktualisiert

### 🚀 Verbesserungen
- Release-Skript jetzt **plattformübergreifend** (Windows/macOS/Linux)
- Lint-Warnungen für Release Builds deaktiviert

---

## [1.0.1] - 27.01.2026

### 🔧 Bugfixes
- Keystore-Signatur Konfiguration korrigiert
- Paketname zu `com.cookly.recipe` geändert (Konflikt behoben)

### ✨ Neue Features
- Release-Build Signierung implementiert
- Gradle Properties für sicheres Credential Management

### 🚀 Verbesserungen
- Build-Prozess optimiert

---

## [1.0.0] - 26.01.2026

### 🎉 Erste Veröffentlichung

#### ✨ Neue Features
- Rezepte aus Fotos per AI-Scan speichern (Google Gemini OCR)
- Rezepte direkt von Websites & Instagram importieren (Jina/Apify)
- Wochenplaner für Mahlzeiten
- Automatische Einkaufslisten erstellen
- Rezepte organisieren, kategorisieren und favorisieren
- Benutzerfreundliche Suche und Filterung
- Dark Mode Support

#### 🔐 Authentifizierung & Sicherheit
- Sichere Anmeldung via Clerk (E-Mail/Password, OAuth)
- End-zu-End verschlüsselte Datenübertragung

#### 💳 Abonnement-Modell
- Free Tier: 5 Importe/Monat, 20 manuelle Rezepte
- Pro Monthly: Unbegrenzte Importe, Wochenplaner
- Pro Yearly: 33% Rabatt auf jährliches Abo
- Sichere Zahlung abwicklung via Stripe

#### 🎨 Design & UX
- Native Android Look & Feel mit Capacitor
- Responsive Design für verschiedene Bildschirmgrößen
- Intuitive Navigation mit Bottom Nav
- Smooth Animations und Transitions

#### 🔧 Technische Details
- React 19 + Vite Frontend
- Convex Backend (Serverless Database)
- Capacitor 8 für Native Features
- Tailwind CSS Styling
- TypeScript für Type Safety

---

## [Unreleased]

### Geplant
- [ ] Rezept-Export als PDF
- [ ] Rezept-Sharing mit Freunden
- [ ] Smarte Rezept-Empfehlungen
- [ ] Koch-Timer Integration
- [ ] Nährwerte-Berechnung
- [ ] Mehrsprachigkeit (EN, DE, FR, ES)

---

### Bekannte Issues
- OCR funktioniert manchmal bei handschriftlichen Rezepten nicht optimal
- Instagram-Import kann bei privaten Profilen fehlschlagen
- Performance bei >500 Rezepten könnte verbessert werden

---

## Versions-Nummerierung

- **MAJOR**: Breaking Changes (z.B. 1.0 → 2.0)
- **MINOR**: Neue Features (z.B. 1.0 → 1.1)
- **PATCH**: Bugfixes (z.B. 1.0.0 → 1.0.1)

---

## Support

Bei Problemen oder Fragen:
- E-Mail: support@cookly.recipe
- GitHub Issues: https://github.com/yourusername/cookly-app/issues
