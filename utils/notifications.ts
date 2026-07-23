import { LocalNotifications, LocalNotificationSchema } from '@capacitor/local-notifications';
import { logger } from './logger';
import { Capacitor } from '@capacitor/core';
import { capture } from '../services/analytics';

// Channel ID für Android 8+
const RECIPE_IMPORT_CHANNEL_ID = 'recipe-import';
const MAX_ANDROID_NOTIFICATION_ID = 2_147_483_647;

const notificationId = () => Date.now() % MAX_ANDROID_NOTIFICATION_ID;

// Track ob Channel bereits erstellt wurde (Performance-Optimierung)
let channelCreated = false;

export async function ensureNotificationPermission(
  source: 'profile' | 'import_complete',
): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return true;

  const permission = await LocalNotifications.checkPermissions();
  if (permission.display === 'granted') return true;
  if (permission.display === 'denied') return false;

  capture('notification_permission_requested', { source });
  const result = await LocalNotifications.requestPermissions();
  capture('notification_permission_result', { source, result: result.display });

  if (result.display === 'granted') {
    window.dispatchEvent(new Event('cookly:notification-permission-granted'));
    return true;
  }
  return false;
}

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
    logger.debug('Notifications', 'Not a native platform, skipping channel creation');
    return;
  }

  // Prüfen ob wir auf Android sind
  const platform = Capacitor.getPlatform();
  if (platform !== 'android') {
    logger.debug('Notifications', 'Not Android platform, skipping channel creation');
    return;
  }

  // Channel bereits erstellt? (Optimierung)
  if (channelCreated) {
    logger.debug('Notifications', 'Channel already created, skipping');
    return;
  }

  try {
    logger.debug('Notifications', 'Creating notification channel', RECIPE_IMPORT_CHANNEL_ID);
    
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
    logger.debug('Notifications', 'Channel created successfully', RECIPE_IMPORT_CHANNEL_ID);
    
    // Verifizieren: Channel auflisten
    const channels = await LocalNotifications.listChannels();
    logger.debug('Notifications', 'Available channels', channels);
  } catch (error) {
    logger.warn('Notifications', 'Failed to create channel', error);
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
  logger.debug('Notifications', 'showSimpleImportNotification called', { recipeId });
  
  if (!Capacitor.isNativePlatform()) {
    logger.debug('Notifications', 'Not a native platform, skipping notification');
    return;
  }

  const platform = Capacitor.getPlatform();
  logger.debug('Notifications', 'Platform', platform);
  
  if (platform !== 'android') {
    logger.debug('Notifications', 'Not Android, skipping notification');
    return;
  }

  try {
    // Schritt 1: Channel sicherstellen (für Android 8+)
    logger.debug('Notifications', 'Step 1: Creating channel');
    await createNotificationChannel();

    // Schritt 2: Berechtigungen prüfen (Android 13+ Requirement!)
    logger.debug('Notifications', 'Step 2: Checking permissions');
    if (!await ensureNotificationPermission('import_complete')) return;

    // Schritt 3: Notification erstellen
    const id = notificationId();
    logger.debug('Notifications', 'Step 3: Creating notification', { notificationId: id });
    
    const notification: LocalNotificationSchema = {
      id,
      title: 'Rezept erfolgreich importiert',
      body: 'Tippe hier, um das Rezept zu öffnen.',
      smallIcon: 'ic_stat_recipe_import',
      iconColor: '#f97316',
      channelId: RECIPE_IMPORT_CHANNEL_ID,
      // Extra Daten für Deep Linking
      extra: {
        recipeId: recipeId || null,
        type: 'recipe-import',
      },
    };

    // Schritt 4: Notification schedulen
    logger.debug('Notifications', 'Step 4: Scheduling notification', notification);
    const result = await LocalNotifications.schedule({
      notifications: [notification],
    });
    capture('local_notification_scheduled', { recipeId, success: true });
    logger.debug('Notifications', 'Schedule result', result);

    // Schritt 5: Verifizieren - Pending notifications abrufen
    const pending = await LocalNotifications.getPending();
    logger.debug('Notifications', 'Pending notifications', pending);

    logger.debug('Notifications', 'Simple import notification sent', { recipeId });
  } catch (error) {
    logger.warn('Notifications', 'Failed to show import notification (schedule)', error);
    // Detaillierte Fehlerinfo
    if (error instanceof Error) {
      logger.debug('Notifications', 'Error name', error.name);
      logger.debug('Notifications', 'Error message', error.message);
      logger.debug('Notifications', 'Error stack', error.stack);
    }
  }
}
