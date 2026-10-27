import AsyncStorage from '@react-native-async-storage/async-storage';
import { getGutTrainingStartDay } from '../../src/services/gutTrainingStart';

const KEY = '@SparkyFitness/gutTrainingStart';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('getGutTrainingStartDay', () => {
  it('starts from today the first time and remembers it', async () => {
    expect(await getGutTrainingStartDay('2027-01-05', '2026-10-27')).toBe(
      '2026-10-27'
    );
    expect(JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}')).toEqual({
      raceDay: '2027-01-05',
      startDay: '2026-10-27',
    });
  });

  it('keeps the same start on later days', async () => {
    await getGutTrainingStartDay('2027-01-05', '2026-10-27');
    expect(await getGutTrainingStartDay('2027-01-05', '2026-11-20')).toBe(
      '2026-10-27'
    );
  });

  it('starts afresh for a different race', async () => {
    await getGutTrainingStartDay('2027-01-05', '2026-10-27');
    expect(await getGutTrainingStartDay('2027-04-18', '2026-11-20')).toBe(
      '2026-11-20'
    );
  });

  it('starts from today when the stored day is in the future or unreadable', async () => {
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({ raceDay: '2027-01-05', startDay: '2026-12-01' })
    );
    expect(await getGutTrainingStartDay('2027-01-05', '2026-10-27')).toBe(
      '2026-10-27'
    );

    await AsyncStorage.setItem(KEY, 'not json');
    expect(await getGutTrainingStartDay('2027-01-05', '2026-11-01')).toBe(
      '2026-11-01'
    );
  });
});
