import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { CoachMessage } from '@workspace/shared';
import i18n from '../localization/i18n';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import {
  coachMessageCoachName,
  coachMessageText,
} from '../utils/coachMessageText';
import { fetchCoachMessages } from './api/coachCheckinsApi';
import { addLog } from './LogService';
import { hasNotificationPermission, notificationCopy } from './notifications';

/**
 * Local notifications for coach messages (#2013). The app has no server push,
 * so a message written by the server's check-in reaches the phone the next
 * time the background sync runs, or when the app is opened.
 */
const COACH_MESSAGES_CHANNEL_ID = 'coach-messages';

// Only fresh messages are worth a notification; an old one is just shown on
// the Dashboard.
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
// How many ids to remember, so a message is announced once.
const REMEMBERED_IDS = 50;

/** The messages that have not been announced on this phone yet. */
export function coachMessagesToAnnounce(
  messages: readonly CoachMessage[],
  announcedIds: readonly string[],
  now: number
): CoachMessage[] {
  return messages.filter(
    (message) =>
      message.read_at === null &&
      !announcedIds.includes(message.id) &&
      now - Date.parse(message.created_at) <= MAX_AGE_MS
  );
}

async function ensureCoachMessagesChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(COACH_MESSAGES_CHANNEL_ID, {
    name: notificationCopy(
      'notifications.channels.coachMessages',
      'Coach messages'
    ),
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

/**
 * Fetches the coach messages and shows a notification for each new one. Never
 * asks for permission (it can run in the background) and never throws.
 */
export async function announceNewCoachMessages(): Promise<void> {
  try {
    const prefs = useAppPreferencesStore.getState();
    if (!prefs.notificationsEnabled || !prefs.coachMessageNotificationsEnabled)
      return;
    if (!(await hasNotificationPermission())) return;

    const fresh = coachMessagesToAnnounce(
      await fetchCoachMessages(),
      prefs.announcedCoachMessageIds,
      Date.now()
    );
    if (fresh.length === 0) return;

    await ensureCoachMessagesChannel();
    for (const message of fresh) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: coachMessageCoachName(message, i18n.t),
          body: coachMessageText(message, i18n.t),
        },
        trigger:
          Platform.OS === 'android'
            ? { channelId: COACH_MESSAGES_CHANNEL_ID }
            : null,
      });
    }
    prefs.setAnnouncedCoachMessageIds(
      [
        ...fresh.map((message) => message.id),
        ...prefs.announcedCoachMessageIds,
      ].slice(0, REMEMBERED_IDS)
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    addLog(`[Coach messages] Notification check failed: ${message}`, 'ERROR');
  }
}
