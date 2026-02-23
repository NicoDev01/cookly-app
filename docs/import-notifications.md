# Import-Notifications Dokumentation

Diese Dokumentation beschreibt die Implementierung von Benachrichtigungen für den Rezept-Import in der Cookly-App.

## Inhaltsverzeichnis

- [Übersicht & Features](#übersicht--features)
- [Technische Architektur](#technische-architektur)
- [Dateien & Änderungen](#dateien--änderungen)
- [Implementierungs-Details](#implementierungs-details)
- [Android-spezifische Konfiguration](#android-spezifische-konfiguration)
- [Testing & Debugging](#testing--debugging)
- [Zukünftige Erweiterungen](#zukünftige-erweiterungen)

---

## Übersicht & Features

### Was wurde umgesetzt?

Das Import-Notification-System besteht aus zwei Komponenten:

| Komponente | Beschreibung |
|------------|--------------|
| **System-Notification** | Native Android-Benachrichtigung im Notification-Drawer |
| **App-weiter Toast** | In-App Toast mit direkter Navigation zum Rezept |

### Wann erscheinen die Notifications?

Die Notifications erscheinen bei **erfolgreichem Rezept-Import** über:

- Instagram Post/Reel Links
- Facebook Post Links
- Generische Website-URLs

### User Experience Flow

```
User teilt Link → ShareTargetPage öffnet sich → Import läuft → 
  ↓
Erfolg:
  1. System-Notification erscheint (im Hintergrund sichtbar)
  2. App-Toast erscheint (6 Sekunden sichtbar)
  3. User kann auf Toast tippen → Navigation zum Rezept
```

---

## Technische Architektur

### Verwendete Libraries

| Library | Version | Zweck |
|---------|---------|-------|
| `@capacitor/local-notifications` | - | Native System-Notifications |
| `@capacitor/core` | - | Platform-Erkennung |

### Architektur-Übersicht

```
┌─────────────────────────────────────────────────────────────┐
│                        App.tsx                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              NotificationProvider                        │ │
│  │  ┌─────────────────────────────────────────────────────┐│ │
│  │  │              AppContent                              ││ │
│  │  │  ┌─────────────────────────────────────────────────┐││ │
│  │  │  │         ShareTargetPage                         │││ │
│  │  │  │  - showImportToast(recipeId)  ← Context         │││ │
│  │  │  │  - showSimpleImportNotification() ← Utils       │││ │
│  │  │  └─────────────────────────────────────────────────┘││ │
│  │  └─────────────────────────────────────────────────────┘│ │
│  │  ┌─────────────────────────────────────────────────────┐│ │
│  │  │         GlobalImportToast (immer gerendert)         ││ │
│  │  └─────────────────────────────────────────────────────┘│ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Notification Channels (Android 8+)

Ab Android 8.0 (API 26) müssen Notifications einem Channel zugeordnet werden:

| Property | Wert | Beschreibung |
|----------|------|--------------|
| `id` | `recipe-import` | Eindeutige Channel-ID |
| `name` | Rezept Import | Anzeigename in Systemeinstellungen |
| `importance` | `5` (IMPORTANCE_HIGH) | Zeigt Banner mit Sound |
| `visibility` | `1` (PUBLIC) | Auf Lockscreen sichtbar |
| `lightColor` | `#22c55e` | Grün für Erfolg |

---

## Dateien & Änderungen

### Neue Dateien

#### [`contexts/NotificationContext.tsx`](../contexts/NotificationContext.tsx)

Globaler State für den Import-Toast. Löst das Problem, dass der Toast nur auf ShareTargetPage sichtbar war.

**Features:**
- Context-basierte State-Verwaltung
- `showImportToast(recipeId, message?)` - Toast anzeigen
- `hideImportToast()` - Toast verstecken
- Auto-Dismiss nach 6 Sekunden
- Navigation zum Rezept bei Tap

#### [`utils/notifications.ts`](../utils/notifications.ts)

Helper-Funktionen für native System-Notifications.

**Features:**
- `createNotificationChannel()` - Android 8+ Channel erstellen
- `showSimpleImportNotification(recipeId)` - System-Notification senden
- Permission Handling für Android 13+
- Deep Linking mit `extra.recipeId`

### Geänderte Dateien

#### [`App.tsx`](../App.tsx)

```tsx
// Zeile 17-18: Import des Providers und Channel-Creator
import { NotificationProvider } from './contexts/NotificationContext';
import { createNotificationChannel } from './utils/notifications';

// Zeile 131-133: Channel beim App-Start erstellen
if (Capacitor.isNativePlatform()) {
  createNotificationChannel();
}

// Zeile 136-158: Notification Action Listener für Deep Linking
await LocalNotifications.addListener(
  'localNotificationActionPerformed',
  (notification) => {
    const extra = notification.notification.extra;
    if (extra?.recipeId && extra?.type === 'recipe-import') {
      navigate(`/recipe/${extra.recipeId}`);
    }
  }
);

// Zeile 323: NotificationProvider wrapt die App
<NotificationProvider>
  {/* App Content */}
</NotificationProvider>
```

#### [`pages/ShareTargetPage.tsx`](../pages/ShareTargetPage.tsx)

```tsx
// Zeile 8-9: Imports
import { showSimpleImportNotification } from '../utils/notifications';
import { useNotification } from '../contexts/NotificationContext';

// Zeile 29: Hook verwenden
const { showImportToast } = useNotification();

// Zeile 113-114: Nach erfolgreichem Import
showImportToast(recipeId);              // Global Toast
showSimpleImportNotification(recipeId); // System Notification
```

#### [`android/app/src/main/AndroidManifest.xml`](../android/app/src/main/AndroidManifest.xml)

```xml
<!-- Zeile 73-74: Notification Permission für Android 13+ -->
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

---

## Implementierungs-Details

### NotificationContext

#### Interface

```typescript
interface ToastState {
  visible: boolean;
  recipeId: string | null;
  message: string;
}

interface NotificationContextType {
  toast: ToastState;
  showImportToast: (recipeId: string, message?: string) => void;
  hideImportToast: () => void;
}
```

#### GlobalImportToast Komponente

```tsx
const GlobalImportToast: React.FC<{
  visible: boolean;
  recipeId: string | null;
  message: string;
  onNavigate: () => void;
  onDismiss: () => void;
}> = ({ visible, recipeId, message, onNavigate, onDismiss }) => {
  // Auto-dismiss nach 6 Sekunden
  useEffect(() => {
    if (visible) {
      const timer = setTimeout(onDismiss, 6000);
      return () => clearTimeout(timer);
    }
  }, [visible, onDismiss]);

  if (!visible) return null;

  return (
    <div className="fixed bottom-24 left-4 right-4 z-[100]" onClick={onNavigate}>
      {/* Toast UI */}
    </div>
  );
};
```

#### Verwendung

```tsx
// In jeder Komponente innerhalb des Providers
const { showImportToast, hideImportToast } = useNotification();

// Toast anzeigen
showImportToast('recipe-123', 'Optional: Custom Nachricht');

// Toast verstecken
hideImportToast();
```

### Notification Helper

#### createNotificationChannel()

```typescript
export async function createNotificationChannel(): Promise<void> {
  // Nur auf Android nativ
  if (!Capacitor.isNativePlatform()) return;
  if (Capacitor.getPlatform() !== 'android') return;

  await LocalNotifications.createChannel({
    id: 'recipe-import',
    name: 'Rezept Import',
    description: 'Benachrichtigungen für erfolgreiche Rezept-Imports',
    importance: 5,  // IMPORTANCE_HIGH
    visibility: 1,  // PUBLIC
    sound: 'default',
    vibration: true,
    lights: true,
    lightColor: '#22c55e',
  });
}
```

#### showSimpleImportNotification()

```typescript
export async function showSimpleImportNotification(recipeId?: string): Promise<void> {
  // 1. Platform-Check
  if (!Capacitor.isNativePlatform()) return;

  // 2. Channel sicherstellen
  await createNotificationChannel();

  // 3. Permission prüfen (Android 13+)
  const permissionStatus = await LocalNotifications.checkPermissions();
  if (permissionStatus.display === 'prompt') {
    const result = await LocalNotifications.requestPermissions();
    if (result.display !== 'granted') return;
  }

  // 4. Notification erstellen
  const notification: LocalNotificationSchema = {
    id: Date.now(),
    title: '✅ Rezept importiert',
    body: 'Dein Rezept wurde erfolgreich importiert.',
    channelId: 'recipe-import',
    extra: { recipeId, type: 'recipe-import' },
  };

  // 5. Schedule
  await LocalNotifications.schedule({ notifications: [notification] });
}
```

---

## Android-spezifische Konfiguration

### Permissions

| Permission | Android Version | Zweck |
|------------|-----------------|-------|
| `POST_NOTIFICATIONS` | Android 13+ (API 33+) | Runtime Permission für Notifications |

### AndroidManifest.xml

```xml
<!-- Notification Permission for Android 13+ -->
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

### Notification Channel Eigenschaften

| Eigenschaft | Wert | Beschreibung |
|-------------|------|--------------|
| Importance | `5` | IMPORTANCE_HIGH - Banner + Sound + Vibration |
| Visibility | `1` | PUBLIC - Auf Lockscreen sichtbar |
| Sound | `default` | Standard-Benachrichtigungston |
| Vibration | `true` | Vibration bei Notification |
| Lights | `true` | LED-Benachrichtigung |
| Light Color | `#22c55e` | Grün für Erfolg |

### Deep Linking

Wenn der User auf die Notification tippt, wird er zum Rezept navigiert:

```typescript
// In App.tsx
LocalNotifications.addListener('localNotificationActionPerformed', (notification) => {
  const extra = notification.notification.extra;
  if (extra?.recipeId && extra?.type === 'recipe-import') {
    navigate(`/recipe/${extra.recipeId}`);
  }
});
```

---

## Testing & Debugging

### Wie testet man?

#### 1. System-Notification testen

```bash
# App auf Android-Gerät installieren
npx cap run android

# Von Instagram/Website einen Link teilen zur App
```

#### 2. Toast testen (Preview Mode)

```
# In der Browser-URL eingeben:
http://localhost:5173/share-target?preview=success

# Andere Preview-Modi:
?preview=analyzing    # Ladezustand
?preview=error        # Fehlerzustand
```

#### 3. Permission-Status prüfen

```typescript
// In der Browser-Konsole (mit verbundenem Gerät)
const { LocalNotifications } = await import('@capacitor/local-notifications');
const status = await LocalNotifications.checkPermissions();
console.log('Permission Status:', status);
```

### Debugging mit adb logcat

```bash
# Alle Notification-Logs
adb logcat | grep -i "Notifications"

# Cookly-spezifische Logs
adb logcat | grep -i "cookly"

# Capacitor Logs
adb logcat | grep -i "capacitor"

# Kombiniert
adb logcat | grep -E "(Notifications|ShareTarget|NotificationContext)"
```

### Erwartete Log-Ausgabe bei erfolgreichem Import

```
[Notifications] Creating notification channel: recipe-import
[Notifications] ✅ Channel created successfully: recipe-import
[ShareTarget] #1 scrapePost result { recipeId: 'k57f8...' }
[NotificationContext] showImportToast called with recipeId: k57f8...
[Notifications] showSimpleImportNotification called, recipeId: k57f8...
[Notifications] Step 1: Creating channel...
[Notifications] Step 2: Checking permissions...
[Notifications] Permission status: { display: 'granted' }
[Notifications] Step 3: Creating notification with id: 1708123456789
[Notifications] Step 4: Scheduling notification...
[Notifications] ✅ Simple import notification sent successfully
```

### Bekannte Issues

| Issue | Ursache | Lösung |
|-------|---------|--------|
| Keine Notification | Permission nicht erteilt | App-Settings → Notifications aktivieren |
| Kein Banner | Channel Importance zu niedrig | `importance: 5` verwenden |
| Notification erscheint nicht sofort | Android Doze Mode | Gerät wach halten oder `setTrigger` verwenden |
| Deep Link funktioniert nicht | `extra` Daten fehlen | `extra: { recipeId, type: 'recipe-import' }` sicherstellen |

---

## Zukünftige Erweiterungen

### Geplante Features

| Feature | Beschreibung | Priorität |
|---------|--------------|-----------|
| **iOS Support** | Local Notifications für iOS implementieren | Hoch |
| **Rich Notifications** | Bild des Rezepts in Notification anzeigen | Mittel |
| **Actions** | "Ansehen" und "Später" Buttons in Notification | Mittel |
| **Scheduled Notifications** | Erinnerung für geplante Rezepte | Niedrig |
| **Notification History** | Liste aller Import-Notifications in der App | Niedrig |

### Known Limitations

1. **iOS nicht implementiert**
   - Aktuell nur Android Support
   - iOS benötigt zusätzliche Konfiguration (APNS)

2. **Keine Offline-Queue**
   - Notifications werden nur bei aktiver Netzwerkverbindung gesendet

3. **Keine Gruppierung**
   - Mehrere Imports zeigen separate Notifications
   - Könnte mit `group` und `groupSummary` verbessert werden

4. **Keine Persistenz**
   - Toast-State geht bei App-Neustart verloren
   - Könnte mit AsyncStorage gelöst werden

### Verbesserungsvorschläge

```typescript
// 1. Rich Notification mit Bild
const notification = {
  id: Date.now(),
  title: '✅ Rezept importiert',
  body: recipeName,
  largeIcon: recipeImageUrl, // Rezept-Bild
  attachment: recipeImageUrl, // iOS
};

// 2. Notification Actions
const notification = {
  // ...
  actions: [
    { id: 'view', title: 'Ansehen' },
    { id: 'later', title: 'Später' },
  ],
};

// 3. Gruppierung
const notification = {
  // ...
  group: 'recipe-imports',
  groupSummary: true,
};
```

---

## Referenzen

- [Capacitor Local Notifications](https://capacitorjs.com/docs/apis/local-notifications)
- [Android Notification Channels](https://developer.android.com/develop/ui/views/notifications/channels)
- [Android 13+ Notification Permissions](https://developer.android.com/develop/ui/views/notifications/notification-permission)

---

*Zuletzt aktualisiert: Februar 2026*
