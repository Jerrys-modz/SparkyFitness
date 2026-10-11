import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getRunSchedule,
  setRunSchedule,
} from '../../src/services/runProgramSchedule';
import { cancelScheduledNotification } from '../../src/services/notifications';

jest.mock('../../src/services/notifications', () => ({
  cancelScheduledNotification: jest.fn(() => Promise.resolve()),
}));

const KEY = '@SparkyFitness/runReminders';

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

test('starts with every day and no start day', async () => {
  expect(await getRunSchedule()).toEqual({ days: [], startDay: null });
});

test('saves the days and the start day separately', async () => {
  await setRunSchedule({ days: [5, 1, 1] });
  await setRunSchedule({ startDay: '2026-10-13' });
  expect(await getRunSchedule()).toEqual({
    days: [1, 5],
    startDay: '2026-10-13',
  });
  await setRunSchedule({ startDay: null });
  expect(await getRunSchedule()).toEqual({ days: [1, 5], startDay: null });
});

test('ignores stored values that are not valid', async () => {
  await AsyncStorage.setItem(
    KEY,
    JSON.stringify({ days: [1, 9, 'x', 3], startDay: 'tomorrow' })
  );
  expect(await getRunSchedule()).toEqual({ days: [1, 3], startDay: null });
});

test('keeps the days from the old reminders and stops their notifications', async () => {
  await AsyncStorage.setItem(
    KEY,
    JSON.stringify({ days: [2, 4], hour: 7, ids: ['a', 'b'] })
  );
  expect(await getRunSchedule()).toEqual({ days: [2, 4], startDay: null });
  expect(cancelScheduledNotification).toHaveBeenCalledWith('a');
  expect(cancelScheduledNotification).toHaveBeenCalledWith('b');
  const stored = JSON.parse((await AsyncStorage.getItem(KEY)) as string);
  expect(stored.ids).toBeUndefined();
});
