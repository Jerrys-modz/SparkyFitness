import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  __resetFuelingReminderStateForTests,
  cancelFuelingSession,
  getFuelingSession,
  startFuelingSession,
} from '../../src/services/fuelingReminders';
import {
  cancelScheduledNotification,
  scheduleFuelingReminderNotifications,
} from '../../src/services/notifications';

jest.mock('../../src/services/notifications', () => ({
  scheduleFuelingReminderNotifications: jest.fn(),
  cancelScheduledNotification: jest.fn(),
}));

const mockSchedule =
  scheduleFuelingReminderNotifications as jest.MockedFunction<
    typeof scheduleFuelingReminderNotifications
  >;
const mockCancel = cancelScheduledNotification as jest.MockedFunction<
  typeof cancelScheduledNotification
>;

const STORAGE_KEY = '@SparkyFitness/fuelingSession';
const at = (hours: number, minutes = 0) =>
  new Date(2026, 9, 27, hours, minutes, 0, 0);
const NOW = at(6);

const plan = (overrides: Record<string, unknown> = {}) => ({
  startAt: at(7),
  offsetsMin: [30, 60, 90],
  portionGrams: 25,
  productName: 'Energy gel',
  ...overrides,
});

beforeEach(async () => {
  __resetFuelingReminderStateForTests();
  await AsyncStorage.clear();
  mockSchedule.mockReset().mockResolvedValue(['n1', 'n2', 'n3']);
  mockCancel.mockReset().mockResolvedValue(undefined);
});

describe('startFuelingSession', () => {
  it('schedules every reminder and remembers the session', async () => {
    const result = await startFuelingSession(plan(), NOW);

    expect(result).toEqual({ status: 'scheduled', reminderCount: 3 });
    expect(mockSchedule).toHaveBeenCalledWith(
      [at(7, 30), at(8), at(8, 30)],
      25,
      'Energy gel',
      null
    );
    const session = await getFuelingSession();
    expect(session).toEqual({
      startAtMs: at(7).getTime(),
      portionGrams: 25,
      productName: 'Energy gel',
      food: null,
      reminderCount: 3,
      notificationIds: ['n1', 'n2', 'n3'],
    });
  });

  it('cancels the previous session before scheduling a new one', async () => {
    await startFuelingSession(plan(), NOW);
    mockSchedule.mockResolvedValueOnce(['m1']);
    await startFuelingSession(plan({ offsetsMin: [30] }), NOW);

    expect(mockCancel.mock.calls.map(([id]) => id)).toEqual(['n1', 'n2', 'n3']);
    expect((await getFuelingSession())?.notificationIds).toEqual(['m1']);
  });

  it('keeps the running session when nothing is left to schedule', async () => {
    await startFuelingSession(plan(), NOW);
    mockSchedule.mockClear();
    mockCancel.mockClear();

    const result = await startFuelingSession(
      plan({ startAt: at(1), offsetsMin: [30] }),
      NOW
    );

    expect(result).toEqual({ status: 'nothing_to_schedule' });
    expect(mockSchedule).not.toHaveBeenCalled();
    expect(mockCancel).not.toHaveBeenCalled();
    expect((await getFuelingSession())?.reminderCount).toBe(3);
  });

  it('reports a missing permission and stores nothing', async () => {
    mockSchedule.mockResolvedValueOnce([]);

    const result = await startFuelingSession(plan(), NOW);

    expect(result).toEqual({ status: 'not_permitted' });
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('cancels what it scheduled when it cannot save the session', async () => {
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(
      new Error('disk full')
    );

    await expect(startFuelingSession(plan(), NOW)).rejects.toThrow('disk full');
    expect(mockCancel.mock.calls.map(([id]) => id)).toEqual(['n1', 'n2', 'n3']);
  });

  it('does not schedule two chains for a double tap', async () => {
    await Promise.all([
      startFuelingSession(plan(), NOW),
      startFuelingSession(plan(), NOW),
    ]);

    expect(mockSchedule).toHaveBeenCalledTimes(2);
    // the second pass cancelled the first one's ids before scheduling
    expect(mockCancel).toHaveBeenCalledTimes(3);
  });
});

describe('a session with a saved food', () => {
  const food = {
    foodId: 'food-1',
    variantId: 'variant-1',
    servingSize: 1,
    servingUnit: 'serving',
  };

  it('passes the food to the reminders and remembers it', async () => {
    await startFuelingSession(plan({ food }), NOW);

    expect(mockSchedule).toHaveBeenCalledWith(
      [at(7, 30), at(8), at(8, 30)],
      25,
      'Energy gel',
      food
    );
    expect((await getFuelingSession())?.food).toEqual(food);
  });

  it('reads an older session saved without a food', async () => {
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        startAtMs: 1,
        portionGrams: 25,
        productName: 'Energy gel',
        reminderCount: 1,
        notificationIds: ['a'],
      })
    );
    expect((await getFuelingSession())?.food).toBeNull();
  });
});

describe('cancelFuelingSession', () => {
  it('cancels every notification and forgets the session', async () => {
    await startFuelingSession(plan(), NOW);
    await cancelFuelingSession();

    expect(mockCancel.mock.calls.map(([id]) => id)).toEqual(['n1', 'n2', 'n3']);
    expect(await getFuelingSession()).toBeNull();
  });

  it('does nothing when no session is running', async () => {
    await cancelFuelingSession();
    expect(mockCancel).not.toHaveBeenCalled();
  });
});

describe('getFuelingSession', () => {
  it('ignores a malformed stored value', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, '{"startAtMs":"x"}');
    expect(await getFuelingSession()).toBeNull();
  });
});
