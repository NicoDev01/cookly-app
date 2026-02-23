import { LocalNotifications, LocalNotificationSchema } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';

// Channel ID für Android 8+
const RECIPE_IMPORT_CHANNEL_ID = 'recipe-import';

// Track ob Channel bereits erstellt wurde (Performance-Optimierung)
let channelCreated = false;

/**
 * Erstellt den Notification Channel für Android 8+ (Oreo und höher).
 * Ab Android 8.0 (API 26) müssen Notifications einem Channel zugeordnet werden.
 * 
 * WICHTIG: Channel muss VOR der ersten Notification erstellt werden!
 * 
 * Based on Context7 MCP research:
 * - importance: 5 = IMPORTANCE_HIGH (zeigt Banner)
 * - visibility: 1 = PUBLIC (auf Lockscreen sichtbar)
 */
export async function createNotificationChannel(): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    console.log('[Notifications] Not a native platform, skipping channel creation');
    return;
  }

  // Prüfen ob wir auf Android sind
  const platform = Capacitor.getPlatform();
  if (platform !== 'android') {
    console.log('[Notifications] Not Android platform, skipping channel creation');
    return;
  }

  // Channel bereits erstellt? (Optimierung)
  if (channelCreated) {
    console.log('[Notifications] Channel already created, skipping');
    return;
  }

  try {
    console.log('[Notifications] Creating notification channel:', RECIPE_IMPORT_CHANNEL_ID);
    
    // Notification Channel erstellen mit IMPORTANCE_HIGH für sichtbare Banner
    await LocalNotifications.createChannel({
      id: RECIPE_IMPORT_CHANNEL_ID,
      name: 'Rezept Import',
      description: 'Benachrichtigungen für erfolgreiche Rezept-Imports',
      importance: 5, // IMPORTANCE_HIGH - zeigt Banner und Sound
      visibility: 1, // PUBLIC - auf Lockscreen sichtbar
      sound: 'default',
      vibration: true,
      lights: true,
      lightColor: '#22c55e', // Grün für Erfolg
    });
    
    channelCreated = true;
    console.log('[Notifications] ✅ Channel created successfully:', RECIPE_IMPORT_CHANNEL_ID);
    
    // Verifizieren: Channel auflisten
    const channels = await LocalNotifications.listChannels();
    console.log('[Notifications] Available channels:', channels);
  } catch (error) {
    console.error('[Notifications] ❌ Failed to create channel:', error);
  }
}

/**
 * Zeigt eine Benachrichtigung an, wenn ein Rezept-Import abgeschlossen ist.
 * Funktioniert nur auf nativen Plattformen (Android/iOS).
 */
export async function showImportNotification(
  recipeName: string,
  success: boolean = true,
  recipeId?: string
): Promise<void> {
  // Nur auf nativen Plattformen ausführen (nicht im Web)
  if (!Capacitor.isNativePlatform()) {
    return;
  }

  try {
    // Channel sicherstellen (für Android 8+)
    await createNotificationChannel();

    // Berechtigungen prüfen und ggf. anfragen
    const permissionStatus = await LocalNotifications.checkPermissions();
    
    if (permissionStatus.display === 'prompt') {
      const requestResult = await LocalNotifications.requestPermissions();
      if (requestResult.display !== 'granted') {
        console.log('Notification permission denied');
        return;
      }
    } else if (permissionStatus.display === 'denied') {
      console.log('Notification permission permanently denied');
      return;
    }

    // Notification mit Channel ID und Deep Link Daten
    const notification: LocalNotificationSchema = {
      id: Date.now(),
      title: success ? '✅ Rezept importiert' : '❌ Import fehlgeschlagen',
      body: success
        ? `Dein Rezept "${recipeName}" wurde erfolgreich importiert.`
        : `Der Import von "${recipeName}" ist fehlgeschlagen.`,
      smallIcon: 'ic_launcher',
      largeIcon: 'ic_launcher',
      channelId: RECIPE_IMPORT_CHANNEL_ID,
      // Extra Daten für Deep Linking
      extra: {
        recipeId: recipeId || null,
        type: 'recipe-import',
      },
    };

    await LocalNotifications.schedule({
      notifications: [notification],
    });

    console.log('[Notifications] Import notification sent:', recipeName, 'recipeId:', recipeId);
  } catch (error) {
    // Silent fail - App sollte nicht crashen wenn Notification fehlschlägt
    console.error('[Notifications] Failed to show import notification:', error);
  }
}

