import type { CreateFoodEntryPayload } from '../api/foodEntriesApi';
import type { UpsertCheckInParams } from '../api/measurementsApi';
import type { FoodEntry } from '../../types/foodEntries';

interface QueueItemBase {
  /** Also the idempotency key sent as `client_id`. */
  id: string;
  /** Server configuration the write was made against. */
  configId: string;
  /** Server user id the write belongs to; resolved lazily, null until then. */
  accountId: string | null;
  /** Calendar day (YYYY-MM-DD) the entry belongs to. */
  entryDate: string;
  createdAt: string;
  attempts: number;
  /** Epoch ms before which a drain without `force` leaves the item alone. */
  nextAttemptAt: number;
  lastError?: string;
}

export interface FoodEntryQueueItem extends QueueItemBase {
  kind: 'food_entry';
  payload: CreateFoodEntryPayload;
  /** What the diary shows while the entry waits. */
  preview: FoodEntry;
}

export interface WaterQueueItem extends QueueItemBase {
  kind: 'water';
  /** One item is one "+" press on this container. */
  payload: { containerId: number };
  /** Millilitres the press adds, or null when only the server can tell. */
  previewMl: number | null;
}

export interface CheckInQueueItem extends QueueItemBase {
  kind: 'check_in';
  payload: UpsertCheckInParams;
}

export type QueueItem = FoodEntryQueueItem | WaterQueueItem | CheckInQueueItem;

export type QueueItemKind = QueueItem['kind'];

export type AttentionReason = 'rejected' | 'account_mismatch' | 'invalid';

export type AttentionItem = QueueItem & {
  reason: AttentionReason;
  message: string;
  movedAt: string;
};

export interface QueueState {
  items: QueueItem[];
  attention: AttentionItem[];
  /** Server user id last seen signed in, per server configuration id. */
  accounts: Record<string, string>;
}
