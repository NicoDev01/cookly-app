# Cookly-App Codebase Analyse

## Inhaltsverzeichnis
- [Verzeichnisstruktur](#verzeichnisstruktur)
- [Schnellreferenz](#schnellreferenz)
- [Übersicht](#übersicht)
- [Backend: Convex](#backend-convex)
  - [Datenmodell](#datenmodell)
  - [Rezepte](#rezepte)
  - [Importe](#importe)
    - [Instagram Import](#instagram-import)
    - [Website Import](#website-import)
  - [Bilder](#bilder)
  - [Auth & Users](#auth--users)
  - [Payments](#payments)
  - [Rate Limiting](#rate-limiting)
  - [Kategorien](#kategorien)
  - [Wochenplan](#wochenplan)
  - [Einkaufsliste](#einkaufsliste)
  - [HTTP Endpoints](#http-endpoints)
- [Frontend: App & UI](#frontend-app--ui)
  - [Haupteinstieg & Routing](#haupteinstieg--routing)
  - [Rezept hinzufügen](#rezept-hinzufügen)
  - [Rezeptanzeige](#rezeptanzeige)
  - [Navigation & Tabs](#navigation--tabs)
  - [Onboarding](#onboarding)
  - [Modal State](#modal-state)
  - [Seiten](#seiten)
  - [Types](#types)
  - [Config](#config)
- [Limits (Free vs Pro)](#limits-free-vs-pro)
- [Architektur-Highlights](#architektur-highlights)
- [Entwickler-Tipps](#entwickler-tipps)

## Verzeichnisstruktur
.
├─ [`App.tsx`](App.tsx:1)
├─ [`convex/`](convex/schema.ts:1)
│  ├─ [`schema.ts`](convex/schema.ts:1)
│  ├─ [`recipes.ts`](convex/recipes.ts:1)
│  ├─ [`instagram.ts`](convex/instagram.ts:1)
│  ├─ [`website.ts`](convex/website.ts:1)
│  ├─ [`pollinationsHelper.ts`](convex/pollinationsHelper.ts:1)
│  ├─ [`unsplashHelper.ts`](convex/unsplashHelper.ts:1)
│  ├─ [`users.ts`](convex/users.ts:1)
│  ├─ [`auth.config.js`](convex/auth.config.js:1)
│  ├─ [`stripe.ts`](convex/stripe.ts:1)
│  ├─ [`stripeInternal.ts`](convex/stripeInternal.ts:1)
│  ├─ [`rateLimiter.ts`](convex/rateLimiter.ts:1)
│  ├─ [`categories.ts`](convex/categories.ts:1)
│  ├─ [`weekly.ts`](convex/weekly.ts:1)
│  ├─ [`shopping.ts`](convex/shopping.ts:1)
│  └─ [`http.ts`](convex/http.ts:1)
├─ [`components/`](components/AddRecipeModal.tsx:1)
│  ├─ [`AddRecipeModal.tsx`](components/AddRecipeModal.tsx:1)
│  ├─ [`RecipeDetail.tsx`](components/RecipeDetail.tsx:1)
│  ├─ [`RecipeCard.tsx`](components/RecipeCard.tsx:1)
│  ├─ [`TabsLayout.tsx`](components/TabsLayout.tsx:1)
│  ├─ [`addRecipeModal/`](components/addRecipeModal/AiScan.tsx:1)
│  │  ├─ [`AiScan.tsx`](components/addRecipeModal/AiScan.tsx:1)
│  │  ├─ [`ManualRecipeForm.tsx`](components/addRecipeModal/ManualRecipeForm.tsx:1)
│  │  └─ [`ImageEditor.tsx`](components/addRecipeModal/ImageEditor.tsx:1)
│  └─ [`onboarding/`](components/onboarding/WelcomeScreen.tsx:1)
├─ [`contexts/ModalContext.tsx`](contexts/ModalContext.tsx:1)
├─ [`pages/`](pages/CategoriesPage.tsx:1)
├─ [`types.ts`](types.ts:1)
├─ [`capacitor.config.ts`](capacitor.config.ts:1)
└─ [`vite.config.ts`](vite.config.ts:1)

## Schnellreferenz
| Bereich | Datei(en) | Beschreibung |
|---------|-----------|--------------|
| **Datenmodell** | [`convex/schema.ts`](convex/schema.ts:1) | Datenbankschema |
| **Rezepte** | [`convex/recipes.ts`](convex/recipes.ts:1) | CRUD für Rezepte |
| **Instagram Import** | [`convex/instagram.ts`](convex/instagram.ts:1) | Instagram Scraping |
| **Website Import** | [`convex/website.ts`](convex/website.ts:1) | Website Scraping |
| **Bilder** | [`convex/pollinationsHelper.ts`](convex/pollinationsHelper.ts:1), [`convex/unsplashHelper.ts`](convex/unsplashHelper.ts:1) | KI-Bild-Generierung |
| **Auth** | [`convex/users.ts`](convex/users.ts:1), [`convex/auth.config.js`](convex/auth.config.js:1) | Clerk Integration |
| **Payments** | [`convex/stripe.ts`](convex/stripe.ts:1), [`convex/stripeInternal.ts`](convex/stripeInternal.ts:1) | Stripe Integration |
| **Rate Limiting** | [`convex/rateLimiter.ts`](convex/rateLimiter.ts:1) | API Limits |
| **Kategorien** | [`convex/categories.ts`](convex/categories.ts:1) | Kategorie-Verwaltung |
| **Wochenplan** | [`convex/weekly.ts`](convex/weekly.ts:1) | Meal Planning |
| **Einkaufsliste** | [`convex/shopping.ts`](convex/shopping.ts:1) | Shopping List |
| **HTTP Endpoints** | [`convex/http.ts`](convex/http.ts:1) | Webhooks |
| **Haupteinstieg** | [`App.tsx`](App.tsx:1) | Routing & App-Struktur |
| **Rezept hinzufügen** | [`components/AddRecipeModal.tsx`](components/AddRecipeModal.tsx:1) | Modal UI |
| **KI-Scan** | [`components/addRecipeModal/AiScan.tsx`](components/addRecipeModal/AiScan.tsx:1) | Foto-Analyse |
| **Manuelles Formular** | [`components/addRecipeModal/ManualRecipeForm.tsx`](components/addRecipeModal/ManualRecipeForm.tsx:1) | Formular UI |
| **Bild-Editor** | [`components/addRecipeModal/ImageEditor.tsx`](components/addRecipeModal/ImageEditor.tsx:1) | Crop/Edit |
| **Rezeptanzeige** | [`components/RecipeDetail.tsx`](components/RecipeDetail.tsx:1), [`components/RecipeCard.tsx`](components/RecipeCard.tsx:1) | Rezept darstellen |
| **Tab Navigation** | [`components/TabsLayout.tsx`](components/TabsLayout.tsx:1) | App Navigation |
| **Onboarding** | [`components/onboarding/`](components/onboarding/WelcomeScreen.tsx:1) | Einführungsscreens |
| **Modals Context** | [`contexts/ModalContext.tsx`](contexts/ModalContext.tsx:1) | Modal State Management |
| **Seiten** | [`pages/`](pages/CategoriesPage.tsx:1) | Alle Seiten der App |
| **Types** | [`types.ts`](types.ts:1) | TypeScript Types |
| **Config** | [`capacitor.config.ts`](capacitor.config.ts:1), [`vite.config.ts`](vite.config.ts:1) | Build Config |

## Übersicht
- Technologie-Stack: Vite + React + TypeScript + Capacitor (Android)
- Backend: Convex (Serverless Database + Functions)
- Auth: Clerk (JWT-basiert)
- Payments: Stripe (Free/Pro Monthly €5/Pro Yearly €50)
- KI: Google Gemini 3 Flash
- Bilder: Pollinations (KI-Generierung), Unsplash (Fallback)

## Backend: Convex

### Datenmodell
**Dateien:**
- [`convex/schema.ts`](convex/schema.ts:1) (Zeilen 4-155)

Beschreibt Benutzer, Rezepte, Wochenplan, Einkaufsliste, Kategorien und Kategorie-Statistiken inklusive Indizes.

### Rezepte
**Dateien:**
- [`convex/recipes.ts`](convex/recipes.ts:1) (Zeilen 71-813, 865-891)

Enthält CRUD, Favoriten, Storage-Cleanup und Limit-Logik sowie die Erzeugung von KI-Bild-URLs.

### Importe

#### Instagram Import
**Dateien:**
- [`convex/instagram.ts`](convex/instagram.ts:1) (Zeilen 1-290)

Flow: Auth → Rate Limiting → URL-Validierung → Deduplication → Apify → Gemini Parsing → Bildbehandlung → Speichern.

#### Website Import
**Dateien:**
- [`convex/website.ts`](convex/website.ts:1) (Zeilen 1-272)

Flow: Auth → Rate Limiting → Jina Reader → Gemini Parsing → Bildbehandlung → Speichern.

### Bilder
**Dateien:**
- [`convex/pollinationsHelper.ts`](convex/pollinationsHelper.ts:1) (Zeilen 1-144)
- [`convex/unsplashHelper.ts`](convex/unsplashHelper.ts:1) (Zeilen 1-67)
- [`convex/recipes.ts`](convex/recipes.ts:1) (Zeilen 865-891)

Primäres KI-Bild-System ist Pollinations (direkte URL-Generierung), Unsplash ist Fallback.

### Auth & Users
**Dateien:**
- [`convex/users.ts`](convex/users.ts:1) (Zeilen 4-787)
- [`convex/auth.config.js`](convex/auth.config.js:1) (Zeilen 1-9)
- [`convex/http.ts`](convex/http.ts:1) (Zeilen 8-103)

Clerk Sync, User-Profil, Onboarding-Flags und Usage-Stats sowie Clerk Webhook-Handling.

### Payments
**Dateien:**
- [`convex/stripe.ts`](convex/stripe.ts:1) (Zeilen 1-314)
- [`convex/stripeInternal.ts`](convex/stripeInternal.ts:1) (Zeilen 1-33)
- [`convex/http.ts`](convex/http.ts:1) (Zeilen 105-174)

Stripe Checkout/Portal, Webhook-Verarbeitung und Downgrade-Logik.

### Rate Limiting
**Dateien:**
- [`convex/rateLimiter.ts`](convex/rateLimiter.ts:1) (Zeilen 1-109)
- [`convex/instagram.ts`](convex/instagram.ts:1) (Zeilen 53-63)
- [`convex/website.ts`](convex/website.ts:1) (Zeilen 52-61)

Zentrale Rate-Limit-Prüfung für Import-Endpunkte (Standard: 10 Requests/Minute).

### Kategorien
**Dateien:**
- [`convex/categories.ts`](convex/categories.ts:1) (Zeilen 1-372)
- [`convex/recipes.ts`](convex/recipes.ts:1) (Zeilen 14-69, 544-549)

Verwaltung der Kategorien inkl. Bilder und Statistiken. Rezept-Änderungen aktualisieren Kategorie-Counts.

### Wochenplan
**Dateien:**
- [`convex/weekly.ts`](convex/weekly.ts:1) (Zeilen 1-144)

CRUD für den Meal-Plan nach Datum.

### Einkaufsliste
**Dateien:**
- [`convex/shopping.ts`](convex/shopping.ts:1) (Zeilen 1-167)

Shopping-List mit Deduping über normalisierte Schlüssel.

### HTTP Endpoints
**Dateien:**
- [`convex/http.ts`](convex/http.ts:1) (Zeilen 8-174)

HTTP-Router für Clerk- und Stripe-Webhooks.

## Frontend: App & UI

### Haupteinstieg & Routing
**Dateien:**
- [`App.tsx`](App.tsx:1) (Zeilen 1-247)

Routing, Protected Layout, Deep Linking und Share-Intent-Handling.

### Rezept hinzufügen
**Dateien:**
- [`components/AddRecipeModal.tsx`](components/AddRecipeModal.tsx:1) (Zeilen 1-887)
- [`components/addRecipeModal/AiScan.tsx`](components/addRecipeModal/AiScan.tsx:1) (Zeilen 1-324)
- [`components/addRecipeModal/ManualRecipeForm.tsx`](components/addRecipeModal/ManualRecipeForm.tsx:1) (Zeilen 1-463)
- [`components/addRecipeModal/ImageEditor.tsx`](components/addRecipeModal/ImageEditor.tsx:1) (Zeilen 1-441)

Modal-Flow für KI-Scan, manuelle Eingabe, Bild-Upload und Bildbearbeitung.

### Rezeptanzeige
**Dateien:**
- [`components/RecipeDetail.tsx`](components/RecipeDetail.tsx:1) (Zeilen 1-164)
- [`components/RecipeCard.tsx`](components/RecipeCard.tsx:1) (Zeilen 1-109)

Detailansicht mit Rezeptauswahl sowie Kartenansicht für Listen.

### Navigation & Tabs
**Dateien:**
- [`components/TabsLayout.tsx`](components/TabsLayout.tsx:1) (Zeilen 1-159)

Persistentes Tab-Layout mit Prefetch und Scroll-Reset.

### Onboarding
**Dateien:**
- [`components/onboarding/WelcomeScreen.tsx`](components/onboarding/WelcomeScreen.tsx:1)
- [`components/onboarding/steps/WelcomeStep.tsx`](components/onboarding/steps/WelcomeStep.tsx:1)
- [`components/onboarding/steps/FeaturesStep.tsx`](components/onboarding/steps/FeaturesStep.tsx:1)
- [`components/onboarding/steps/PersonalizationStep.tsx`](components/onboarding/steps/PersonalizationStep.tsx:1)

Einführungsscreens und Personalisierungsflow.

### Modal State
**Dateien:**
- [`contexts/ModalContext.tsx`](contexts/ModalContext.tsx:1) (Zeilen 1-60)

Zentrales Modal-State-Management (Add-Rezept, Add-Meal).

### Seiten
**Dateien:**
- [`pages/`](pages/CategoriesPage.tsx:1)
- Beispiele: [`pages/CategoriesPage.tsx`](pages/CategoriesPage.tsx:1), [`pages/CategoryRecipesPage.tsx`](pages/CategoryRecipesPage.tsx:1), [`pages/RecipePage.tsx`](pages/RecipePage.tsx:1), [`pages/FavoritesPage.tsx`](pages/FavoritesPage.tsx:1), [`pages/WeeklyPage.tsx`](pages/WeeklyPage.tsx:1), [`pages/ShoppingPage.tsx`](pages/ShoppingPage.tsx:1), [`pages/ProfilePage.tsx`](pages/ProfilePage.tsx:1), [`pages/SubscribePage.tsx`](pages/SubscribePage.tsx:1), [`pages/SignInPage.tsx`](pages/SignInPage.tsx:1), [`pages/SignUpPage.tsx`](pages/SignUpPage.tsx:1), [`pages/ShareTargetPage.tsx`](pages/ShareTargetPage.tsx:1)

Alle Page-Komponenten für die Tabs und Standalone-Routen.

### Types
**Dateien:**
- [`types.ts`](types.ts:1) (Zeilen 1-33)

Zentrale TypeScript-Modelle für Rezepte und Zutaten.

### Config
**Dateien:**
- [`capacitor.config.ts`](capacitor.config.ts:1) (Zeilen 1-30)
- [`vite.config.ts`](vite.config.ts:1) (Zeilen 1-31)

Build- und Runtime-Konfiguration für Web und Capacitor.

## Limits (Free vs Pro)
**Dateien:**
- [`convex/users.ts`](convex/users.ts:1) (Zeilen 5-169)
- [`convex/recipes.ts`](convex/recipes.ts:1) (Zeilen 300-379)

| Feature | Free | Pro |
|---------|------|-----|
| Manuelle Rezepte | 100 | ∞ |
| Link Imports | 100 | ∞ |
| Foto Scans | 100 | ∞ |

## Architektur-Highlights
**Dateien:**
- [`convex/recipes.ts`](convex/recipes.ts:1) (Zeilen 507-581)
- [`convex/rateLimiter.ts`](convex/rateLimiter.ts:1) (Zeilen 1-109)
- [`components/TabsLayout.tsx`](components/TabsLayout.tsx:1) (Zeilen 31-152)
- [`components/AddRecipeModal.tsx`](components/AddRecipeModal.tsx:1) (Zeilen 31-746)

- Multi-Tenant Isolation über Clerk-ID
- Graceful Degradation bei Import- und KI-Fehlern
- Storage Cleanup bei Update/Delete
- Rate Limiting (10 Requests/Minute)
- Blurhash/Preview-Optimierungen und Prefetching

## Entwickler-Tipps
- Neues Feld zum Rezept hinzufügen → [`convex/schema.ts`](convex/schema.ts:61), [`types.ts`](types.ts:13), [`convex/recipes.ts`](convex/recipes.ts:266)
- Neue Seite hinzufügen → [`pages/`](pages/CategoriesPage.tsx:1), [`App.tsx`](App.tsx:16)
- Neues Tab hinzufügen → [`components/TabsLayout.tsx`](components/TabsLayout.tsx:12), [`App.tsx`](App.tsx:189)
- Limit ändern → [`convex/users.ts`](convex/users.ts:5), [`convex/recipes.ts`](convex/recipes.ts:351)
- Neuer Import-Typ → neuer Handler unter [`convex/`](convex/instagram.ts:1) plus UI-Anbindung in [`components/AddRecipeModal.tsx`](components/AddRecipeModal.tsx:270)
- Neues Bild-Backend anbinden → [`convex/pollinationsHelper.ts`](convex/pollinationsHelper.ts:1), [`convex/unsplashHelper.ts`](convex/unsplashHelper.ts:1), [`components/AddRecipeModal.tsx`](components/AddRecipeModal.tsx:113)
- Kategorie-Logik anpassen → [`convex/categories.ts`](convex/categories.ts:1), [`convex/recipes.ts`](convex/recipes.ts:14)
- Webhook-Flow ändern → [`convex/http.ts`](convex/http.ts:8), [`convex/users.ts`](convex/users.ts:797), [`convex/stripe.ts`](convex/stripe.ts:187)

---

## App-Assets: Icons, Logos & Splash Screens

Diese Dokumentation beschreibt alle visuellen Assets der Cookly-App, ihre Speicherorte, Struktur und wie sie bei Änderungen aktualisiert werden.

### Übersicht der Asset-Typen

| Asset-Typ | Verwendung | Primärer Speicherort |
|-----------|-----------|---------------------|
| **App-Icon** | Android Launcher Icon | [`android/app/src/main/res/mipmap-*/`](android/app/src/main/res/mipmap-hdpi/) |
| **Web-Icons** | PWA, Favicon, Browser | [`public/`](public/) |
| **Splash Screen** | App-Start-Bildschirm | [`android/app/src/main/res/drawable-*/`](android/app/src/main/res/drawable/) |
| **Quelldateien** | Ausgangsmaterial für Generierung | [`public/logo.png`](public/logo.png), [`assets/splash.png`](assets/splash.png) |

### Farbschema

Alle Assets verwenden das einheitliche Cookly-Farbschema:

| Farbe | Hex-Wert | Verwendung |
|-------|----------|------------|
| **Primary** | `#b2c8ba` | Hintergrund, Splash Screen, Icon-Hintergrund |
| **Primary Dark** | `#9ab3a4` | Status-Bar, dunklere Akzente |
| **Theme Color** | `#b2c8ba` | Browser-Theme, PWA |

### 1. Android Launcher Icons

#### Adaptive Icons (Android 8.0+ API 26+)

**Konfiguration:** [`mipmap-anydpi-v26/`](android/app/src/main/res/mipmap-anydpi-v26/)

| Datei | Beschreibung |
|-------|-------------|
| [`ic_launcher.xml`](android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml) | Adaptive Icon Definition (eckig) |
| [`ic_launcher_round.xml`](android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml) | Adaptive Icon Definition (rund) |

**Struktur (XML):**
```xml
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/> <!-- #b2c8ba -->
    <foreground android:drawable="@drawable/ic_launcher_foreground"/> <!-- PNG -->
</adaptive-icon>
```

#### Legacy Icons (PNG-basiert)

**Speicherort:** [`mipmap-*/`](android/app/src/main/res/mipmap-hdpi/)

| Dichte | Ordner | Größe (eckig) | Größe (rund) |
|--------|--------|---------------|--------------|
| ldpi | - | - | - |
| mdpi | [`mipmap-mdpi/`](android/app/src/main/res/mipmap-mdpi/) | 48x48px | 48x48px |
| hdpi | [`mipmap-hdpi/`](android/app/src/main/res/mipmap-hdpi/) | 72x72px | 72x72px |
| xhdpi | [`mipmap-xhdpi/`](android/app/src/main/res/mipmap-xhdpi/) | 96x96px | 96x96px |
| xxhdpi | [`mipmap-xxhdpi/`](android/app/src/main/res/mipmap-xxhdpi/) | 144x144px | 144x144px |
| xxxhdpi | [`mipmap-xxxhdpi/`](android/app/src/main/res/mipmap-xxxhdpi/) | 192x192px | 192x192px |

**Dateien pro Ordner:**
- `ic_launcher.png` - Eckiges Icon
- `ic_launcher_round.png` - Rundes Icon

#### Icon-Hintergrund

**Vektor-Hintergrund:** [`drawable/ic_launcher_background.xml`](android/app/src/main/res/drawable/ic_launcher_background.xml)
- Ein 108dp x 108dp Vektor-Grid (wird vom Vordergrund überlagert)
- Enthält Referenz auf `@color/ic_launcher_background` → `#b2c8ba`

**Vordergrund:** [`drawable/ic_launcher_foreground.png`](android/app/src/main/res/drawable/ic_launcher_foreground.png)
- Das eigentliche Logo als PNG
- Wird von den adaptive-icon XMLs referenziert

### 2. Splash Screens

#### Android 12+ Splash Screen API

**Layer-List:** [`drawable/splash_icon.xml`](android/app/src/main/res/drawable/splash_icon.xml)
```xml
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:drawable="@color/splash_background"/> <!-- #b2c8ba -->
    <item>
        <bitmap android:src="@drawable/splash" android:gravity="center"/>
    </item>
</layer-list>
```

#### Legacy Splash Screens (Portrait & Landscape)

**Portrait-Modus:** [`drawable-port-*/`](android/app/src/main/res/drawable-port-hdpi/)

| Dichte | Ordner | Typische Größe |
|--------|--------|----------------|
| ldpi | [`drawable-port-ldpi/`](android/app/src/main/res/drawable-port-ldpi/) | 320x426px |
| mdpi | [`drawable-port-mdpi/`](android/app/src/main/res/drawable-port-mdpi/) | 320x470px |
| hdpi | [`drawable-port-hdpi/`](android/app/src/main/res/drawable-port-hdpi/) | 480x640px |
| xhdpi | [`drawable-port-xhdpi/`](android/app/src/main/res/drawable-port-xhdpi/) | 720x960px |
| xxhdpi | [`drawable-port-xxhdpi/`](android/app/src/main/res/drawable-port-xxhdpi/) | 960x1280px |
| xxxhdpi | [`drawable-port-xxxhdpi/`](android/app/src/main/res/drawable-port-xxxhdpi/) | 1280x1920px |

**Landscape-Modus:** [`drawable-land-*/`](android/app/src/main/res/drawable-land-hdpi/)

| Dichte | Ordner | Typische Größe |
|--------|--------|----------------|
| ldpi | [`drawable-land-ldpi/`](android/app/src/main/res/drawable-land-ldpi/) | 426x320px |
| mdpi | [`drawable-land-mdpi/`](android/app/src/main/res/drawable-land-mdpi/) | 470x320px |
| hdpi | [`drawable-land-hdpi/`](android/app/src/main/res/drawable-land-hdpi/) | 640x480px |
| xhdpi | [`drawable-land-xhdpi/`](android/app/src/main/res/drawable-land-xhdpi/) | 960x720px |
| xxhdpi | [`drawable-land-xxhdpi/`](android/app/src/main/res/drawable-land-xxhdpi/) | 1280x960px |
| xxxhdpi | [`drawable-land-xxxhdpi/`](android/app/src/main/res/drawable-land-xxxhdpi/) | 1920x1280px |

**Datei in jedem Ordner:** `splash.png`

**Fallback:** [`drawable/splash.png`](android/app/src/main/res/drawable/splash.png) - Wird auch als Icon für Android 12+ Splash API verwendet

### 3. Web/PWA Assets

**Speicherort:** [`public/`](public/)

#### Hauptlogo

| Datei | Größe | Verwendung |
|-------|-------|------------|
| [`logo.png`](public/logo.png) | 1024x1024px | Quelle für Capacitor-Assets |
| [`splash.png`](public/splash.png) | 2732x2732px | Quelle für Splash Screens |

#### Android Icons (PWA)

| Datei | Größe | Density | Zweck |
|-------|-------|---------|-------|
| `android-icon-36x36.png` | 36x36 | 0.75 | Benachrichtigungen |
| `android-icon-48x48.png` | 48x48 | 1.0 | Launcher |
| `android-icon-72x72.png` | 72x72 | 1.5 | mdpi |
| `android-icon-96x96.png` | 96x96 | 2.0 | hdpi |
| `android-icon-144x144.png` | 144x144 | 3.0 | xhdpi |
| `android-icon-192x192.png` | 192x192 | 4.0 | xxhdpi, maskable |
| `play-store-icon-512.png` | 512x512 | - | Play Store Listing |

#### Apple Touch Icons (iOS)

| Datei | Größe | Verwendung |
|-------|-------|------------|
| `apple-icon-57x57.png` | 57x57 | iPhone (nicht-Retina) |
| `apple-icon-60x60.png` | 60x60 | iPhone |
| `apple-icon-72x72.png` | 72x72 | iPad (nicht-Retina) |
| `apple-icon-76x76.png` | 76x76 | iPad |
| `apple-icon-114x114.png` | 114x114 | iPhone (Retina) |
| `apple-icon-120x120.png` | 120x120 | iPhone |
| `apple-icon-144x144.png` | 144x144 | iPad (Retina) |
| `apple-icon-152x152.png` | 152x152 | iPad |
| `apple-icon-180x180.png` | 180x180 | iPhone (Retina HD) |
| `apple-icon.png` | 192x192 | Standard |
| `apple-icon-precomposed.png` | 192x192 | Ohne iOS-Effekte |

#### Favicons

| Datei | Größe | Verwendung |
|-------|-------|------------|
| `favicon.ico` | Multi-Size | Browser-Tab |
| `favicon-16x16.png` | 16x16 | Browser-Tab |
| `favicon-32x32.png` | 32x32 | Browser-Tab (Retina) |
| `favicon-96x96.png` | 96x96 | Desktop-Shortcut |
| `favcon.jpg` | - | Alternative |

#### Microsoft Tiles

| Datei | Größe | Verwendung |
|-------|-------|------------|
| `ms-icon-70x70.png` | 70x70 | Kleine Kachel |
| `ms-icon-144x144.png` | 144x144 | Mittlere Kachel |
| `ms-icon-150x150.png` | 150x150 | Quadratische Kachel |
| `ms-icon-310x310.png` | 310x310 | Große Kachel |
| `browserconfig.xml` | - | IE/Edge Konfiguration |

#### Web App Manifest

**Datei:** [`public/manifest.json`](public/manifest.json)

```json
{
  "name": "Cookly - Rezepte einfach verwalten",
  "short_name": "Cookly",
  "background_color": "#f0f2f5",
  "theme_color": "#b2c8ba",
  "orientation": "portrait",
  "icons": [...]
}
```

### 4. Capacitor-Konfiguration

#### Asset-Generierung

**Datei:** [`capacitor-assets.json`](capacitor-assets.json)

```json
{
  "icon": {
    "source": "public/logo.png",
    "background": "#b2c8ba",
    "foreground": "public/logo.png"
  },
  "splash": {
    "source": "assets/splash.png",
    "color": "#b2c8ba",
    "androidScaleType": "CENTER_CROP"
  }
}
```

**Verwendung:**
```bash
npx capacitor-assets generate
```

Dies generiert automatisch alle Android-Assets aus den Quelldateien.

#### Splash Screen Konfiguration

**Datei:** [`capacitor.config.ts`](capacitor.config.ts)

```typescript
plugins: {
  SplashScreen: {
    launchShowDuration: 2000,      // 2 Sekunden anzeigen
    launchAutoHide: false,         // Manuell ausblenden
    launchFadeOutDuration: 500,    // 500ms Fade-Out
    backgroundColor: "#b2c8ba",    // Hintergrundfarbe
    androidSplashResourceName: "splash",
    androidScaleType: "CENTER_CROP",
    showSpinner: false,
    splashFullScreen: true,
    splashImmersive: true,
  },
}
```

### 5. Wichtige Ressourcen-Dateien

#### Farbdefinitionen

**Datei:** [`android/app/src/main/res/values/colors.xml`](android/app/src/main/res/values/colors.xml)
```xml
<color name="colorPrimary">#b2c8ba</color>
<color name="colorPrimaryDark">#9ab3a4</color>
<color name="colorAccent">#b2c8ba</color>
<color name="splash_background">#b2c8ba</color>
```

**Datei:** [`android/app/src/main/res/values/ic_launcher_background.xml`](android/app/src/main/res/values/ic_launcher_background.xml)
```xml
<color name="ic_launcher_background">#b2c8ba</color>
```

### 6. Asset-Änderungen: Best Practices

#### Logo/Icon ändern

1. **Quelldatei aktualisieren:**
   - Ersetze [`public/logo.png`](public/logo.png) (1024x1024px empfohlen)

2. **Android-Assets regenerieren:**
   ```bash
   npx capacitor-assets generate
   ```

3. **Web-Icons manuell aktualisieren:**
   - Alle [`public/android-icon-*.png`](public/android-icon-36x36.png)
   - Alle [`public/apple-icon-*.png`](public/apple-icon-57x57.png)
   - Alle [`public/favicon-*.png`](public/favicon-16x16.png)
   - [`public/favicon.ico`](public/favicon.ico)
   - [`public/ms-icon-*.png`](public/ms-icon-70x70.png)

#### Splash Screen ändern

1. **Quelldatei aktualisieren:**
   - Ersetze [`assets/splash.png`](assets/splash.png) (2732x2732px empfohlen)
   - Oder [`public/splash.png`](public/splash.png) für Web

2. **Android-Assets regenerieren:**
   ```bash
   npx capacitor-assets generate
   ```

3. **Hintergrundfarbe anpassen (falls nötig):**
   - [`capacitor.config.ts`](capacitor.config.ts) → `backgroundColor`
   - [`capacitor-assets.json`](capacitor-assets.json) → `splash.color`
   - [`android/app/src/main/res/values/colors.xml`](android/app/src/main/res/values/colors.xml) → `splash_background`

#### Farbschema ändern

Wenn das Cookly-Grün (`#b2c8ba`) geändert werden soll:

1. **Capacitor Config:** [`capacitor.config.ts`](capacitor.config.ts)
2. **Asset Config:** [`capacitor-assets.json`](capacitor-assets.json)
3. **Android Colors:** [`android/app/src/main/res/values/colors.xml`](android/app/src/main/res/values/colors.xml)
4. **Icon Background:** [`android/app/src/main/res/values/ic_launcher_background.xml`](android/app/src/main/res/values/ic_launcher_background.xml)
5. **Web Manifest:** [`public/manifest.json`](public/manifest.json)
6. **Assets neu generieren:** `npx capacitor-assets generate`

### 7. Zusammenfassung der Datei-Gruppen

| Änderungstyp | Betroffene Dateien |
|--------------|-------------------|
| **Nur Android Icon** | `mipmap-*/*`, `mipmap-anydpi-v26/*`, ggf. `drawable/ic_launcher_foreground.png` |
| **Nur Splash Screen** | `drawable*/splash.png`, `drawable-land-*/splash.png`, `drawable-port-*/splash.png` |
| **Nur Web Icons** | `public/*.png` (außer logo.png, splash.png) |
| **Komplettes Rebranding** | Alle oben genannten + Config-Dateien |

### 8. Wichtige Hinweise

- **Adaptive Icons:** Android 8.0+ verwendet die XML-Definitionen in `mipmap-anydpi-v26/`. Ältere Geräte nutzen die PNGs in `mipmap-*/`.
- **Splash Screen API:** Android 12+ verwendet `splash_icon.xml` mit `windowSplashScreenAnimatedIcon`. Ältere Versionen nutzen die `drawable-*/splash.png` Dateien.
- **CENTER_CROP:** Das Splash-Bild wird skaliert, um den gesamten Bildschirm zu füllen (unter Umständen beschnitten).
- **Quelldateien:** [`public/logo.png`](public/logo.png) und [`assets/splash.png`](assets/splash.png) sind die "Single Source of Truth" für die Asset-Generierung.
