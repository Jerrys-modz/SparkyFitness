import AsyncStorage from '@react-native-async-storage/async-storage';
import { renderHook, waitFor } from '@testing-library/react-native';
import {
  cancelCoachingReminder,
  reconcileCoachingReminder,
  useCoachingReminderReconciler,
  __resetCoachingReminderStateForTests,
} from '../../src/hooks/useCoachingReminder';
import {
  cancelScheduledNotification,
  scheduleCoachingCheckInNotification,
} from '../../src/services/notifications';
import {
  useAppPreferencesStore,
  __resetAppPreferencesStoreForTests,
} from '../../src/stores/appPreferencesStore';

jest.mock('../../src/services/notifications', () => ({
  scheduleCoachingCheckInNotification: jest.fn(),
  cancelScheduledNotification: jest.fn(),
}));

const mockSchedule = scheduleCoachingCheckInNotification as jest.MockedFunction<
  typeof scheduleCoachingCheckInNotification
>;
const mockCancel = cancelScheduledNotification as jest.MockedFunction<
  typeof cancelScheduledNotification
>;

const STORAGE_KEY = '@SparkyFitness/coachingReminder';
// Saturday 2026-10-17, 12:00 local.
const NOW = new Date(2026, 9, 17, 12, 0);

const storedId = async () => {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw).notificationId as string) : null;
};

beforeEach(async () => {
  __resetCoachingReminderStateForTests();
  __resetAppPreferencesStoreForTests();
  await AsyncStorage.clear();
  mockSchedule.mockReset().mockResolvedValue('n1');
  mockCancel.mockReset().mockResolvedValue(undefined);
});

describe('reconcileCoachingReminder', () => {
  it('schedules the next check-in day at 09:00 and remembers the id', async () => {
    await reconcileCoachingReminder({ weekday: 1 }, NOW);

    expect(mockSchedule).toHaveBeenCalledWith(new Date(2026, 9, 19, 9, 0));
    expect(await storedId()).toBe('n1');
  });

  it('does nothing when nothing changed', async () => {
    await reconcileCoachingReminder({ weekday: 1 }, NOW);
    await reconcileCoachingReminder({ weekday: 1 }, NOW);

    expect(mockSchedule).toHaveBeenCalledTimes(1);
    expect(mockCancel).not.toHaveBeenCalled();
  });

  it('replaces the notification when the check-in day changes', async () => {
    await reconcileCoachingReminder({ weekday: 1 }, NOW);
    mockSchedule.mockResolvedValue('n2');
    await reconcileCoachingReminder({ weekday: 3 }, NOW);

    expect(mockCancel).toHaveBeenCalledWith('n1');
    expect(mockSchedule).toHaveBeenLastCalledWith(new Date(2026, 9, 21, 9, 0));
    expect(await storedId()).toBe('n2');
  });

  it('schedules the following week once the first has passed', async () => {
    await reconcileCoachingReminder({ weekday: 1 }, NOW);
    mockSchedule.mockResolvedValue('n2');
    await reconcileCoachingReminder(
      { weekday: 1 },
      new Date(2026, 9, 19, 10, 0)
    );

    expect(mockSchedule).toHaveBeenLastCalledWith(new Date(2026, 9, 26, 9, 0));
  });

  it('does not remember a notification that could not be scheduled', async () => {
    mockSchedule.mockResolvedValue(null);
    await reconcileCoachingReminder({ weekday: 1 }, NOW);

    expect(await storedId()).toBeNull();
    await reconcileCoachingReminder({ weekday: 1 }, NOW);
    expect(mockSchedule).toHaveBeenCalledTimes(2);
  });
});

describe('cancelCoachingReminder', () => {
  it('cancels and forgets the scheduled notification', async () => {
    await reconcileCoachingReminder({ weekday: 1 }, NOW);
    await cancelCoachingReminder();

    expect(mockCancel).toHaveBeenCalledWith('n1');
    expect(await storedId()).toBeNull();
  });
});

describe('useCoachingReminderReconciler', () => {
  const enable = () =>
    useAppPreferencesStore.setState({
      notificationsEnabled: true,
      coachingReminderEnabled: true,
    });

  it('schedules when reminders are on and the check-in has data', async () => {
    enable();
    renderHook(() =>
      useCoachingReminderReconciler({ weekday: 2, ready: true })
    );

    await waitFor(() => expect(mockSchedule).toHaveBeenCalledTimes(1));
    expect((mockSchedule.mock.calls[0]![0] as Date).getDay()).toBe(2);
  });

  it('stays quiet while the check-in has nothing to report', async () => {
    enable();
    renderHook(() =>
      useCoachingReminderReconciler({ weekday: 2, ready: false })
    );

    await Promise.resolve();
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it('cancels when the reminder is switched off', async () => {
    enable();
    await reconcileCoachingReminder({ weekday: 2 }, NOW);
    useAppPreferencesStore.setState({ coachingReminderEnabled: false });
    renderHook(() =>
      useCoachingReminderReconciler({ weekday: 2, ready: true })
    );

    await waitFor(() => expect(mockCancel).toHaveBeenCalledWith('n1'));
    expect(mockSchedule).toHaveBeenCalledTimes(1);
  });

  it('waits for the check-in to load', async () => {
    enable();
    renderHook(() =>
      useCoachingReminderReconciler({ weekday: null, ready: false })
    );

    await Promise.resolve();
    expect(mockSchedule).not.toHaveBeenCalled();
  });
});
