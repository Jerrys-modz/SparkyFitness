import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import {
  addNotificationResponseListener,
  dismissDeliveredNotification,
  MEDICATION_TAKEN_ACTION,
  MEDICATION_SKIP_ACTION,
} from './notifications';
import {
  createEntry,
  listEntries,
  listMedications,
} from './api/medicationsApi';
import { queryClient } from '../hooks/queryClient';
import { invalidateMedicationEntryCaches } from '../hooks/invalidateMedicationEntryCaches';
import { addLog, _flushBuffer } from '../services/LogService';
import type { MedicationEntryStatus } from '@workspace/shared';
import { isDoseLogged } from '../utils/medications';

export const MEDICATION_NOTIFICATION_TASK_NAME =
  'MEDICATION_NOTIFICATION_ACTION_TASK';
export const PENDING_MEDICATION_NOTIFICATION_ACTIONS_KEY =
  'pending_medication_notification_actions';

export interface PendingMedicationNotificationAction {
  key: string | null;
  notificationId: string;
  status: MedicationEntryStatus;
  doses: { medicationId: string; scheduleId: string | null }[];
  entryDate: string;
  takenAt?: string;
}

let initialized = false;
const inFlightActions = new Map<string, Promise<boolean>>();
let pendingActionsQueue: Promise<unknown> = Promise.resolve();

function withPendingActionsLock<T>(work: () => Promise<T>): Promise<T> {
  const next = pendingActionsQueue.then(work, work);
  pendingActionsQueue = next.catch(() => undefined);
  return next;
}

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

function actionDedupeId(action: {
  key: string | null;
  entryDate: string;
  doses: { medicationId: string; scheduleId: string | null }[];
}): string {
  if (action.key) return action.key;
  const doseIds = action.doses
    .map((d) => `${d.medicationId}:${d.scheduleId ?? ''}`)
    .sort()
    .join(',');
  return `${action.entryDate}_${doseIds}`;
}

async function readPendingActions(): Promise<
  PendingMedicationNotificationAction[]
> {
  try {
    const raw = await AsyncStorage.getItem(
      PENDING_MEDICATION_NOTIFICATION_ACTIONS_KEY
    );
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? (parsed as PendingMedicationNotificationAction[])
      : [];
  } catch {
    return [];
  }
}

async function writePendingActions(
  actions: PendingMedicationNotificationAction[]
): Promise<void> {
  try {
    if (actions.length === 0) {
      await AsyncStorage.removeItem(
        PENDING_MEDICATION_NOTIFICATION_ACTIONS_KEY
      );
    } else {
      await AsyncStorage.setItem(
        PENDING_MEDICATION_NOTIFICATION_ACTIONS_KEY,
        JSON.stringify(actions)
      );
    }
  } catch {
    // ignore storage errors
  }
}

async function enqueuePendingAction(
  record: PendingMedicationNotificationAction
): Promise<void> {
  await withPendingActionsLock(async () => {
    const existing = await readPendingActions();
    const id = actionDedupeId(record);
    const filtered = existing.filter((item) => actionDedupeId(item) !== id);
    filtered.push(record);
    await writePendingActions(filtered);
  });
}

async function removePendingAction(record: {
  key: string | null;
  entryDate: string;
  doses: { medicationId: string; scheduleId: string | null }[];
}): Promise<void> {
  await withPendingActionsLock(async () => {
    const existing = await readPendingActions();
    if (existing.length === 0) return;
    const id = actionDedupeId(record);
    const filtered = existing.filter((item) => actionDedupeId(item) !== id);
    if (filtered.length !== existing.length) {
      await writePendingActions(filtered);
    }
  });
}

export async function flushPendingMedicationNotificationActions(): Promise<boolean> {
  const pending = await readPendingActions();
  if (pending.length === 0) return false;

  // A queued action records only medication ids, never the account that queued
  // it, so it must not be replayed blindly: after an account switch those ids
  // belong to the account that is no longer signed in. Resolve the medications
  // the current account owns and drop any dose that is not among them.
  let ownedMedicationIds: Set<string>;
  try {
    ownedMedicationIds = new Set(
      (await listMedications()).map((medication) => medication.id)
    );
  } catch {
    // Ownership cannot be verified right now; keep the queue for a later run
    // rather than writing it into an account we cannot vouch for.
    return false;
  }

  const resolvedIds = new Set<string>();
  let anySucceeded = false;

  for (const record of pending) {
    const dedupeKey = actionDedupeId(record);
    const existingPromise = inFlightActions.get(dedupeKey);
    if (existingPromise) {
      await existingPromise;
      continue;
    }

    const replayPromise = (async (): Promise<boolean> => {
      try {
        const ownedDoses = record.doses.filter((d) =>
          ownedMedicationIds.has(d.medicationId)
        );
        if (ownedDoses.length === 0) {
          resolvedIds.add(dedupeKey);
          return true;
        }

        const existing = await listEntries({
          fromDate: record.entryDate,
          toDate: record.entryDate,
          ...(ownedDoses.length === 1
            ? { medicationId: ownedDoses[0].medicationId }
            : {}),
        });

        const unlogged = ownedDoses.filter(
          (d) => !isDoseLogged(existing, d.medicationId, d.scheduleId)
        );

        if (unlogged.length > 0) {
          const takenAt =
            record.status === 'taken'
              ? (record.takenAt ?? new Date().toISOString())
              : undefined;
          await Promise.all(
            unlogged.map((d) =>
              createEntry({
                medication_id: d.medicationId,
                schedule_id: d.scheduleId,
                status: record.status,
                entry_date: record.entryDate,
                taken_at: takenAt,
              })
            )
          );
        }

        await clearMatchingReminders(
          record.notificationId,
          record.key,
          ownedDoses,
          record.entryDate
        );
        resolvedIds.add(dedupeKey);
        anySucceeded = true;
        return true;
      } catch {
        return false;
      }
    })().finally(() => {
      inFlightActions.delete(dedupeKey);
    });

    inFlightActions.set(dedupeKey, replayPromise);
    await replayPromise;
  }

  if (resolvedIds.size > 0) {
    await withPendingActionsLock(async () => {
      const latest = await readPendingActions();
      await writePendingActions(
        latest.filter((item) => !resolvedIds.has(actionDedupeId(item)))
      );
    });
  }
  if (anySucceeded) {
    invalidateMedicationEntryCaches(queryClient);
  }
  return anySucceeded;
}

