import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  __resetMealReminderStateForTests,
  cancelMealReminders,
  reconcileMealReminders,
} from '../../src/hooks/useMealReminder';
import {
  cancelScheduledNotification,
  scheduleMealReminderNotifications,
} from '../../src/services/notifications';

jest.mock('../../src/localization', () => ({ useAppLocale: () => 'en' }));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/services/notifications', () => ({
  scheduleMealReminderNotifications: jest.fn(),
  cancelScheduledNotification: jest.fn().mockResolvedValue(undefined),
}));

const mockSchedule = scheduleMealReminderNotifications as jest.Mock;
const mockCancel = cancelScheduledNotification as jest.Mock;

const baseInput = {
  today: '2026-10-31',
  reminders: [
    { mealTypeId: 'breakfast', time: '08:00' },
    { mealTypeId: 'lunch', time: '12:30' },
  ],
  loggedMealTypeIds: [] as string[],
  mealNames: { breakfast: 'Breakfast', lunch: 'Lunch' },
};

describe('reconcileMealReminders', () => {
  const now = new Date(2026, 9, 31, 7, 0);

  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    __resetMealReminderStateForTests();
    mockSchedule.mockResolvedValue(['id-1', 'id-2']);
  });

  it('schedules today and the look-ahead days with display names', async () => {
    await reconcileMealReminders(baseInput, now);
    const entries = mockSchedule.mock.calls[0][0] as {
      mealTypeId: string;
      mealName: string;
    }[];
    expect(entries.length).toBe(6);
    expect(entries[0]).toMatchObject({
      mealTypeId: 'breakfast',
      mealName: 'Breakfast',
    });
  });

  it('leaves a logged meal out of today only', async () => {
    await reconcileMealReminders(
      { ...baseInput, loggedMealTypeIds: ['breakfast'] },
      now
    );
    const entries = mockSchedule.mock.calls[0][0] as { mealTypeId: string }[];
    expect(entries.filter((e) => e.mealTypeId === 'breakfast')).toHaveLength(2);
  });

  it('does nothing for an unchanged input', async () => {
    await reconcileMealReminders(baseInput, now);
    await reconcileMealReminders(baseInput, now);
    expect(mockSchedule).toHaveBeenCalledTimes(1);
  });

  it('cancels the previous chain before rescheduling on a change', async () => {
    await reconcileMealReminders(baseInput, now);
    await reconcileMealReminders(
      { ...baseInput, loggedMealTypeIds: ['breakfast'] },
      now
    );
    expect(mockCancel).toHaveBeenCalledWith('id-1');
    expect(mockCancel).toHaveBeenCalledWith('id-2');
    expect(mockSchedule).toHaveBeenCalledTimes(2);
  });

  it('does not persist an empty result, so the next pass retries', async () => {
    mockSchedule.mockResolvedValueOnce([]);
    await reconcileMealReminders(baseInput, now);
    await reconcileMealReminders(baseInput, now);
    expect(mockSchedule).toHaveBeenCalledTimes(2);
  });

  it('cancelMealReminders cancels and forgets the chain', async () => {
    await reconcileMealReminders(baseInput, now);
    await cancelMealReminders();
    expect(mockCancel).toHaveBeenCalledWith('id-1');
    await reconcileMealReminders(baseInput, now);
    expect(mockSchedule).toHaveBeenCalledTimes(2);
  });
});
