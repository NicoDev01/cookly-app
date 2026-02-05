# Cookly - Deine KI-gestützte Rezept-App

## Was ist Cookly?

**Cookly** ist eine intelligente Rezept-App für Android, die dir hilft, Rezepte von überall zu speichern und zu verwalten – sei es aus dem Web, von Instagram oder einfach aus einem Foto eines Rezepts. Die App kombiniert modernste KI-Technologie mit einem intuitiven, nativen Android-Erlebnis.

### Das Besondere an Cookly:
- **KI-Scanner**: Fotografiere ein Rezept (aus Buch, Zeitschrift, Handzettel) und die KI extrahiert automatisch Titel, Zutaten und Zubereitung
- **Universal-Import**: Füge Rezepte per URL (von beliebigen Webseiten) oder Instagram-Link hinzu
- **Freemium-Modell**: Kostenlos nutzbar mit monatlichem Limit, oder unbegrenzt mit Pro-Abonnement

---

## Was kann Cookly?

### Kernfunktionen:

| Funktion | Beschreibung |
|----------|--------------|
| 🤖 **KI-Rezeptscanner** | Fotografiere Rezepte – die Google Gemini KI liest und strukturiert sie automatisch |
| 🌐 **Web-Import** | Füge Rezepte per URL hinzu – Cookly scraped die Seite automatisch |
| 📱 **Instagram-Import** | Speichere Rezepte direkt aus Instagram-Posts |
| 📅 **Wochenplanung** | Plane deine Mahlzeiten für die ganze Woche |
| 🛒 **Einkaufslisten** | Erstelle intelligente Einkaufslisten mit automatischer Deduplizierung |
| 🔐 **Cloud-Sync** | Deine Rezepte sind sicher in der Cloud gespeichert und überall verfügbar |

### Abonnement-Pläne:

| Plan | Preis | Inklusive |
|------|-------|-----------|
| **Free** | Kostenlos | 5 Rezept-Importe/Monat, 1 Wochenplan |
| **Pro Monthly** | €9,99/Monat | Unbegrenzte Importe, unbegrenzte Planung, Prioritäts-Support |
| **Pro Yearly** | €79,99/Jahr | 33% Rabatt – 12 Monate zum Preis von 10 |
| **Lifetime** | €249,99 | Einmalzahlung, lebenslanger Zugriff, VIP-Support |

---

## Wie funktioniert Cookly?

### Technische Architektur:

Cookly ist als **moderne Web-App** gebaut, die sich wie eine native Android-App anfühlt:

```
┌─────────────────────────────────────────────────────────────┐
│                    BENUTZER (Android App)                    │
├─────────────────────────────────────────────────────────────┤
│  React 19 + TypeScript + Vite                               │
│  ↓                                                          │
│  Capacitor (Native Android-Wrapper)                         │
│  - Kamera-Zugriff                                           │
│  - Dateisystem                                              │
│  - Native Haptics                                           │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    BACKEND (Convex)                          │
│  - Serverless Datenbank                                     │
│  - Echtzeit-Synchronisation                                 │
│  - Automatische Skalierung                                  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                 EXTERNE DIENSTE                              │
│  Clerk (Login) ←→ Stripe (Zahlungen)                        │
│  Google Gemini (KI/OCR) ←→ Jina.ai/Apify (Web-Scraping)     │
└─────────────────────────────────────────────────────────────┘
```

### Wie importierst du ein Rezept?

1. **App öffnen** → Plus-Button tippen
2. **Quelle wählen:**
   - **Foto**: Kamera öffnen, Rezept fotografieren → KI analysiert das Bild
   - **URL**: Link einfügen → App scraped die Webseite
   - **Manuell**: Rezept selbst eingeben
3. **Vorschau prüfen** – Titel, Zutaten, Zubereitung werden automatisch erkannt
4. **Speichern** – Rezept landet in deiner persönlichen Sammlung

### Wie sieht es für dich aus?

Die App nutzt moderne Android-UI-Patterns:
- **Bottom Sheets** für Aktionen (wie bei Google Maps)
- **Slide-over Panels** für Details
- **Flüssige Animationen** bei Übergängen
- **Content-First Design** – große, hochwertige Bilder und lesbare Typografie

### Entwickelt mit:
- **React 19** – Neueste Version für beste Performance
- **TypeScript** – Typsicherheit für weniger Fehler
- **Tailwind CSS** – Modernes, responsives Styling
- **Convex** – Serverless Backend mit Echtzeit-Updates
- **Clerk** – Sichere Authentifizierung
- **Stripe** – Professionelle Abonnement-Verwaltung
- **Capacitor** – Native Android-App aus Web-Technologien

---

**Zusammenfassung**: Cookly ist deine digitale Rezeptsammlung mit KI-Superkräften – speichere Rezepte von überall, plane deine Woche und erstelle Einkaufslisten, alles in einer schönen, nativen Android-App.

