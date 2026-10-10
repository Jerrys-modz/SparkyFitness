import { LogBox } from 'react-native';
import { queryClient } from './hooks/queryClient';
import { preferencesQueryKey } from './hooks/queryKeys';
import { useLiveHeartRateStore } from './stores/liveHeartRateStore';
import {
  seedForScreenshot,
  type RecordingSession,
} from './services/gpsRecordingService';
import type { RecordedPoint } from './utils/gpsRecording';

/**
 * CI screenshot job only (never imported unless EXPO_PUBLIC_SHOT is set when
 * the bundle is built). Walks the Record Activity screen through its states on
 * a timer so the job can photograph each one: setup, recording, paused,
 * finished. Phases start at STEP_MS * n after launch.
 */
export const SHOT = process.env.EXPO_PUBLIC_SHOT === '1';
const STEP_MS = 20_000;
const ELAPSED_MS = (24 * 60 + 18) * 1000;

function route(startedAt: number, upTo: number): RecordedPoint[] {
  const count = 160;
  const out: RecordedPoint[] = [];
  const total = Math.round(count * upTo);
  for (let i = 0; i < total; i++) {
    const a = (i / count) * Math.PI * 2 - Math.PI / 2;
    const wobble = 1 + 0.06 * Math.sin(i / 5);
    out.push({
      t: startedAt + Math.round((i / count) * ELAPSED_MS),
      lat: 40.7829 + 0.0072 * Math.sin(a) * wobble,
      lon: -73.9654 + 0.0094 * Math.cos(a) * wobble,
      alt: 40,
      hacc: 5,
      vacc: 5,
      speed: 3.5,
      course: null,
      seg: 0,
    });
  }
  return out;
}

export function startShotMode(): void {
  LogBox.ignoreAllLogs(true);
  queryClient.setQueryData(preferencesQueryKey, {
    default_distance_unit: 'km',
    default_weight_unit: 'kg',
  } as never);

  const phase = (status: RecordingSession['status'], upTo: number) => {
    const now = Date.now();
    const startedAt = now - ELAPSED_MS;
    seedForScreenshot(
      {
        id: 'shot',
        activity: 'run',
        status,
        startedAt,
        finishedAt: status === 'finished' ? now : null,
        pausedAt: status === 'paused' ? now : null,
        pausedMs: 0,
        seg: 0,
        savedEntryId: null,
      },
      route(startedAt, upTo)
    );
    useLiveHeartRateStore.getState().record({
      sessionId: 'shot',
      exerciseEntryId: 'shot',
      bpm: 148,
      at: now,
    });
  };

  setTimeout(() => phase('recording', 0.8), STEP_MS * 1);
  setTimeout(() => phase('paused', 0.85), STEP_MS * 2);
  setTimeout(() => phase('finished', 1), STEP_MS * 3);
}
