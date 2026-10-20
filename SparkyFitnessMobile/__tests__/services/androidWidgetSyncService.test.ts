import {
  clearAndroidWidgetSnapshots,
  getAndroidWidgetGeneration,
  refreshAndroidWidgetsFromServer,
} from '../../src/services/androidWidgetSyncService';
import { CalorieWidgetBridge } from '../../src/services/CalorieWidgetBridge';
import { ensureTimezoneBootstrapped } from '../../src/services/api/preferencesApi';
import {
  buildDailySummary,
  loadDailySummaryRawData,
} from '../../src/services/dailySummaryService';

jest.mock('../../src/services/CalorieWidgetBridge', () => ({
  CalorieWidgetBridge: {
    setCalorieSnapshot: jest.fn(() => Promise.resolve()),
    reloadWidget: jest.fn(() => Promise.resolve()),
    setMacroSnapshot: jest.fn(() => Promise.resolve()),
    reloadMacroWidget: jest.fn(() => Promise.resolve()),
    clearSnapshots: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock('../../src/services/api/preferencesApi', () => ({
  ensureTimezoneBootstrapped: jest.fn(),
}));

jest.mock('../../src/services/dailySummaryService', () => ({
  buildDailySummary: jest.fn(),
  loadDailySummaryRawData: jest.fn(),
}));

const summary = {
  date: '2026-10-19',
  calorieBalance: { remaining: 460, goal: 2000, progress: 77 },
  protein: { consumed: 92, goal: 150 },
  carbs: { consumed: 180, goal: 200 },
  fat: { consumed: 55, goal: 65 },
};

describe('androidWidgetSyncService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (ensureTimezoneBootstrapped as jest.Mock).mockResolvedValue('UTC');
    (buildDailySummary as jest.Mock).mockReturnValue(summary);
  });

  it('erases both snapshots and moves the generation on', async () => {
    const before = getAndroidWidgetGeneration();

    await clearAndroidWidgetSnapshots();

    expect(CalorieWidgetBridge.clearSnapshots).toHaveBeenCalledTimes(1);
    expect(getAndroidWidgetGeneration()).toBe(before + 1);
  });

  it('pushes the summary it loaded', async () => {
    (loadDailySummaryRawData as jest.Mock).mockResolvedValue({});

    await refreshAndroidWidgetsFromServer();

    expect(CalorieWidgetBridge.setCalorieSnapshot).toHaveBeenCalledTimes(1);
    expect(CalorieWidgetBridge.setMacroSnapshot).toHaveBeenCalledTimes(1);
  });

  it('drops a refresh for the previous account when the account changes mid-load', async () => {
    let finishLoading: (raw: object) => void = () => {};
    (loadDailySummaryRawData as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        finishLoading = resolve;
      })
    );

    const refresh = refreshAndroidWidgetsFromServer();
    await Promise.resolve();
    await clearAndroidWidgetSnapshots();
    finishLoading({});
    await refresh;

    expect(CalorieWidgetBridge.setCalorieSnapshot).not.toHaveBeenCalled();
    expect(CalorieWidgetBridge.setMacroSnapshot).not.toHaveBeenCalled();
  });
});
