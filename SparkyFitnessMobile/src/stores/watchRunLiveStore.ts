import { useEffect, useState } from 'react';
import { create } from 'zustand';
import type { WatchRunLivePayload } from '../../modules/watch-connectivity';

/**
 * A run on the watch that has gone quiet this long is treated as over for the
 * live view (the watch left Bluetooth range, or the app was closed there). The
 * run itself is unaffected: it reaches the diary when it finishes.
 */
export const WATCH_RUN_LIVE_MAX_AGE_MS = 20_000;

/** What the watch last said about the run it is recording, as it arrived. */
export interface WatchRunLive {
  runId: string;
  kind: 'run' | 'walk';
  place: 'indoor' | 'outdoor';
  status: 'running' | 'paused';
  autoPaused: boolean;
  /** Active seconds when the watch sent it. */
  elapsed: number;
  distanceMeters: number;
  heartRate: number | null;
  energyKcal: number;
  lapCount: number;
  stepLabel: string | null;
  /** Seconds left in the step when the watch sent it. */
  stepRemaining: number | null;
  nextLabel: string | null;
  /** When the watch sent it, epoch ms (the watch's clock). */
  sentAt: number;
  /** When this phone received it, epoch ms. */
  receivedAt: number;
}

interface WatchRunLiveState {
  run: WatchRunLive | null;
  /**
   * Takes a live message. `ended` clears the run; a message older than the
   * one held for the same run is ignored (messages can arrive out of order).
   */
  receive: (payload: WatchRunLivePayload, receivedAt?: number) => void;
  clear: () => void;
}

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** In memory only: a live view of something happening right now. */
export const useWatchRunLiveStore = create<WatchRunLiveState>((set) => ({
  run: null,
  receive: (payload, receivedAt = Date.now()) =>
    set((state) => {
      if (payload.status === 'ended') {
        return state.run == null || state.run.runId === payload.runId
          ? { run: null }
          : state;
      }
      if (
        !payload.runId ||
        (payload.status !== 'running' && payload.status !== 'paused') ||
        (payload.kind !== 'run' && payload.kind !== 'walk') ||
        (payload.place !== 'indoor' && payload.place !== 'outdoor') ||
        !finite(payload.elapsed) ||
        !finite(payload.distanceMeters)
      ) {
        return state;
      }
      if (
        state.run?.runId === payload.runId &&
        finite(payload.sentAt) &&
        payload.sentAt < state.run.sentAt
      ) {
        return state;
      }
      return {
        run: {
          runId: payload.runId,
          kind: payload.kind,
          place: payload.place,
          status: payload.status,
          autoPaused: Boolean(payload.autoPaused),
          elapsed: Math.max(0, payload.elapsed),
          distanceMeters: Math.max(0, payload.distanceMeters),
          heartRate:
            finite(payload.heartRate) && payload.heartRate > 0
              ? payload.heartRate
              : null,
          energyKcal: finite(payload.energyKcal) ? payload.energyKcal : 0,
          lapCount: finite(payload.lapCount) ? payload.lapCount : 0,
          stepLabel: payload.stepLabel ?? null,
          stepRemaining: finite(payload.stepRemaining)
            ? payload.stepRemaining
            : null,
          nextLabel: payload.nextLabel ?? null,
          sentAt: finite(payload.sentAt) ? payload.sentAt : receivedAt,
          receivedAt,
        },
      };
    }),
  clear: () => set({ run: null }),
}));

/** The clock and step countdown now, counted on from when the message came. */
export interface WatchRunNow extends WatchRunLive {
  elapsedNow: number;
  stepRemainingNow: number | null;
}

/**
 * The run the watch is recording, with its clock moved on locally between
 * messages (only while it is running), or null when there is none or the
 * watch has gone quiet. Re-renders once a second while a run shows.
 */
export function useWatchRunLive(): WatchRunNow | null {
  const run = useWatchRunLiveStore((s) => s.run);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!run) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [run]);

  if (!run) return null;
  const age = Math.max(0, now - run.receivedAt);
  if (age > WATCH_RUN_LIVE_MAX_AGE_MS) return null;
  const sinceSeconds = run.status === 'running' ? age / 1000 : 0;
  return {
    ...run,
    elapsedNow: run.elapsed + sinceSeconds,
    stepRemainingNow:
      run.stepRemaining == null
        ? null
        : Math.max(0, run.stepRemaining - sinceSeconds),
  };
}

/** Whether a live run is showing, without re-rendering every second. */
export function useHasWatchRunLive(): boolean {
  return useWatchRunLiveStore((s) => s.run != null);
}
