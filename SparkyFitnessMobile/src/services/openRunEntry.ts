import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { fetchExerciseEntry } from './api/exerciseStatsApi';
import { cardioSessionFromDiaryEntry } from '../utils/cardioSession';
import type { RootStackParamList } from '../types/navigation';
import type { IndividualSessionResponse } from '@workspace/shared';

/**
 * Opens a diary run or walk: the cardio session screen when the app can show
 * it, otherwise the plain activity detail. Rejects when the entry cannot be
 * loaded (deleted, offline), so the caller says so.
 */
export async function openRunEntry(
  navigation: NativeStackNavigationProp<RootStackParamList>,
  entryId: string,
  distanceUnit: 'km' | 'miles'
): Promise<void> {
  const entry = await fetchExerciseEntry(entryId);
  const session = {
    ...entry,
    type: 'individual',
    name: entry.exercise_snapshot?.name ?? null,
  } as IndividualSessionResponse;
  const cardio = cardioSessionFromDiaryEntry(session, distanceUnit, {
    allowInApp: true,
  });
  if (cardio) {
    navigation.navigate('CardioSession', {
      session: cardio,
      distanceUnit,
      diaryEntry: session,
    });
  } else {
    navigation.navigate('ActivityDetail', { session });
  }
}
