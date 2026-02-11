# Android Back Button - Implementierungsdokumentation

## Überblick

Dieses Dokument beschreibt die Implementierung des nativen Android Zurück-Buttons in der Cookly Capacitor App. Die Implementierung folgt Android Best Practices und sorgt für ein natives App-Gefühl.

---

## Problemstellung

Bei Hybrid-Apps (Capacitor + React) ist das Back-Button-Verhalten komplex:

1. **Browser History vs. React Router Navigation**: React Router's `navigate()` aktualisiert nicht korrekt die Browser-History, weshalb der `canGoBack` Parameter des Capacitor-Back-Events unzuverlässig ist.

2. **HashRouter Komplikation**: Cookly verwendet `HashRouter` (für Capacitor-Compatibility), was die History-Verwaltung weiter erschwert.

3. **Native Erwartung**: Nutzer erwarten, dass die App bei Back-Button auf Root minimiert wird (nicht beendet).

---

## Lösung

### Datei
`hooks/useBackButton.ts`

### Core-Prinzip
**Wir verlassen uns NICHT auf `canGoBack`, sondern prüfen direkt den aktuellen Pfad.**

```typescript
// FALSCH - canGoBack basiert auf Browser History
App.addListener('backButton', ({ canGoBack }) => {
  if (!canGoBack) {
    App.exitApp();
  }
});

// RICHTIG - Pfad-basierte Prüfung
App.addListener('backButton', () => {
  if (isRootPage()) {
    App.minimizeApp();
  }
});
```

---

## Navigations-Hierarchie (Priority Order)

```
1. MODAL OFFEN → Modal schließen (HÖCHSTE PRIORITÄT)
2. /recipe/:id   → Historisch zurück (favorites/weekly/category)
3. /tabs/subscribe → /tabs/profile
4. Andere Tabs    → /tabs/categories (Root)
5. /tabs/categories → App.minimizeApp() (ROOT)
```

### Code-Implementierung

```typescript
const setupHandler = async () => {
  const handler = await App.addListener('backButton', () => {
    // 1. Modal schließen
    if (isAnyModalOpen) {
      closeModals();
      return;
    }

    // 2. RecipePage → Historische Navigation
    if (location.pathname.startsWith('/recipe/')) {
      const handled = handleHistoricalBack();
      if (handled) return;
      navigate('/tabs/categories');
      return;
    }

    // 3. ROOT PAGE → App minimieren
    if (isRootPage()) {
      App.minimizeApp().catch(() => {
        App.exitApp(); // Fallback für iOS
      });
      return;
    }

    // 4. Standard Navigation zu Root
    handleStandardBack();
  });

  return handler;
};
```

---

## Wichtige APIs

### App.minimizeApp() (Android ONLY)
- **Verhalten**: Minimiert die App, hält sie im Speicher
- **Verfügbar**: Nur auf Android
- **Best Practice**: Use this instead of `exitApp()` for better UX

```typescript
await App.minimizeApp(); // App bleibt im RAM, schneller Restart
```

### App.exitApp()
- **Verhalten**: Beendet die App komplett
- **Seit**: Capacitor 1.0.0
- **Verwendung**: Nur als Fallback für iOS (minimizeApp dort nicht verfügbar)

```typescript
await App.exitApp(); // Komplettes Beenden
```

### Haptics.impact()
- **Verhalten**: Leichte Vibration bei Back-Press
- **Style**: `ImpactStyle.Light` (subtil, nicht aufdringlich)

```typescript
Haptics.impact({ style: ImpactStyle.Light });
```

---

## Root Page Detection

```typescript
const isRootPage = () => {
  return location.pathname === '/tabs/categories' || location.pathname === '/';
};
```

**Wichtig**: Diese Prüfung funktioniert unabhängig von der Browser-History.

---

## useEffect Dependencies

```typescript
useEffect(() => {
  // Handler setup...
}, [
  isAnyModalOpen,
  location,           // WICHTIG: Ganzes location-Objekt, nicht nur pathname!
  handleHistoricalBack,
  handleStandardBack,
  navigate,
  closeModals,
  triggerHapticFeedback
]);
```

**Critical**: `location` (vollständiges Objekt) statt `location.pathname` als Dependency verwenden, damit `isRootPage()` korrekt aktualisiert wird!

---

## Häufige Fehler & Lösungen

### Problem 1: Back Button funktioniert nach Navigation nicht mehr
**Ursache**: Dependency ist `location.pathname` statt `location`. Die `isRootPage()` Closure hat den alten Wert.

**Lösung**: Dependency auf `location` Objekt ändern.

### Problem 2: canGoBack ist immer true
**Ursache**: React Router's `navigate()` pusht zur Stack, aber `canGoBack` prüft Browser History.

**Lösung**: Pfad-basierte Prüfung statt `canGoBack`.

### Problem 3: App wird beendet statt minimiert
**Ursache**: `App.exitApp()` statt `App.minimizeApp()` verwendet.

**Lösung**: `minimizeApp()` mit Fallback auf `exitApp()`.

---

## Test-Szenarien

| Szenario | Erwartetes Verhalten |
|------------|---------------------|
| App starten → Zurück | App minimiert |
| Tab wechseln → Zurück | Zurück zu Root |
| Recipe öffnen → Zurück | Zurück zur Quelle (favorites/weekly/category) |
| Modal offen → Zurück | Modal schließen, Page bleibt |
| Root → Zurück | App minimiert (nicht beendet) |

---

## Referenzen

- [Capacitor App Plugin Docs](https://capacitorjs.com/docs/apis/app)
- [Android Back Button Guide](https://capacitorjs.com/docs/guides/android-back-button)

---

**Zuletzt aktualisiert**: 2025-02-11
**Status**: ✅ Production Ready
