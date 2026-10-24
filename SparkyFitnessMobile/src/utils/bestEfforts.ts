import {
  bestEffortsFromSamples,
  classifyActivitySport,
  DISTANCE_SERIES_EFFORT_OPTIONS,
  effortSamplesFromDistanceSeries,
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
 * The fastest stretches inside one recorded run: from its GPS track, or from
 * the distance series when it has no route. Empty for a run too short.
 */
export function runBestEfforts(
  route: readonly GpsTrackPoint[],
  distanceSeries: readonly (readonly [number, number])[] | null
): BestEffort[] {
  if (route.length > 0) {
    return bestEffortsFromSamples(
      effortSamplesFromGpsTrack(route),
      GPS_EFFORT_OPTIONS
    );
  }
  if (distanceSeries && distanceSeries.length > 0) {
    return bestEffortsFromSamples(
      effortSamplesFromDistanceSeries(distanceSeries),
      DISTANCE_SERIES_EFFORT_OPTIONS
    );
  }
  return [];
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
