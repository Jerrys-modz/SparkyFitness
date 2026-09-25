import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WatchHeartRateSamplePayload } from '../../modules/watch-connectivity';

const STORAGE_KEY = 'sparky.watchTelemetryBuffer';

export interface WatchTelemetryAttribution {
  steps: { setId: string; exerciseEntryId: string }[];
  completedAtBySetId: Record<string, number>;
  startedAt: number | null;
  activeSetId: string | null;
}

/**
 * Heart rate and energy the watch reported for ONE live-workout session,
 * keyed by exercise_entries id.
 *
 * The samples are NOT cleared by a flush: every field the server derives
 * from a post (avg, max, calories, the zone rows it replaces) is computed
 * from the whole payload, so re-posting the accumulated series overwrites the
 * earlier, shorter one with a strictly better answer. Posting only the part
 * that arrived since would instead clobber an exercise's avg HR with its last
 * minute's.
 */
export interface WatchTelemetrySessionState {
  samples: Map<string, WatchHeartRateSamplePayload[]>;
  // Summed from the per-batch deltas the watch sends. Separate from the
  // samples because a batch can carry energy with no samples, or samples with
  // no energy — HealthKit permissions are granted per type.
  energy: Map<string, number>;
  // Largest duration the watch has reported for the exercise, in minutes.
  // The watch sends the cumulative window when the exercise is left.
  // Once the phone's completion timeline has disagreed with that, durations
  // come only from the timeline — a later batch must not put the watch's
  // larger number back.
  durations: Map<string, number>;
  durationFromTimeline: boolean;
  // `transferUserInfo` can redeliver, and energy is a delta, so applying a
  // batch twice would double calories.
  handledBatchClientIds: Set<string>;
  // Captured when the session goes live so a flush after the store is
  // cleared can still invalidate the diary for the right day.
  entryDate: string | null;
  // Holds something the server has not accepted yet.
  unposted: boolean;
  // When the phone stopped considering this session live; null while live.
  // Pruning treats null as still live, so a restored session that is not the
  // current workout has to set this or it stays in storage forever.
  endedAt: number | null;
  // Steps, completions and the active set, copied when the phone ends the
  // session. The watch's last batch arrives after the live store is cleared,
  // and that is the ordinary path for a workout finished on the phone.
  attribution: WatchTelemetryAttribution | null;
}

interface PersistedSession {
  samples: [string, WatchHeartRateSamplePayload[]][];
  energy: [string, number][];
  durations: [string, number][];
  durationFromTimeline: boolean;
  handledBatchClientIds: string[];
  entryDate: string | null;
  unposted: boolean;
  endedAt: number | null;
  attribution: WatchTelemetryAttribution | null;
}

function toPersisted(session: WatchTelemetrySessionState): PersistedSession {
  return {
    samples: [...session.samples.entries()],
    energy: [...session.energy.entries()],
    durations: [...session.durations.entries()],
    durationFromTimeline: session.durationFromTimeline,
    handledBatchClientIds: [...session.handledBatchClientIds],
    entryDate: session.entryDate,
    unposted: session.unposted,
    endedAt: session.endedAt,
    attribution: session.attribution,
  };
}

function fromPersisted(
  session: PersistedSession,
  create: (entryDate: string | null) => WatchTelemetrySessionState
): WatchTelemetrySessionState {
  const next = create(session.entryDate);
  next.samples = new Map(session.samples ?? []);
  next.energy = new Map(session.energy ?? []);
  next.durations = new Map(session.durations ?? []);
  next.durationFromTimeline = session.durationFromTimeline === true;
  next.handledBatchClientIds = new Set(session.handledBatchClientIds ?? []);
  next.unposted = session.unposted === true;
  next.endedAt = session.endedAt ?? null;
  next.attribution = session.attribution ?? null;
  return next;
}

export function serializeWatchTelemetry(
  sessions: Map<string, WatchTelemetrySessionState>
): string {
  const persisted: Record<string, PersistedSession> = {};
  for (const [sessionId, session] of sessions) {
    if (
      !session.unposted &&
      session.samples.size === 0 &&
      session.energy.size === 0 &&
      session.durations.size === 0
    ) {
      continue;
    }
    persisted[sessionId] = toPersisted(session);
  }
  return JSON.stringify(persisted);
}

export function deserializeWatchTelemetry(
  raw: string | null,
  create: (entryDate: string | null) => WatchTelemetrySessionState
): Map<string, WatchTelemetrySessionState> {
  const sessions = new Map<string, WatchTelemetrySessionState>();
  if (!raw) return sessions;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return sessions;
  }
  if (parsed == null || typeof parsed !== 'object') return sessions;
  for (const [sessionId, value] of Object.entries(
    parsed as Record<string, PersistedSession>
  )) {
    if (value == null || typeof value !== 'object') continue;
    sessions.set(sessionId, fromPersisted(value, create));
  }
  return sessions;
}

