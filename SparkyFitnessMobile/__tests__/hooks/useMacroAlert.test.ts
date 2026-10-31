import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  __resetMacroAlertStateForTests,
  cancelMacroAlerts,
  reconcileMacroAlerts,
} from '../../src/hooks/useMacroAlert';
import {
  cancelScheduledNotification,
  scheduleMacroAlertNotifications,
} from '../../src/services/notifications';

jest.mock('../../src/localization', () => ({ useAppLocale: () => 'en' }));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/services/notifications', () => ({
  scheduleMacroAlertNotifications: jest.fn(),
  cancelScheduledNotification: jest.fn().mockResolvedValue(undefined),
}));

const mockSchedule = scheduleMacroAlertNotifications as jest.Mock;
const mockCancel = cancelScheduledNotification as jest.Mock;

const baseInput = {
  today: '2026-10-31',
  rules: [{ macro: 'protein' as const, percent: 70 as const, time: '18:00' }],
  totals: { protein: { consumed: 30, goal: 120 } },
  macroNames: { protein: 'Protein' },
};

describe('reconcileMacroAlerts', () => {
  const now = new Date(2026, 9, 31, 15, 0);

  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    __resetMacroAlertStateForTests();
    mockSchedule.mockResolvedValue(['id-1']);
  });

  it('schedules an alert with the display name while behind', async () => {
    await reconcileMacroAlerts(baseInput, now);
    const alerts = mockSchedule.mock.calls[0][0];
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      macro: 'protein',
      macroName: 'Protein',
      remaining: 90,
      progressPercent: 25,
    });
  });

  it('does nothing for an unchanged input', async () => {
    await reconcileMacroAlerts(baseInput, now);
    await reconcileMacroAlerts(baseInput, now);
    expect(mockSchedule).toHaveBeenCalledTimes(1);
  });

  it('cancels the pending alert once enough is logged', async () => {
    await reconcileMacroAlerts(baseInput, now);
    mockSchedule.mockResolvedValue([]);
    await reconcileMacroAlerts(
      { ...baseInput, totals: { protein: { consumed: 100, goal: 120 } } },
      now
    );
    expect(mockCancel).toHaveBeenCalledWith('id-1');
    expect(mockSchedule.mock.calls[1][0]).toEqual([]);
  });

  it('cancelMacroAlerts cancels and forgets the pending alert', async () => {
    await reconcileMacroAlerts(baseInput, now);
    await cancelMacroAlerts();
    expect(mockCancel).toHaveBeenCalledWith('id-1');
    await reconcileMacroAlerts(baseInput, now);
    expect(mockSchedule).toHaveBeenCalledTimes(2);
  });
});
