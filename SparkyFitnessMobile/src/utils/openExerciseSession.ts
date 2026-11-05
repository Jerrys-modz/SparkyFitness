import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { ExerciseSessionResponse } from '@workspace/shared';

import { useActiveWorkoutStore } from '../stores/activeWorkoutStore';
import type { RootStackParamList } from '../types/navigation';
import { cardioSessionFromDiaryEntry } from './cardioSession';

type OpenSessionNavigation = Pick<
  NativeStackNavigationProp<RootStackParamList>,
  'navigate'
>;

/**
 * Opens a logged session from a day's list, as the Diary and the Dashboard's Workouts
 * card both do: the live workout's own screen while it is still running, a workout's
 * detail, the cardio stats screen for a synced or in-app run, walk or ride, else the
 * activity editor.
 */
export function openExerciseSession(
  navigation: OpenSessionNavigation,
  session: ExerciseSessionResponse,
  distanceUnit: 'km' | 'miles'
): void {
  if (session.type === 'preset') {
    // The live workout's surface is the active screen; detail is
    // for reviewing past or planned sessions.
    if (useActiveWorkoutStore.getState().sessionId === session.id) {
      navigation.navigate('ActiveWorkout');
      return;
    }
    navigation.navigate('WorkoutDetail', { session });
    return;
  }
  const synced = cardioSessionFromDiaryEntry(session, distanceUnit);
  if (synced) {
    navigation.navigate('CardioSession', { session: synced, distanceUnit });
    return;
  }
  // A run, walk or ride logged in the app (a GPS recording or a watch run is saved as an
  // in-app entry) opens the stats screen too, with an Edit button that hands over to the
  // activity editor. Anything without a distance or heart rate has nothing for that
  // screen to show.
  const inApp =
    (session.distance ?? 0) > 0 || session.avg_heart_rate != null
      ? cardioSessionFromDiaryEntry(session, distanceUnit, { allowInApp: true })
      : null;
  if (!inApp) {
    navigation.navigate('ActivityDetail', { session });
    return;
  }
  navigation.navigate('CardioSession', {
    session: inApp,
    distanceUnit,
    diaryEntry: session,
  });
}