/**
 * Copies saved sessions into the live map. Returns true when an empty live
 * session gained samples the server has not accepted, so the caller should
 * flush. A session that already has data is left unposted as it is, so a
 * late read of storage cannot undo a flush that just succeeded.
 */
export function mergeWatchTelemetry(
  sessions: Map<string, WatchTelemetrySessionState>,
  saved: Map<string, WatchTelemetrySessionState>,
  create: (entryDate: string | null) => WatchTelemetrySessionState
): boolean {
  let shouldFlush = false;
  for (const [sessionId, incoming] of saved) {
    let target = sessions.get(sessionId);
    const created = target == null;
    if (!target) {
      target = create(incoming.entryDate);
      sessions.set(sessionId, target);
    }
    const empty =
      target.samples.size === 0 &&
      target.energy.size === 0 &&
      target.durations.size === 0;

    for (const [exerciseEntryId, samples] of incoming.samples) {
      const existing = target.samples.get(exerciseEntryId) ?? [];
      const seen = new Set(existing.map((sample) => sample.t));
      const added = samples.filter(
        (sample) => sample?.t && !seen.has(sample.t)
      );
      if (added.length > 0) {
        target.samples.set(exerciseEntryId, existing.concat(added));
      }
    }
    mergeEnergy(target, incoming);
    if (incoming.durationFromTimeline && !target.durationFromTimeline) {
      target.durationFromTimeline = true;
      target.durations = new Map(incoming.durations);
    } else if (!target.durationFromTimeline) {
      for (const [exerciseEntryId, minutes] of incoming.durations) {
        const previous = target.durations.get(exerciseEntryId) ?? 0;
        if (minutes > previous) target.durations.set(exerciseEntryId, minutes);
      }
    }
    for (const clientId of incoming.handledBatchClientIds) {
      target.handledBatchClientIds.add(clientId);
    }
    if (target.entryDate == null) target.entryDate = incoming.entryDate;
    if (target.endedAt == null) target.endedAt = incoming.endedAt;
    if (target.attribution == null) target.attribution = incoming.attribution;
    if (incoming.unposted && (created || empty)) {
      target.unposted = true;
      shouldFlush = true;
    }
  }
  return shouldFlush;
}

/**
 * Energy is a sum of per-batch deltas. `max` drops whichever side is smaller,
 * which is the batch that arrived after relaunch and before this read.
 * Adding both doubles calories when one side's batches are already in the
 * other total, so that case keeps the total that already includes both.
 */
function mergeEnergy(
  target: WatchTelemetrySessionState,
  incoming: WatchTelemetrySessionState
): void {
  const incomingHasIds = incoming.handledBatchClientIds.size > 0;
  const targetHasIds = target.handledBatchClientIds.size > 0;
  let incomingNovel = false;
  let targetNovel = false;
  if (incomingHasIds && targetHasIds) {
    for (const id of incoming.handledBatchClientIds) {
      if (!target.handledBatchClientIds.has(id)) incomingNovel = true;
    }
    for (const id of target.handledBatchClientIds) {
      if (!incoming.handledBatchClientIds.has(id)) targetNovel = true;
    }
    if (!incomingNovel && !targetNovel) {
      for (const [exerciseEntryId, kcal] of incoming.energy) {
        if ((target.energy.get(exerciseEntryId) ?? 0) === 0) {
          target.energy.set(exerciseEntryId, kcal);
        }
      }
      return;
    }
    // Saved total already includes the live batches, or the reverse.
    // Adding would count those batches twice.
    if (incomingNovel && !targetNovel) {
      for (const [exerciseEntryId, kcal] of incoming.energy) {
        target.energy.set(exerciseEntryId, kcal);
      }
      return;
    }
    if (!incomingNovel && targetNovel) return;
  }

  for (const [exerciseEntryId, kcal] of incoming.energy) {
    const previous = target.energy.get(exerciseEntryId) ?? 0;
    target.energy.set(exerciseEntryId, previous + kcal);
  }
}

export async function readWatchTelemetry(
  create: (entryDate: string | null) => WatchTelemetrySessionState
): Promise<Map<string, WatchTelemetrySessionState>> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  return deserializeWatchTelemetry(raw, create);
}

let writeChain: Promise<void> = Promise.resolve();

/** Resolves when every write started so far has finished. */
export function settleWatchTelemetryWrites(): Promise<void> {
  return writeChain;
}

export async function writeWatchTelemetry(
  sessions: Map<string, WatchTelemetrySessionState>
): Promise<void> {
  // Snapshot now, but persist in call order. Two flushes in flight used to
  // race on AsyncStorage, and the older unposted snapshot could land last.
  const serialized = serializeWatchTelemetry(sessions);
  const run = writeChain.then(async () => {
    if (serialized === '{}') {
      await AsyncStorage.removeItem(STORAGE_KEY);
      return;
    }
    await AsyncStorage.setItem(STORAGE_KEY, serialized);
  });
  writeChain = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}
