/**
 * Push Notification Service
 *
 * Handles Firebase Cloud Messaging (FCM) integration:
 * - Permission requesting (Android 13+ POST_NOTIFICATIONS)
 * - FCM token registration
 * - Foreground message handling
 * - Notification channels for Android
 *
 * Dependencies: @react-native-firebase/messaging (must be installed)
 *
 * TODO: Install dependency:
 *   npm install @react-native-firebase/messaging
 */

import { Platform, PermissionsAndroid } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createTaggedLogger } from '../logging/logger';

const log = createTaggedLogger('Notifications');

const STORAGE_KEYS = {
  FCM_TOKEN: '@fcm_token',
  NOTIFICATION_PERMISSION: '@notification_permission',
  LAST_PROMPT_DATE: '@notification_last_prompt',
};

export type NotificationPermissionStatus = 'granted' | 'denied' | 'not_determined';

/**
 * Request notification permission (required for Android 13+ / API 33+)
 */
export async function requestNotificationPermission(): Promise<NotificationPermissionStatus> {
  try {
    if (Platform.OS === 'android' && Platform.Version >= 33) {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
      );
      const status = result === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : 'denied';
      await AsyncStorage.setItem(STORAGE_KEYS.NOTIFICATION_PERMISSION, status);
      log.info(`Notification permission: ${status}`);
      return status;
    }
    // Android < 13 doesn't require explicit notification permission
    return 'granted';
  } catch (error) {
    log.warn('Failed to request notification permission');
    return 'denied';
  }
}

/**
 * Check current notification permission status
 */
export async function getNotificationPermissionStatus(): Promise<NotificationPermissionStatus> {
  try {
    if (Platform.OS === 'android' && Platform.Version >= 33) {
      const result = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
      );
      return result ? 'granted' : 'denied';
    }
    return 'granted';
  } catch {
    return 'not_determined';
  }
}

/**
 * Get the cached FCM token
 */
export async function getCachedFCMToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(STORAGE_KEYS.FCM_TOKEN);
  } catch {
    return null;
  }
}

/**
 * Initialize FCM and register for push notifications.
 *
 * Call this after the user has granted notification permission.
 * Returns the FCM token (to send to your backend for targeted pushes).
 *
 * NOTE: Requires @react-native-firebase/messaging to be installed.
 * This function will gracefully fail if the package is not available.
 */
export async function initializeFCM(): Promise<string | null> {
  try {
    // Dynamic import to avoid crash if package not installed yet
    const messaging = require('@react-native-firebase/messaging').default;

    // Get FCM token
    const token = await messaging().getToken();
    if (token) {
      await AsyncStorage.setItem(STORAGE_KEYS.FCM_TOKEN, token);
      log.info('FCM token registered');
    }

    // Listen for token refresh
    messaging().onTokenRefresh(async (newToken: string) => {
      await AsyncStorage.setItem(STORAGE_KEYS.FCM_TOKEN, newToken);
      log.info('FCM token refreshed');
      // TODO: Send updated token to your backend
    });

    // Handle foreground messages
    messaging().onMessage(async (remoteMessage: any) => {
      log.info(`Foreground message: ${remoteMessage.notification?.title}`);
      // Foreground messages don't show a notification by default on Android
      // You can use a local notification library to show them if needed
    });

    return token;
  } catch (error) {
    log.warn('FCM initialization failed (package may not be installed)');
    return null;
  }
}

/**
 * Subscribe to a topic for broadcast notifications
 */
export async function subscribeToTopic(topic: string): Promise<void> {
  try {
    const messaging = require('@react-native-firebase/messaging').default;
    await messaging().subscribeToTopic(topic);
    log.info(`Subscribed to topic: ${topic}`);
  } catch {
    log.warn(`Failed to subscribe to topic: ${topic}`);
  }
}

/**
 * Unsubscribe from a topic
 */
export async function unsubscribeFromTopic(topic: string): Promise<void> {
  try {
    const messaging = require('@react-native-firebase/messaging').default;
    await messaging().unsubscribeFromTopic(topic);
    log.info(`Unsubscribed from topic: ${topic}`);
  } catch {
    log.warn(`Failed to unsubscribe from topic: ${topic}`);
  }
}

/**
 * Notification topics for the app
 */
export const NOTIFICATION_TOPICS = {
  /** All users — feature announcements */
  ALL_USERS: 'all_users',
  /** Free users — re-engagement, upgrade prompts */
  FREE_USERS: 'free_users',
  /** Pro users — exclusive updates */
  PRO_USERS: 'pro_users',
} as const;

/**
 * Update topic subscriptions based on user's subscription status
 */
export async function updateTopicSubscriptions(isPro: boolean): Promise<void> {
  await subscribeToTopic(NOTIFICATION_TOPICS.ALL_USERS);
  if (isPro) {
    await subscribeToTopic(NOTIFICATION_TOPICS.PRO_USERS);
    await unsubscribeFromTopic(NOTIFICATION_TOPICS.FREE_USERS);
  } else {
    await subscribeToTopic(NOTIFICATION_TOPICS.FREE_USERS);
    await unsubscribeFromTopic(NOTIFICATION_TOPICS.PRO_USERS);
  }
}

/**
 * Check if we should prompt the user for notification permission.
 * Only prompt once per 30 days if they haven't granted yet.
 */
export async function shouldPromptForNotifications(): Promise<boolean> {
  try {
    const status = await getNotificationPermissionStatus();
    if (status === 'granted') return false;

    const lastPrompt = await AsyncStorage.getItem(STORAGE_KEYS.LAST_PROMPT_DATE);
    if (!lastPrompt) return true;

    const daysSincePrompt = (Date.now() - new Date(lastPrompt).getTime()) / (1000 * 60 * 60 * 24);
    return daysSincePrompt >= 30;
  } catch {
    return false;
  }
}

/**
 * Record that we prompted the user for notifications
 */
export async function recordNotificationPrompt(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEYS.LAST_PROMPT_DATE, new Date().toISOString());
  } catch {}
}
