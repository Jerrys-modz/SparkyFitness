import { create } from 'zustand';
import type { WorkoutCelebration } from '../utils/workoutCelebration';

/**
 * A workout the wearer finished on the watch while the phone was somewhere
 * other than the Active Workout screen. It never reached the completion
 * screen, so its "Update preset?" check waits here until the app shows the
 * prompt. Kept in memory only: it is a one-time question, not data.
 */
export interface PendingPresetUpdate {
  celebration: WorkoutCelebration;
  /** The watch's id for the workout, to match its answer. */
  sessionId: string;
}

interface PendingPresetUpdateState {
  pending: PendingPresetUpdate | null;
  setPending: (pending: PendingPresetUpdate) => void;
  clearPending: () => void;
}

export const usePendingPresetUpdateStore = create<PendingPresetUpdateState>(
  (set) => ({
    pending: null,
    setPending: (pending) => set({ pending }),
    clearPending: () => set({ pending: null }),
  })
);
