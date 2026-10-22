import type { routeActivitySchema } from '../schemas/database/Routes.zod.ts';
import type { z } from 'zod';
import {
  classifyActivitySport,
  type ActivitySportInput,
} from './activitySport.ts';

export type TrackActivity = z.infer<typeof routeActivitySchema>;
/**
 * `unknown` is a name that says nothing ("Evening activity"); `excluded` is
 * a sport that is never a GPS run, walk, hike or ride (a swim, a gym session).
 */
export type TrackActivityKind = TrackActivity | 'unknown' | 'excluded';

/**
 * Which of the four GPS activity kinds a diary entry is, from its name and
 * category. Segments and the heatmap only look at these.
 */
export function trackActivityKind(
  input: ActivitySportInput
): TrackActivityKind {
  switch (classifyActivitySport(input).sport) {
    case 'running':
      return 'run';
    case 'walking':
      return 'walk';
    case 'hiking':
      return 'hike';
    case 'cycling':
      return 'ride';
    case 'other':
      return 'unknown';
    default:
      return 'excluded';
  }
}

/**
 * A segment timed on foot is raced by any activity on foot, and a ride
 * segment by rides only: a walk over a running segment is a slow effort, a
 * bike over it is not an effort at all. An entry whose kind could not be told
 * ("Evening activity") is given the benefit of the doubt: its track still has
 * to pass the segment in the right direction at a believable speed.
 */
export function segmentAcceptsActivity(
  segmentActivity: TrackActivity,
  kind: TrackActivityKind
): boolean {
  if (kind === 'excluded') return false;
  if (kind === 'unknown') return true;
  if (segmentActivity === 'ride') return kind === 'ride';
  return kind !== 'ride';
}
