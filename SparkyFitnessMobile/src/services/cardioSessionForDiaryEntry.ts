import type {
  ExerciseActivityQueryItem,
  IndividualSessionResponse,
} from '@workspace/shared';
import { queryClient } from '../hooks/queryClient';
import { cardioSessionDetailQueryKey } from '../hooks/queryKeys';
import { cardioSessionFromDiaryEntry } from '../utils/cardioSession';
import { fetchWorkoutGpsPoints } from './api/exerciseStatsApi';

/**
 * What a diary tap on an activity opens: the cardio stats screen with its route
 * and heart rate, or null for the basic activity screen.
 *
 * A synced workout gets the stats screen straight away. An entry made in the
 * app gets it only when it has a stored route, because that is what a GPS
 * recording is: it is saved as an ordinary in-app entry, and nothing on the
 * diary row says it has a route, so the route is asked for. A failed or empty
 * lookup falls back to the basic screen, so a tap never gets stuck.
 */
export async function cardioSessionForDiaryEntry(
  session: IndividualSessionResponse,
  distanceUnit: 'km' | 'miles'
): Promise<ExerciseActivityQueryItem | null> {
  const synced = cardioSessionFromDiaryEntry(session, distanceUnit);
  if (synced) return synced;

  const candidate = cardioSessionFromDiaryEntry(session, distanceUnit, {
    allowInApp: true,
  });
  if (!candidate) return null;
  try {
    // Same key the stats screen reads its route with, so opening it is instant.
    const route = await queryClient.fetchQuery({
      queryKey: cardioSessionDetailQueryKey('gps', session.id),
      queryFn: () => fetchWorkoutGpsPoints(session.id),
      staleTime: 60_000,
    });
    if (!route?.points?.length) return null;
  } catch {
    return null;
  }
  return { ...candidate, hasGpsTrack: true };
}