1. Wie ist es technisch aufgebaut? (Architektur, Tech Stack)

   Tech Stack:

   Frontend:

   - React 19.2.0
   - TypeScript 5.9.3
   - Vite 7.2.4
   - Tailwind CSS 3.4.19
   - React Router DOM 7.12.0

   Backend:

   - Convex 1.31.3 (Serverless, Realtime Database)
   - Clerk (Authentifizierung)
   - Stripe 20.1.2 (Zahlungen)
   - Google GenAI 1.34.0 (KI/OCR)

   Mobile:

   - Capacitor 8.0.0 (Android Build)
   - Capacitor Camera, Filesystem, Haptics, Splash Screen

   UI-Komponenten:

   - Radix UI (Label, Progress, Separator, Switch)
   - Lucide React (Icons)
   - Embla Carousel React
   - Blurhash (Bild-Platzhalter)

   Architektur-Übersicht:

   ```mermaid
   graph TB
       subgraph Frontend
           A[React 19 + Vite + TypeScript]
           B[Tailwind CSS]
           C[React Router]
       end

       subgraph Mobile
           D[Capacitor Android]
           E[Camera Plugin]
           F[Filesystem]
       end

       subgraph Backend
           G[Convex Serverless]
           H[Database Schema]
           I[Actions/Mutations/Queries]
       end

       subgraph External Services
           J[Clerk Auth]
           K[Stripe Payments]
           L[Google Gemini AI]
           M[Jina.ai/Apify Scraping]
       end

       A --> D
       A --> G
       D --> E
       D --> F
       G --> J
       G --> K
       G --> L
       G --> M
   ```

   Datenbank-Schema-Muster:

   - users: Clerk ID Referenz, Stripe Subscription ID, Plan-Typ ('free', 'pro'), Zähler (importsUsed, recipesCreated)
   - recipes: userId (Index), title, ingredients (Array), instructions (String/JSON), imageUrl, source ('manual', 'url', 'ocr'), tags
   - weeklyLists: userId Referenz, Array von recipeIDs
   - shopping: Deduplizierung über normalizedName + key

   Multi-Tenancy Pattern:

   Alle Benutzerdaten sind durch clerkId isoliert. Jede Convex Query/Mutation muss nach der authentifizierten Benutzer-ID filtern. Das Backend erzwingt Abonnement-Limits und validiert Eigentumsrechte.

   Sicherheits- und Validierungsregeln:

   - Identität: ctx.auth.getUserIdentity() in jeder Convex-Funktion
   - Validierung: Gescrapte Datenstruktur vor dem Speichern validieren
   - Rate Limiting: Max 1 Scrape pro 10 Sekunden pro Benutzer
   - Lineare Kontrollflüsse: Keine verschachtelten Callback-Höllen, klare async/await-Struktur

2. Wie funktioniert es für den Nutzer?

   Onboarding-Flow:

   - Willkommensbildschirm mit Features-Übersicht
   - Personalisierungsschritt
   - Registrierung/Login mit Clerk

   Rezept-Import-Workflow:

   ```mermaid
   sequenceDiagram
       participant User
       participant UI
       participant "Convex Action"
       participant "External API"
       participant "Convex Mutation"

       User->>UI: URL oder Foto eingeben
       UI->>User: "AI arbeitet..." (Loading State)

       alt URL-Import
           UI->>"Convex Action": URL übergeben
           "Convex Action"->>"External API": Jina.ai/Apify aufrufen
           "External API"-->>"Convex Action": HTML/JSON zurückgeben
           "Convex Action"->>"Convex Action": Titel, Zutaten, Anweisungen parsen
       else Foto-Import
           UI->>"Convex Action": Foto hochladen
           "Convex Action"->>"External API": Gemini Vision API aufrufen
           "External API"-->>"Convex Action": Text zurückgeben
           "Convex Action"->>"Convex Action": Text in Rezept-Format strukturieren
       end

       "Convex Action"->>"Convex Mutation": Geparstes Rezept übergeben
       "Convex Mutation"->>"Convex Mutation": checkUserLimits(userId)

       alt Limit erreicht
           "Convex Mutation"-->>UI: Fehler "Limit erreicht"
           UI->>User: Upgrade Modal anzeigen
       else Limit OK
           "Convex Mutation"->>"Convex Mutation": In recipes-Tabelle speichern
           "Convex Mutation"-->>UI: Erfolgreich gespeichert
           UI->>User: Neues Rezept anzeigen
       end
   ```

# Cookly App - Seiten & UI-Übersicht

## 🚀 Start: Onboarding-Flow (für neue Nutzer)

Wenn du Cookly zum ersten Mal öffnest, durchläufst du einen **3-Schritte Onboarding**:

### 1. Willkommen
- Großes Cookly Logo mit animiertem Fade-in
- Kurzer Slogan/Begrüßungstext
- "Los geht's" Button

### 2. Features (aufklappbare Karten)
4 Feature-Karten, die du aufklappen kannst:
- 🍳 **Rezepte erstellen** - Manuell oder per KI
- 📸 **Instagram Import** - Rezepte aus Posts speichern
- 🤖 **KI-Scan** - Fotos von Rezepten scannen
- 📅 **Wochenplaner** - Mahlzeiten planen

