import {
  bestEffortsFromSamples,
  classifyActivitySport,
  effortSamplesFromGpsTrack,
  GPS_EFFORT_OPTIONS,
  toPrSportGroup,
  type BestEffort,
  type BestEffortId,
  type GpsTrackPoint,
} from '@workspace/shared';

/**
 * The distances shown for a person's unit: the short one follows it (1 km or
 * 1 mile); the race distances are the same for everyone.
 */
export function bestEffortIdsForUnit(
  distanceUnit: 'km' | 'miles'
): BestEffortId[] {
  return [
    distanceUnit === 'miles' ? '1mi' : '1k',
    '5k',
    '10k',
    'half_marathon',
  ];
}

/**
 * The fastest stretches inside one recorded run, from its GPS track. A run with
 * no route (an indoor run) gets none: its distance series is a pedometer
 * estimate whose rows are stamped when a reading arrived, so a fastest mile
 * taken from it can come out faster than anything the runner did. Empty for a
 * run too short.
 */
export function runBestEfforts(route: readonly GpsTrackPoint[]): BestEffort[] {
  if (route.length === 0) return [];
  return bestEffortsFromSamples(
    effortSamplesFromGpsTrack(route),
    GPS_EFFORT_OPTIONS
  );
}

/** Best efforts only make sense for a run, not a ride or a walk. */
export function isRunSession(session: {
  exerciseName: string;
  category: string | null;
  notes: string | null;
}): boolean {
  return (
    toPrSportGroup(
      classifyActivitySport({
        exerciseName: session.exerciseName,
        category: session.category,
        notes: session.notes,
      }).sport
    ) === 'run'
  );
}
