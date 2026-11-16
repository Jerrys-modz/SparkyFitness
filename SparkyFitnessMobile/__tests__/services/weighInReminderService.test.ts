import * as Notifications from 'expo-notifications';

import {
  cancelWeighInReminders,
  reconcileWeighInReminders,
  scheduleWeighInReminders,
} from '../../src/services/weighInReminderService';
import { hasNotificationPermission } from '../../src/services/notifications';
import {
  __resetAppPreferencesStoreForTests,
  useAppPreferencesStore,
} from '../../src/stores/appPreferencesStore';
import { getTodayDate } from '../../src/utils/dateUtils';

jest.mock('../../src/services/notifications', () => ({
  ensureWeighInChannel: jest.fn(async () => undefined),
  hasNotificationPermission: jest.fn(async () => true),
  notificationCopy: (_key: string, fallback: string) => fallback,
  WEIGH_IN_CHANNEL_ID: 'weigh-in',
}));

jest.mock('../../src/utils/dateUtils', () => ({
  ...jest.requireActual('../../src/utils/dateUtils'),
  getTodayDate: jest.fn(() => '2026-11-16'),
}));

const mockSchedule = Notifications.scheduleNotificationAsync as jest.Mock;
const mockCancel = Notifications.cancelScheduledNotificationAsync as jest.Mock;
const mockGetAllScheduled =
  Notifications.getAllScheduledNotificationsAsync as jest.Mock;
const mockGetPresented =
  Notifications.getPresentedNotificationsAsync as jest.Mock;
const mockDismiss = Notifications.dismissNotificationAsync as jest.Mock;
const mockHasPermission = hasNotificationPermission as jest.Mock;
const mockToday = getTodayDate as jest.Mock;

function triggers(): { type: string; weekday?: number; date?: Date }[] {
  return mockSchedule.mock.calls.map(([request]) => request.trigger);
}

function weeklyDays(): number[] {
  return triggers()
    .filter((t) => t.type === 'weekly')
    .map((t) => t.weekday as number);
}

describe('scheduleWeighInReminders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAllScheduled.mockResolvedValue([]);
  });

  it('schedules a repeating weekly reminder per day with neutral copy', async () => {
    const ids = await scheduleWeighInReminders({
      time: '07:30',
      weekdays: [1, 3],
      skipToday: false,
      today: '2026-11-16',
    });
    expect(ids).toHaveLength(2);
    const [first] = mockSchedule.mock.calls[0];
    expect(first.identifier).toBe('weigh_in_weekly_1');
    expect(first.content.title).toBe('Weigh-in');
    expect(first.content.data).toEqual({ kind: 'weigh-in' });
    // Expo weekdays count from 1 = Sunday: Monday is 2.
    expect(first.trigger).toEqual({
      type: 'weekly',
      weekday: 2,
      hour: 7,
      minute: 30,
      channelId: 'weigh-in',
    });
    expect(weeklyDays()).toEqual([2, 4]);
  });

  it('cancels what it scheduled when a later one fails', async () => {
    mockSchedule
      .mockResolvedValueOnce('weigh_in_weekly_0')
      .mockRejectedValueOnce(new Error('boom'));
    const ids = await scheduleWeighInReminders({
      time: '07:30',
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      skipToday: false,
      today: '2026-11-16',
    });
    expect(ids).toEqual([]);
    expect(mockCancel).toHaveBeenCalledWith('weigh_in_weekly_0');
  });
});

describe('cancelWeighInReminders', () => {
  beforeEach(() => jest.clearAllMocks());

  it('cancels the known ids and any scheduled weigh-in by kind', async () => {
    mockGetAllScheduled.mockResolvedValue([
      { identifier: 'legacy', content: { data: { kind: 'weigh-in' } } },
      { identifier: 'other', content: { data: { kind: 'oral-care' } } },
    ]);
    await cancelWeighInReminders();
    const cancelled = mockCancel.mock.calls.map(([id]) => id);
    expect(cancelled).toEqual(
      expect.arrayContaining(['weigh_in_weekly_0', 'weigh_in_skip_1', 'legacy'])
    );
    expect(cancelled).not.toContain('other');
  });
});

describe('reconcileWeighInReminders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockToday.mockReturnValue('2026-11-16');
    __resetAppPreferencesStoreForTests();
    mockGetAllScheduled.mockResolvedValue([]);
    mockHasPermission.mockResolvedValue(true);
    useAppPreferencesStore.setState({
      notificationsEnabled: true,
      weighInRemindersEnabled: true,
      weighInReminderTime: '07:30',
      weighInReminderWeekdays: [0, 1, 2, 3, 4, 5, 6],
    });
  });

  it('is off by default', async () => {
    __resetAppPreferencesStoreForTests();
    await reconcileWeighInReminders(null);
    expect(mockSchedule).not.toHaveBeenCalled();
    expect(mockCancel).toHaveBeenCalled();
  });

  it('repeats on every day when no weight is logged yet', async () => {
    await reconcileWeighInReminders(false);
    expect(weeklyDays()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(triggers().some((t) => t.type === 'date')).toBe(false);
    expect(mockDismiss).not.toHaveBeenCalled();
  });

  it('skips today and clears its delivered reminder once a weight is logged', async () => {
    mockGetPresented.mockResolvedValue([
      {
        date: new Date(2026, 10, 16, 7, 30).getTime(),
        request: {
          identifier: 'weigh_in_weekly_1',
          content: { data: { kind: 'weigh-in' } },
        },
      },
      {
        date: new Date(2026, 10, 15, 7, 30).getTime(),
        request: {
          identifier: 'yesterday',
          content: { data: { kind: 'weigh-in' } },
        },
      },
      {
        date: new Date(2026, 10, 16, 8, 0).getTime(),
        request: {
          identifier: 'mood_checkin_0',
          content: { data: { kind: 'mood-checkin' } },
        },
      },
    ]);
    await reconcileWeighInReminders(true);
    // Monday (expo weekday 2) drops out of the repeating set...
    expect(weeklyDays()).toEqual([1, 3, 4, 5, 6, 7]);
    // ...and the following Mondays are one-shots, so they keep coming.
    const dates = triggers()
      .filter((t) => t.type === 'date')
      .map((t) => t.date);
    expect(dates[0]).toEqual(new Date(2026, 10, 23, 7, 30));
    expect(dates).toHaveLength(8);
    expect(mockDismiss).toHaveBeenCalledTimes(1);
    expect(mockDismiss).toHaveBeenCalledWith('weigh_in_weekly_1');
  });

  it('only cancels without notification permission', async () => {
    mockHasPermission.mockResolvedValue(false);
    await reconcileWeighInReminders(false);
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it('schedules nothing while notifications are off', async () => {
    useAppPreferencesStore.setState({ notificationsEnabled: false });
    await reconcileWeighInReminders(false);
    expect(mockSchedule).not.toHaveBeenCalled();
  });
});
