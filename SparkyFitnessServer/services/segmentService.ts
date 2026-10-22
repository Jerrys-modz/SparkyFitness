import {
  annotateEfforts,
  bestSegmentPass,
  isSegmentPersonalBest,
  prepareSegment,
  routeBounds,
  segmentAcceptsActivity,
  sliceRouteByDistance,
  trackActivityKind,
  trackMayCrossSegment,
  type CreateSegmentBody,
  type EntrySegmentEffort,
  type SegmentEffort,
  type SegmentEffortsResponse,
  type SegmentSummary,
  type MatchSegmentResponse,
} from '@workspace/shared';
import { getRoute } from '../models/routeRepository.js';
import {
  clearEntryEfforts,
  createSegment,
  getEntryTrackFixes,
  getMatchableSegment,
  getSegmentRow,
  listEntryEfforts,
  listSegmentEfforts,
  listSegmentsToMatchForEntry,
  listUnmatchedCandidates,
  saveEfforts,
  type EffortWrite,
  type MatchableSegment,
} from '../models/segmentRepository.js';
import { log } from '../config/logging.js';
import { describeError } from '../utils/errors.js';

export class InvalidSegmentError extends Error {}
export class SegmentSourceNotFoundError extends Error {}

/** Activities read by one match call; the next call continues (`hasMore`). */
export const MATCH_BATCH = 100;
/** A match call stops starting new activities after this long. */
export const MATCH_BUDGET_MS = 8000;
/** Box margin when choosing candidates: the corridor plus GPS slack, in degrees. */
const CANDIDATE_MARGIN_DEG = 0.0006;
const TRACK_MARGIN_M = 60;

/** Turns a create request into the stored form: sliced, thinned and measured. */
export async function createSegmentFromBody(
  userId: string,
  body: CreateSegmentBody,
  authenticatedUserId?: string
): Promise<SegmentSummary> {
  let line: Array<{ lat: number; lon: number }>;
  let activity = 'activity' in body && body.activity ? body.activity : 'run';
  let sourceRouteId: string | null;
  let sourceExerciseEntryId: string | null = null;

  if (body.mode === 'route') {
    const route = await getRoute(userId, body.routeId, authenticatedUserId);
    if (!route) throw new SegmentSourceNotFoundError();
    const cut = sliceRouteByDistance(route.points, body.startM, body.endM);
    if (!cut) throw new InvalidSegmentError('That stretch is empty');
    line = cut;
    activity = body.activity ?? route.activity;
    sourceRouteId = route.id;
  } else {
    line = body.points;
    sourceRouteId = body.sourceRouteId ?? null;
    sourceExerciseEntryId = body.sourceExerciseEntryId ?? null;
  }

  const prepared = prepareSegment(line);
  if (!prepared) {
    throw new InvalidSegmentError(
      'A segment must be between 100 m and 100 km long'
    );
  }
  return createSegment(
    userId,
    {
      name: body.name ?? null,
      activity,
      lengthM: prepared.lengthM,
      points: prepared.points,
      bounds: prepared.bounds,
      sourceRouteId,
      sourceExerciseEntryId,
    },
    authenticatedUserId
  );
}

/**
 * Matches one segment against the person's recorded activities that came
 * near it and have no cached result yet, newest first. It reads at most
 * `MATCH_BATCH` activities and stops early past `MATCH_BUDGET_MS`; call again
 * while `hasMore`. Null when the segment is not theirs.
 */
export async function matchSegmentHistory(
  userId: string,
  segmentId: string,
  authenticatedUserId?: string,
  now: () => number = Date.now
): Promise<MatchSegmentResponse | null> {
  const segment = await getMatchableSegment(
    userId,
    segmentId,
    authenticatedUserId
  );
  if (!segment) return null;
  // One more than the batch: its presence is how we know to say `hasMore`.
  const pending = await listUnmatchedCandidates(
    userId,
    segment,
    MATCH_BATCH + 1,
    CANDIDATE_MARGIN_DEG,
    authenticatedUserId
  );
  const candidates = pending.slice(0, MATCH_BATCH);
  const startedAt = now();
  const writes: EffortWrite[] = [];
  let found = 0;
  let scanned = 0;
  for (const candidate of candidates) {
    if (scanned > 0 && now() - startedAt > MATCH_BUDGET_MS) break;
    scanned++;
    const kind = trackActivityKind({
      exerciseName: candidate.exerciseName,
      category: candidate.category,
      notes: candidate.notes,
    });
    if (!segmentAcceptsActivity(segment.activity, kind)) {
      writes.push({
        segmentId,
        exerciseEntryId: candidate.entryId,
        entryDate: candidate.entryDate,
        pass: null,
      });
      continue;
    }
    const track = await getEntryTrackFixes(
      userId,
      candidate.entryId,
      authenticatedUserId
    );
    if (!track) continue;
    const pass = matchTrack(segment, track.fixes);
    if (pass) found++;
    writes.push({
      segmentId,
      exerciseEntryId: candidate.entryId,
      entryDate: candidate.entryDate,
      pass,
    });
  }
  await saveEfforts(userId, writes, authenticatedUserId);
  const hasMore = pending.length > MATCH_BATCH || scanned < candidates.length;
  return { scanned, found, hasMore };
}

