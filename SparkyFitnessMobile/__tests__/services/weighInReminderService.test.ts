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

function scheduledDays(): string[] {
  return mockSchedule.mock.calls.map(
    ([request]) => (request.content.data as { day: string }).day
  );
}

describe('scheduleWeighInReminders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAllScheduled.mockResolvedValue([]);
  });

  it('schedules one-shot reminders with neutral copy and the day in data', async () => {
    const ids = await scheduleWeighInReminders({
      time: '07:30',
      weekdays: [1, 3],
      skipDay: null,
      now: new Date(2026, 10, 16, 6, 0),
      today: '2026-11-16',
    });
    expect(ids).toHaveLength(2);
    expect(scheduledDays()).toEqual(['2026-11-16', '2026-11-18']);
    const [first] = mockSchedule.mock.calls[0];
    expect(first.identifier).toBe('weigh_in_0');
    expect(first.content.title).toBe('Weigh-in');
    expect(first.content.data.kind).toBe('weigh-in');
    expect(first.trigger).toEqual({
      type: 'date',
      date: new Date(2026, 10, 16, 7, 30),
      channelId: 'weigh-in',
    });
  });

  it('cancels what it scheduled when a later one fails', async () => {
    mockSchedule
      .mockResolvedValueOnce('weigh_in_0')
      .mockRejectedValueOnce(new Error('boom'));
    const ids = await scheduleWeighInReminders({
      time: '07:30',
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      skipDay: null,
      now: new Date(2026, 10, 16, 6, 0),
      today: '2026-11-16',
    });
    expect(ids).toEqual([]);
    expect(mockCancel).toHaveBeenCalledWith('weigh_in_0');
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
    expect(cancelled).toEqual(expect.arrayContaining(['weigh_in_0', 'legacy']));
    expect(cancelled).not.toContain('other');
  });
});

describe('reconcileWeighInReminders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers({ now: new Date(2026, 10, 16, 6, 0) });
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

  afterEach(() => jest.useRealTimers());

  it('is off by default', async () => {
    __resetAppPreferencesStoreForTests();
    await reconcileWeighInReminders(null);
    expect(mockSchedule).not.toHaveBeenCalled();
    expect(mockCancel).toHaveBeenCalled();
  });

  it('includes today when no weight is logged yet', async () => {
    await reconcileWeighInReminders(false);
    expect(scheduledDays()[0]).toBe('2026-11-16');
    expect(mockDismiss).not.toHaveBeenCalled();
  });

  it('skips today and clears its delivered reminder once a weight is logged', async () => {
    mockGetPresented.mockResolvedValue([
      {
        request: {
          identifier: 'weigh_in_0',
          content: { data: { kind: 'weigh-in', day: '2026-11-16' } },
        },
      },
      {
        request: {
          identifier: 'mood_checkin_0',
          content: { data: { kind: 'mood-checkin' } },
        },
      },
    ]);
    await reconcileWeighInReminders(true);
    expect(scheduledDays()).not.toContain('2026-11-16');
    expect(scheduledDays()[0]).toBe('2026-11-17');
    expect(mockDismiss).toHaveBeenCalledTimes(1);
    expect(mockDismiss).toHaveBeenCalledWith('weigh_in_0');
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
