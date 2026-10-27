import AsyncStorage from '@react-native-async-storage/async-storage';

// The weeks of the gut-training build-up are counted from the day the person
// first saw it for this race. A start that moved with today would restart the
// build-up every day, so the day is kept; a different race starts it afresh.
const GUT_TRAINING_START_KEY = '@SparkyFitness/gutTrainingStart';

interface StoredStart {
  raceDay: string;
  startDay: string;
}

/** The day this race's build-up began, remembering today if it is new. */
export async function getGutTrainingStartDay(
  raceDay: string,
  today: string
): Promise<string> {
  try {
    const raw = await AsyncStorage.getItem(GUT_TRAINING_START_KEY);
    if (raw) {
      const stored = JSON.parse(raw) as Partial<StoredStart>;
      if (
        stored.raceDay === raceDay &&
        typeof stored.startDay === 'string' &&
        stored.startDay <= today
      ) {
        return stored.startDay;
      }
    }
  } catch {
    // an unreadable record just means starting from today
  }
  try {
    await AsyncStorage.setItem(
      GUT_TRAINING_START_KEY,
      JSON.stringify({ raceDay, startDay: today } satisfies StoredStart)
    );
  } catch {
    // the build-up still shows; it will be offered from today again next time
  }
  return today;
}
