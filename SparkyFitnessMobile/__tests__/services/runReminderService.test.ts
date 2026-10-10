import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getRunReminders,
  reconcileRunReminders,
  setRunReminders,
} from '../../src/services/runReminderService';
import { getProgramStatus } from '../../src/services/runProgramService';
import {
  cancelScheduledNotification,
  scheduleRunReminderNotifications,
} from '../../src/services/notifications';

jest.mock('../../src/services/runProgramService', () => ({
  getProgramStatus: jest.fn(),
}));
jest.mock('../../src/services/notifications', () => ({
  cancelScheduledNotification: jest.fn(() => Promise.resolve()),
  scheduleRunReminderNotifications: jest.fn(),
}));

const mockedSchedule = jest.mocked(scheduleRunReminderNotifications);
const mockedStatus = jest.mocked(getProgramStatus);
const underWay = () =>
  mockedStatus.mockResolvedValue({ finished: false } as never);

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  mockedStatus.mockResolvedValue(null);
  mockedSchedule.mockImplementation(async (days) => days.map((d) => `id-${d}`));
});

test('schedules nothing without a program', async () => {
  await setRunReminders({ days: [1, 3], hour: 7 });
  expect(mockedSchedule).not.toHaveBeenCalled();
  expect(await getRunReminders()).toEqual({ days: [1, 3], hour: 7 });
});

test('schedules the chosen days once a program is under way', async () => {
  await setRunReminders({ days: [5, 1], hour: 18 });
  underWay();
  await reconcileRunReminders();
  expect(mockedSchedule).toHaveBeenLastCalledWith([1, 5], 18);
});

test('replaces the earlier reminders when the choice changes', async () => {
  underWay();
  await setRunReminders({ days: [1], hour: 7 });
  await setRunReminders({ days: [2], hour: 12 });
  expect(cancelScheduledNotification).toHaveBeenCalledWith('id-1');
  expect(mockedSchedule).toHaveBeenLastCalledWith([2], 12);
});

test('clears them when no days are left', async () => {
  underWay();
  await setRunReminders({ days: [1], hour: 7 });
  mockedSchedule.mockClear();
  await setRunReminders({ days: [], hour: 7 });
  expect(mockedSchedule).not.toHaveBeenCalled();
  expect(cancelScheduledNotification).toHaveBeenCalledWith('id-1');
});

test('ignores stored junk', async () => {
  await AsyncStorage.setItem(
    '@SparkyFitness/runReminders',
    JSON.stringify({ days: [9, 'x', 2], hour: 99, ids: 'no' })
  );
  expect(await getRunReminders()).toEqual({ days: [2], hour: 23 });
});
