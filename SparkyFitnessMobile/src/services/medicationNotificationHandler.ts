import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import {
  addNotificationResponseListener,
  dismissDeliveredNotification,
  MEDICATION_TAKEN_ACTION,
  MEDICATION_SKIP_ACTION,
} from './notifications';
import { createEntry, listEntries } from './api/medicationsApi';
import { queryClient } from '../hooks/queryClient';
import { invalidateMedicationEntryCaches } from '../hooks/invalidateMedicationEntryCaches';
import { addLog, _flushBuffer } from '../services/LogService';
import type { MedicationEntryStatus } from '@workspace/shared';
import { isDoseLogged } from '../utils/medications';

export const MEDICATION_NOTIFICATION_TASK_NAME =
  'MEDICATION_NOTIFICATION_ACTION_TASK';

let initialized = false;
const inFlightActions = new Map<string, Promise<void>>();

export function extractNotificationData(
  content: Notifications.NotificationContent | undefined
): Record<string, string | undefined> | undefined {
  if (!content) return undefined;
  if (
    content.data &&
    typeof content.data === 'object' &&
    Object.keys(content.data).length > 0
  ) {
    return content.data as Record<string, string | undefined>;
  }
  const rawContent = content as Notifications.NotificationContent & {
    dataString?: string;
  };
  const jsonSource =
    typeof content.data === 'string'
      ? content.data
      : typeof rawContent.dataString === 'string'
        ? rawContent.dataString
        : undefined;
  if (jsonSource) {
    try {
      const parsed = JSON.parse(jsonSource);
      if (parsed && typeof parsed === 'object') {
        return parsed as Record<string, string | undefined>;
      }
    } catch {
      // ignore malformed JSON
    }
  }
  if (content.data && typeof content.data === 'object') {
    return content.data as Record<string, string | undefined>;
  }
  return undefined;
}

function parseDosesFromData(
  data: Record<string, string | undefined> | undefined
): { medicationId: string; scheduleId: string | null }[] {
  if (!data) return [];
  if (data.doses) {
    try {
      const parsed =
        typeof data.doses === 'string' ? JSON.parse(data.doses) : data.doses;
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map(
          (d: { medicationId: string; scheduleId?: string | null }) => ({
            medicationId: d.medicationId,
            scheduleId: d.scheduleId ?? null,
          })
        );
      }
    } catch {
      // fallback below
    }
  }
  if (data.medicationId) {
    return [
      {
        medicationId: data.medicationId,
        scheduleId: data.scheduleId ?? null,
      },
    ];
  }
  return [];
}

function doesNotificationMatchAction(
  content: Notifications.NotificationContent | undefined,
  key: string | null,
  doses: { medicationId: string; scheduleId: string | null }[],
  entryDate: string
): boolean {
  const notifData = extractNotificationData(content);
  if (!notifData) return false;

  const notifBaseKey = notifData.baseKey ?? notifData.key ?? null;
  if (
    key &&
    (notifBaseKey === key ||
      notifData.key === key ||
      (typeof notifData.key === 'string' &&
        notifData.key.startsWith(`${key}_`)))
  ) {
    return true;
  }

  if (notifData.entryDate && notifData.entryDate !== entryDate) {
    return false;
  }

  const notifDoses = parseDosesFromData(notifData);
  if (notifDoses.length === 0 || doses.length === 0) return false;

  // Dismiss/cancel another notification if every dose it represents is covered
  // by the doses just logged/skipped in this action.
  return notifDoses.every((nd) =>
    doses.some(
      (d) =>
        d.medicationId === nd.medicationId &&
        (d.scheduleId ?? null) === (nd.scheduleId ?? null)
    )
  );
}

export async function processMedicationNotificationResponse(
  response: Notifications.NotificationResponse
): Promise<void> {
  const actionId = response.actionIdentifier;

  let status: MedicationEntryStatus | null = null;
  if (actionId === MEDICATION_TAKEN_ACTION) {
    status = 'taken';
  } else if (actionId === MEDICATION_SKIP_ACTION) {
    status = 'skipped';
  }

  if (!status) return;

  const content = response.notification?.request?.content;
  const data = extractNotificationData(content);
  const medicationId = data?.medicationId;
  const entryDate = data?.entryDate;

  if ((!medicationId && !data?.doses) || !entryDate) {
    addLog(
      '[MedicationNotificationAction] Missing required data in notification',
      'WARNING'
    );
    return;
  }

  const doses = parseDosesFromData(data);
  if (doses.length === 0) return;

  const notificationId = response.notification.request.identifier;
  const baseKey = data?.baseKey ?? data?.key ?? null;
  const dedupeKey = baseKey ?? notificationId;

  const existingPromise = inFlightActions.get(dedupeKey);
  if (existingPromise) {
    await existingPromise;
    return;
  }

  const actionPromise = handleNotificationAction(
    status,
    doses,
    entryDate,
    notificationId,
    baseKey
  ).finally(() => {
    inFlightActions.delete(dedupeKey);
  });

  inFlightActions.set(dedupeKey, actionPromise);
  await actionPromise;
}