export async function processMedicationNotificationResponse(
  response: Notifications.NotificationResponse
): Promise<boolean> {
  const actionId = response.actionIdentifier;

  let status: MedicationEntryStatus | null = null;
  if (actionId === MEDICATION_TAKEN_ACTION) {
    status = 'taken';
  } else if (actionId === MEDICATION_SKIP_ACTION) {
    status = 'skipped';
  }

  if (!status) return true;

  const content = response.notification?.request?.content;
  const data = extractNotificationData(content);
  const medicationId = data?.medicationId;
  const entryDate = data?.entryDate;

  if ((!medicationId && !data?.doses) || !entryDate) {
    addLog(
      '[MedicationNotificationAction] Missing required data in notification',
      'WARNING'
    );
    return false;
  }

  const doses = parseDosesFromData(data);
  if (doses.length === 0) return false;

  const notificationId = response.notification.request.identifier;
  const baseKey = data?.baseKey ?? data?.key ?? null;
  const dedupeKey = actionDedupeId({ key: baseKey, entryDate, doses });

  const existingPromise = inFlightActions.get(dedupeKey);
  if (existingPromise) {
    return existingPromise;
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
  return actionPromise;
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
      const ok = await processMedicationNotificationResponse(
        data as unknown as Notifications.NotificationResponse
      );
      await _flushBuffer?.();
      return ok
        ? Notifications.BackgroundNotificationTaskResult.NewData
        : Notifications.BackgroundNotificationTaskResult.Failed;
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

async function clearMatchingReminders(
  notificationId: string,
  key: string | null,
  doses: { medicationId: string; scheduleId: string | null }[],
  entryDate: string
): Promise<void> {
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
}

async function handleNotificationAction(
  status: MedicationEntryStatus,
  doses: { medicationId: string; scheduleId: string | null }[],
  entryDate: string,
  notificationId: string,
  key: string | null
): Promise<boolean> {
  const takenAt = status === 'taken' ? new Date().toISOString() : undefined;
  try {
    // Dismiss the tapped notification immediately so Android / Wear OS clears
    // the interacted reminder right away. Sibling delivered and scheduled repeat
    // reminders are cleared only after the entry is confirmed or written.
    await dismissDeliveredNotification(notificationId);

    const existing = await listEntries({
      fromDate: entryDate,
      toDate: entryDate,
      ...(doses.length === 1 ? { medicationId: doses[0].medicationId } : {}),
    });

    const unlogged = doses.filter(
      (d) => !isDoseLogged(existing, d.medicationId, d.scheduleId)
    );

    if (unlogged.length === 0) {
      await removePendingAction({ key, entryDate, doses });
      await clearMatchingReminders(notificationId, key, doses, entryDate);
      invalidateMedicationEntryCaches(queryClient);
      return true;
    }

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

    await removePendingAction({ key, entryDate, doses });
    await clearMatchingReminders(notificationId, key, doses, entryDate);

    // This path writes the entry through the API directly rather than through the
    // mutations, so nothing else marks the caches stale. With an infinite stale time the
    // app can resume onto an already-focused dashboard, skip the focus refetch, and show
    // calories that do not include the dose the user just marked taken from the reminder.
    invalidateMedicationEntryCaches(queryClient);

    addLog(
      `[MedicationNotificationAction] Logged ${unlogged.length} medication(s) as ${status}`,
      'DEBUG'
    );
    return true;
  } catch (error) {
    await enqueuePendingAction({
      key,
      notificationId,
      status,
      doses,
      entryDate,
      takenAt,
    });
    addLog(
      `[MedicationNotificationAction] Failed to log medication: ${(error as Error).message}`,
      'ERROR'
    );
    return false;
  }
}