/**
 * Zeigt eine einfache Benachrichtigung an (für erfolgreiche Imports ohne Rezeptnamen)
 * @param recipeId - Optional: ID des importierten Rezepts für Deep Linking
 * 
 * Based on Context7 MCP research:
 * - Android 13+ requires runtime permission check
 * - Channel must be created BEFORE scheduling
 * - schedule() takes an array of notifications
 */
export async function showSimpleImportNotification(recipeId?: string): Promise<void> {
  console.log('[Notifications] showSimpleImportNotification called, recipeId:', recipeId);
  
  if (!Capacitor.isNativePlatform()) {
    console.log('[Notifications] Not a native platform, skipping notification');
    return;
  }

  const platform = Capacitor.getPlatform();
  console.log('[Notifications] Platform:', platform);
  
  if (platform !== 'android') {
    console.log('[Notifications] Not Android, skipping notification');
    return;
  }

  try {
    // Schritt 1: Channel sicherstellen (für Android 8+)
    console.log('[Notifications] Step 1: Creating channel...');
    await createNotificationChannel();

    // Schritt 2: Berechtigungen prüfen (Android 13+ Requirement!)
    console.log('[Notifications] Step 2: Checking permissions...');
    const permissionStatus = await LocalNotifications.checkPermissions();
    console.log('[Notifications] Permission status:', permissionStatus);
    
    if (permissionStatus.display === 'prompt') {
      console.log('[Notifications] Requesting permissions...');
      const requestResult = await LocalNotifications.requestPermissions();
      console.log('[Notifications] Permission request result:', requestResult);
      if (requestResult.display !== 'granted') {
        console.log('[Notifications] ❌ Permission denied');
        return;
      }
    } else if (permissionStatus.display === 'denied') {
      console.log('[Notifications] ❌ Permission permanently denied');
      return;
    }

    // Schritt 3: Notification erstellen
    const notificationId = Date.now();
    console.log('[Notifications] Step 3: Creating notification with id:', notificationId);
    
    const notification: LocalNotificationSchema = {
      id: notificationId,
      title: '✅ Rezept importiert',
      body: 'Dein Rezept wurde erfolgreich importiert.',
      smallIcon: 'ic_launcher',
      largeIcon: 'ic_launcher',
      channelId: RECIPE_IMPORT_CHANNEL_ID,
      // Extra Daten für Deep Linking
      extra: {
        recipeId: recipeId || null,
        type: 'recipe-import',
      },
    };

    // Schritt 4: Notification schedulen
    console.log('[Notifications] Step 4: Scheduling notification...', notification);
    const result = await LocalNotifications.schedule({
      notifications: [notification],
    });
    console.log('[Notifications] ✅ Schedule result:', result);

    // Schritt 5: Verifizieren - Pending notifications abrufen
    const pending = await LocalNotifications.getPending();
    console.log('[Notifications] Pending notifications:', pending);

    console.log('[Notifications] ✅ Simple import notification sent successfully, recipeId:', recipeId);
  } catch (error) {
    console.error('[Notifications] ❌ Failed to show import notification:', error);
    // Detaillierte Fehlerinfo
    if (error instanceof Error) {
      console.error('[Notifications] Error name:', error.name);
      console.error('[Notifications] Error message:', error.message);
      console.error('[Notifications] Error stack:', error.stack);
    }
  }
}
