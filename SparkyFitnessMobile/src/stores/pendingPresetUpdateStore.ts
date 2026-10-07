import { create } from 'zustand';
import type { WorkoutCelebration } from '../utils/workoutCelebration';

/**
 * A workout the wearer finished on the watch while the phone was somewhere
 * other than the Active Workout screen. It never reached the completion
 * screen, so its "Update preset?" check waits here until the app shows the
 * prompt. Kept in memory only: it is a one-time question, not data.
 */
interface PendingPresetUpdateState {
  pending: WorkoutCelebration | null;
  setPending: (celebration: WorkoutCelebration) => void;
  clearPending: () => void;
}

export const usePendingPresetUpdateStore = create<PendingPresetUpdateState>(
  (set) => ({
    pending: null,
    setPending: (celebration) => set({ pending: celebration }),
    clearPending: () => set({ pending: null }),
  })
);