function matchTrack(
  segment: MatchableSegment,
  fixes: Parameters<typeof bestSegmentPass>[1]
): EffortWrite['pass'] {
  const box = routeBounds(fixes);
  if (!box || !trackMayCrossSegment(segment.bounds, box, TRACK_MARGIN_M)) {
    return null;
  }
  const pass = bestSegmentPass(
    { points: segment.points, lengthM: segment.lengthM },
    fixes
  );
  return pass
    ? {
        startedAtMs: pass.startMs,
        elapsedSeconds: pass.elapsedSeconds,
        avgSpeedMps: pass.avgSpeedMps,
      }
    : null;
}

/**
 * Matches one activity against every segment that has no cached result for
 * it. Returns how many passes were found.
 */
async function matchEntrySegments(
  userId: string,
  exerciseEntryId: string,
  authenticatedUserId?: string
): Promise<number> {
  const segments = await listSegmentsToMatchForEntry(
    userId,
    exerciseEntryId,
    authenticatedUserId
  );
  if (segments.length === 0) return 0;
  const track = await getEntryTrackFixes(
    userId,
    exerciseEntryId,
    authenticatedUserId
  );
  if (!track) return 0;
  const kind = trackActivityKind({
    exerciseName: track.exerciseName,
    category: track.category,
    notes: track.notes,
  });
  const writes: EffortWrite[] = segments.map((segment) => ({
    segmentId: segment.id,
    exerciseEntryId,
    entryDate: track.entryDate,
    pass: segmentAcceptsActivity(segment.activity, kind)
      ? matchTrack(segment, track.fixes)
      : null,
  }));
  await saveEfforts(userId, writes, authenticatedUserId);
  return writes.filter((w) => w.pass).length;
}

/**
 * Called after a GPS track is attached to an activity: the old results are
 * dropped and the new track is matched. Best effort; it never throws, so a
 * failure cannot undo or delay the save that triggered it.
 */
export async function rematchEntryAfterTrackAttach(
  userId: string,
  exerciseEntryId: string,
  authenticatedUserId?: string
): Promise<void> {
  try {
    await clearEntryEfforts(userId, exerciseEntryId, authenticatedUserId);
    await matchEntrySegments(userId, exerciseEntryId, authenticatedUserId);
  } catch (error) {
    log(
      'warn',
      `[Segments] Could not match activity ${exerciseEntryId}: ${describeError(error)}`
    );
  }
}

/** A segment with its efforts, newest first, best and records marked. */
export async function getSegmentWithEfforts(
  userId: string,
  segmentId: string,
  authenticatedUserId?: string
): Promise<SegmentEffortsResponse | null> {
  const found = await getSegmentRow(userId, segmentId, authenticatedUserId);
  if (!found) return null;
  const stored = await listSegmentEfforts(
    userId,
    segmentId,
    authenticatedUserId
  );
  const marks = annotateEfforts(stored);
  const efforts: SegmentEffort[] = stored
    .map((effort, index) => ({
      entryId: effort.entryId,
      date: effort.date,
      startedAt: new Date(effort.startedAtMs).toISOString(),
      elapsedSeconds: effort.elapsedSeconds,
      avgSpeedMps: effort.avgSpeedMps,
      isBest: marks[index]?.isBest ?? false,
      isPersonalRecord: marks[index]?.isPersonalRecord ?? false,
    }))
    .reverse();
  return { segment: found.summary, points: found.segment.points, efforts };
}

/**
 * The segments one activity ran, with the new-best verdict against the
 * person's other times. Segments not yet checked against this activity are
 * matched first, so the answer is right even when the background match
 * after the save has not finished.
 */
export async function getEntrySegmentEfforts(
  userId: string,
  exerciseEntryId: string,
  authenticatedUserId?: string
): Promise<EntrySegmentEffort[]> {
  try {
    await matchEntrySegments(userId, exerciseEntryId, authenticatedUserId);
  } catch (error) {
    log(
      'warn',
      `[Segments] Could not match activity ${exerciseEntryId}: ${describeError(error)}`
    );
  }
  const contexts = await listEntryEfforts(
    userId,
    exerciseEntryId,
    authenticatedUserId
  );
  return contexts.map(
    ({ effort, segmentName, segmentLengthM, otherElapsed }) => {
      const isNewPersonalBest = isSegmentPersonalBest(
        effort.elapsedSeconds,
        otherElapsed
      );
      const valid = otherElapsed.filter((n) => n > 0);
      return {
        segmentId: effort.segmentId,
        segmentName,
        segmentLengthM,
        entryId: effort.entryId,
        date: effort.date,
        startedAt: new Date(effort.startedAtMs).toISOString(),
        elapsedSeconds: effort.elapsedSeconds,
        avgSpeedMps: effort.avgSpeedMps,
        isBest: isNewPersonalBest,
        isPersonalRecord: isNewPersonalBest,
        isNewPersonalBest,
        previousBestSeconds:
          isNewPersonalBest && valid.length > 0 ? Math.min(...valid) : null,
      };
    }
  );
}