TaskManager.defineTask<Notifications.NotificationTaskPayload>(
  MEDICATION_NOTIFICATION_TASK_NAME,
  async ({ data, error }) => {
    if (error) {
      addLog(
        `[MedicationNotificationAction] Background task error: ${error.message}`,
        'ERROR'
      );
      await _flushBuffer?.();
      return Notifications.BackgroundNotificationTaskResult.Failed;
    }

    if (data && typeof data === 'object' && 'actionIdentifier' in data) {
      await processMedicationNotificationResponse(
        data as unknown as Notifications.NotificationResponse
      );
    }

    await _flushBuffer?.();
    return Notifications.BackgroundNotificationTaskResult.NewData;
  }
);

export function initMedicationNotificationActions(): void {
  if (initialized) return;
  initialized = true;

  if (typeof Notifications.registerTaskAsync === 'function') {
    void Notifications.registerTaskAsync(
      MEDICATION_NOTIFICATION_TASK_NAME
    ).catch((err: unknown) => {
      addLog(
        `[MedicationNotificationAction] Failed to register background notification task: ${(err as Error).message}`,
        'WARNING'
      );
    });
  }

  addNotificationResponseListener((response) => {
    void processMedicationNotificationResponse(response);
  });
}

async function handleNotificationAction(
  status: MedicationEntryStatus,
  doses: { medicationId: string; scheduleId: string | null }[],
  entryDate: string,
  notificationId: string,
  key: string | null
): Promise<void> {
  try {
    // Dismiss the tapped notification and any other already-delivered repeat
    // notifications for the same dose(s) immediately so Android / Wear OS clears
    // all duplicate reminders from the tray right away.
    await dismissDeliveredNotification(notificationId);

    if (typeof Notifications.getPresentedNotificationsAsync === 'function') {
      const presented =
        await Notifications.getPresentedNotificationsAsync().catch(() => []);
      const siblingDelivered = presented.filter(
        (n) =>
          n.request.identifier !== notificationId &&
          doesNotificationMatchAction(n.request.content, key, doses, entryDate)
      );
      await Promise.all(
        siblingDelivered.map((n) =>
          dismissDeliveredNotification(n.request.identifier)
        )
      );
    }

    const allPending =
      await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
    const toCancel = allPending.filter((n) =>
      doesNotificationMatchAction(n.content, key, doses, entryDate)
    );
    await Promise.all(
      toCancel.map((n) =>
        Notifications.cancelScheduledNotificationAsync(n.identifier).catch(
          () => {}
        )
      )
    );

    const existing = await listEntries({
      fromDate: entryDate,
      toDate: entryDate,
      ...(doses.length === 1 ? { medicationId: doses[0].medicationId } : {}),
    });

    const unlogged = doses.filter(
      (d) => !isDoseLogged(existing, d.medicationId, d.scheduleId)
    );

    if (unlogged.length === 0) {
      invalidateMedicationEntryCaches(queryClient);
      return;
    }

    const takenAt = status === 'taken' ? new Date().toISOString() : undefined;

    await Promise.all(
      unlogged.map((d) =>
        createEntry({
          medication_id: d.medicationId,
          schedule_id: d.scheduleId,
          status,
          entry_date: entryDate,
          taken_at: takenAt,
        })
      )
    );

    // This path writes the entry through the API directly rather than through the
    // mutations, so nothing else marks the caches stale. With an infinite stale time the
    // app can resume onto an already-focused dashboard, skip the focus refetch, and show
    // calories that do not include the dose the user just marked taken from the reminder.
    invalidateMedicationEntryCaches(queryClient);

    addLog(
      `[MedicationNotificationAction] Logged ${unlogged.length} medication(s) as ${status}`,
      'DEBUG'
    );
  } catch (error) {
    addLog(
      `[MedicationNotificationAction] Failed to log medication: ${(error as Error).message}`,
      'ERROR'
    );
  }
}