### 3. Personalisierung
- **Kochfrequenz**: Wie oft kochst du? (Täglich, Wochenende, etc.)
- **Küchen-Präferenzen**: Welche Küchen magst du? (Italienisch, Asiatisch, etc.)
- Fortschrittsbalken zeigt deinen Onboarding-Fortschritt

---

## 📱 Hauptbereich: Die 5 Tabs (Bottom Navigation)

Nach dem Login/Onboarding siehst du die **Bottom Navigation Bar** mit 5 Tabs:

### 🏠 Kategorien (`/tabs/categories`)
**Was du siehst:**
- **Suchleiste** oben mit Lupe-Icon
- **Kategorien-Grid**: Frühstück, Mittagessen, Abendessen, Dessert, etc.
- Jede Kategorie zeigt ein automatisch generiertes Bild
- **Zutaten-Filter**: Filtere nach bestimmten Zutaten
- Rezepte werden als **Cards** angezeigt mit Bild, Titel, Zeit

**Was du machen kannst:**
- Rezepte durchsuchen und filtern
- Auf ein Rezept tippen für Details
- Zutaten filtern (z.B. nur Rezepte mit Hühnchen)

---

### ❤️ Favoriten (`/tabs/favorites`)
**Was du siehst:**
- Liste aller deiner "gelikten" Rezepte
- Herz-Icon ist gefüllt bei Favoriten
- Leerer Zustand: "Noch keine Favoriten" mit Hinweis

**Was du machen kannst:**
- Schnell auf Lieblingsrezepte zugreifen
- Favoriten entfernen (Herz nochmal tippen)

---

### 📅 Wochenplaner (`/tabs/weekly`)
**Was du siehst:**
- **Tag/Woche Toggle**: Zwischen Tages- und Wochenansicht wechseln
- **Wochen-Grid**: 7 Tage mit Mahlzeiten-Slots
- Jede geplante Mahlzeit zeigt Bild + Titel
- **Heute-Button**: Springt zum aktuellen Tag

**Was du machen kannst:**
- Mahlzeiten für bestimmte Tage planen
- Auf "+" tippen um Rezepte zum Plan hinzuzufügen
- Wochenplan teilen (Teilen-Button)
- Swipe zwischen Wochen

---

### 🛒 Einkaufsliste (`/tabs/shopping`)
**Was du siehst:**
- **Automatisch generierte Liste** aus deinem Wochenplan
- Zutaten sind gruppiert mit **farbigen Tags** (Fleisch, Gemüse, etc.)
- Checkboxen zum Abhaken
- "Alles abhaken" Option

**Was du machen kannst:**
- Zutaten abhaken beim Einkaufen
- Einzelne Zutaten löschen
- Liste manuell bearbeiten

---

### 👤 Profil (`/tabs/profile`)
**Was du siehst:**
- **Profilbild & Name** (von Clerk Auth)
- **Abonnement-Status**: Free oder Pro Badge
- **Nutzungs-Tracker**: 
  - Wieviele Rezepte importiert
  - Wieviele KI-Scans verbraucht
  - Limit-Anzeige (bei Free)
- **Einstellungen**: Konto löschen, Abo verwalten

**Was du machen kannst:**
- Auf "Upgrade" tippen für Pro-Pläne
- Abonnement kündigen/verwalten
- Konto löschen

---

## ➕ Floating Action Button (FAB)

In der Mitte der Bottom Nav befindet sich der **große + Button**:

**Was passiert beim Tippen:**
- **Bottom Sheet** öffnet sich von unten
- 3 Optionen:
  1. 📸 **Foto scannen** - Kamera öffnen für KI-Scan
  2. 🌐 **URL importieren** - Link einfügen
  3. ✍️ **Manuell erstellen** - Rezept selbst eingeben

---

## 📖 Rezept-Detailseite (`/recipe/:id`)

**Was du siehst:**
- **Hero-Bild** des Rezepts (groß, hochauflösend)
- **Titel** und **Kategorie**
- **Meta-Infos**: Zeit, Schwierigkeit, Portionen
- **Zutaten-Liste** mit Mengen
- **Zubereitung** als nummerierte Schritte
- **Herz-Icon** (oben rechts) zum Liken

**Besonderheiten:**
- Swipe-Navigation: Wische nach links/rechts für nächstes/voriges Rezept
- Native Back-Button Unterstützung
- "Zum Plan hinzufügen" Button

---

## 💳 Abonnement-Seite (`/tabs/subscribe`)

**Was du siehst:**
- 3 Abo-Karten:
  - **Pro Monthly** (€9.99/Monat)
  - **Pro Yearly** (€79.99/Jahr - mit "33% sparen" Badge)
  - **Lifetime** (€249.99 einmalig)
- Feature-Vergleich-Liste
- "Auswählen" Buttons

---

## 🎨 Visuelles Design

- **Glassmorphism**: Halbtransparente Panels mit Blur-Effekt
- **Neomorphism**: Sanfte Schatten für Buttons und Cards
- **Dark Mode**: Unterstützung für helles und dunkles Theme
- **Native Android-Feeling**: Bottom Sheets, Slide-over Panels, flüssige Animationen
- **Content-First**: Große Bilder, klare Typografie