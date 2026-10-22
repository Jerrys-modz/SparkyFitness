import { create } from 'zustand';
import { readQueue, updateQueue } from '../services/offlineQueue/queueStorage';
import type { QueueItem, QueueState } from '../services/offlineQueue/types';
import { addLog } from '../services/LogService';

/**
 * In-memory mirror of the persisted offline queue plus the transient facts the
 * UI needs (connectivity, a drain in flight). The storage module stays the
 * source of truth: every change goes through `commit`, which persists first.
 */
interface OfflineQueueState extends QueueState {
  loaded: boolean;
  /** Server configuration the screens are showing queued items for. */
  activeConfigId: string | null;
  /** The device reports no usable connection. */
  deviceOffline: boolean;
  draining: boolean;
  /**
   * Items that were just sent. They stay visible in the overlay until the
   * refetch that brings the real entry in has settled, so the diary does not
   * blink between "queued" and "synced".
   */
  settling: QueueItem[];
  hydrate: (activeConfigId: string | null) => Promise<void>;
  setActiveConfigId: (activeConfigId: string | null) => void;
  setDeviceOffline: (offline: boolean) => void;
  setDraining: (draining: boolean) => void;
  commit: (change: (state: QueueState) => QueueState) => Promise<QueueState>;
  addSettling: (item: QueueItem) => void;
  removeSettling: (ids: readonly string[]) => void;
}

export const useOfflineQueueStore = create<OfflineQueueState>((set, get) => ({
  items: [],
  attention: [],
  accounts: {},
  loaded: false,
  activeConfigId: null,
  deviceOffline: false,
  draining: false,
  settling: [],
  hydrate: async (activeConfigId) => {
    try {
      const state = await readQueue();
      set({ ...state, activeConfigId, loaded: true });
    } catch (error) {
      // The queue could not be read at all. Leave it untouched on disk and
      // carry on with an empty view rather than blocking the app.
      addLog(
        `[Offline Queue] Starting without the stored queue: ${error}`,
        'ERROR'
      );
      set({ activeConfigId, loaded: true });
    }
  },
  setActiveConfigId: (activeConfigId) => set({ activeConfigId }),
  setDeviceOffline: (deviceOffline) => set({ deviceOffline }),
  setDraining: (draining) => set({ draining }),
  commit: async (change) => {
    const next = await updateQueue(change);
    set({
      items: next.items,
      attention: next.attention,
      accounts: next.accounts,
    });
    return next;
  },
  addSettling: (item) => set({ settling: [...get().settling, item] }),
  removeSettling: (ids) =>
    set({ settling: get().settling.filter((item) => !ids.includes(item.id)) }),
}));
