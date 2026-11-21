import { act, renderHook, waitFor } from '@testing-library/react-native';
import {
  shouldOfferGoalSetup,
  useSaveGoalSetup,
  useSkipGoalSetup,
} from '../../src/hooks/useGoalSetup';
import {
  fetchOnboardingStatus,
  skipOnboarding,
  submitOnboarding,
} from '../../src/services/api/onboardingApi';
import {
  fetchDailyGoals,
  saveDailyGoals,
} from '../../src/services/api/goalsApi';
import { updatePreferences } from '../../src/services/api/preferencesApi';
import { updateProfileBasics } from '../../src/services/api/profileApi';
import { upsertCheckIn } from '../../src/services/api/measurementsApi';
import {
  createQueryWrapper,
  createTestQueryClient,
  testServer,
} from './queryTestUtils';
import type { GoalSetupAnswers } from '../../src/utils/goalSetup';

jest.mock('../../src/services/api/onboardingApi', () => ({
  fetchOnboardingStatus: jest.fn(),
  submitOnboarding: jest.fn().mockResolvedValue(undefined),
  skipOnboarding: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/services/api/goalsApi', () => ({
  fetchDailyGoals: jest.fn(),
  saveDailyGoals: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/services/api/preferencesApi', () => ({
  updatePreferences: jest.fn().mockResolvedValue({}),
}));
jest.mock('../../src/services/api/profileApi', () => ({
  updateProfileBasics: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/services/api/measurementsApi', () => ({
  upsertCheckIn: jest.fn().mockResolvedValue({}),
}));

const answers: GoalSetupAnswers = {
  sex: 'male',
  primaryGoal: 'maintain_weight',
  weightKg: 80,
  heightCm: 180,
  birthDate: '1985-02-01',
  bodyFatRange: 'Low (<15%)',
  targetWeightKg: 78,
  mealsPerDay: 3,
  activityLevel: 'moderate',
  addBurnedCalories: false,
};

const goals = {
  calories: 2600,
  protein: 130,
  carbs: 290,
  fat: 100,
  dietary_fiber: 36,
  water_goal_ml: 2800,
};

describe('shouldOfferGoalSetup', () => {
  beforeEach(() => jest.clearAllMocks());

  it('offers setup only when neither finished nor skipped', async () => {
    (fetchOnboardingStatus as jest.Mock).mockResolvedValueOnce({
      onboardingComplete: false,
      onboardingSkipped: false,
    });
    await expect(shouldOfferGoalSetup(testServer)).resolves.toBe(true);
    expect(fetchOnboardingStatus).toHaveBeenCalledWith(testServer);

    (fetchOnboardingStatus as jest.Mock).mockResolvedValueOnce({
      onboardingComplete: false,
      onboardingSkipped: true,
    });
    await expect(shouldOfferGoalSetup()).resolves.toBe(false);

    (fetchOnboardingStatus as jest.Mock).mockResolvedValueOnce({
      onboardingComplete: true,
      onboardingSkipped: false,
    });
    await expect(shouldOfferGoalSetup()).resolves.toBe(false);
  });

  it('never holds up sign-in when the check fails', async () => {
    (fetchOnboardingStatus as jest.Mock).mockRejectedValueOnce(
      new Error('404')
    );
    await expect(shouldOfferGoalSetup()).resolves.toBe(false);
  });
});

describe('useSaveGoalSetup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (fetchDailyGoals as jest.Mock).mockResolvedValue({
      calories: 2000,
      protein: 100,
      carbs: 200,
      fat: 60,
      dietary_fiber: 25,
      caffeine_mg: 250,
    });
  });

  it('saves everything to the account it started on, setup last', async () => {
    const queryClient = createTestQueryClient();
    const { result } = renderHook(() => useSaveGoalSetup(), {
      wrapper: createQueryWrapper(queryClient),
    });

    await act(async () => {
      await result.current.mutateAsync({
        serverConfig: testServer,
        answers,
        goals,
        units: {},
      });
    });

    expect(updatePreferences).toHaveBeenCalledWith(
      expect.objectContaining({
        goal_mode: 'maintain',
        goal_mode_calculation_method: 'manual',
        activity_level: 'moderate',
      }),
      testServer
    );
    expect(fetchDailyGoals).toHaveBeenCalledWith(
      expect.any(String),
      testServer
    );
    expect(saveDailyGoals).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ calories: 2600, caffeine_mg: 250 }),
      true,
      testServer
    );
    expect(updateProfileBasics).toHaveBeenCalledWith(
      { gender: 'male', date_of_birth: '1985-02-01' },
      testServer
    );
    expect(upsertCheckIn).toHaveBeenCalledWith(
      expect.objectContaining({
        weight: 80,
        height: 180,
        bodyFatPercentage: 12,
        serverConfig: testServer,
      })
    );
    expect(submitOnboarding).toHaveBeenCalledWith(
      expect.objectContaining({ sex: 'male', targetWeight: 78 }),
      testServer
    );
    const submitOrder = (submitOnboarding as jest.Mock).mock
      .invocationCallOrder[0];
    expect(submitOrder).toBeGreaterThan(
      (saveDailyGoals as jest.Mock).mock.invocationCallOrder[0]
    );
  });

  it('still finishes when only the profile or check-in fails', async () => {
    (updateProfileBasics as jest.Mock).mockRejectedValueOnce(new Error('x'));
    (upsertCheckIn as jest.Mock).mockRejectedValueOnce(new Error('y'));
    const { result } = renderHook(() => useSaveGoalSetup(), {
      wrapper: createQueryWrapper(createTestQueryClient()),
    });
    await act(async () => {
      await result.current.mutateAsync({
        serverConfig: testServer,
        answers,
        goals,
        units: {},
      });
    });
    expect(submitOnboarding).toHaveBeenCalled();
  });

  it('does not mark setup finished when the goals fail to save', async () => {
    (saveDailyGoals as jest.Mock).mockRejectedValueOnce(new Error('500'));
    const { result } = renderHook(() => useSaveGoalSetup(), {
      wrapper: createQueryWrapper(createTestQueryClient()),
    });
    act(() => {
      result.current.mutate({
        serverConfig: testServer,
        answers,
        goals,
        units: {},
      });
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(submitOnboarding).not.toHaveBeenCalled();
  });
});

describe('useSkipGoalSetup', () => {
  it('skips on the given account', async () => {
    const { result } = renderHook(() => useSkipGoalSetup(), {
      wrapper: createQueryWrapper(createTestQueryClient()),
    });
    await act(async () => {
      await result.current.mutateAsync(testServer);
    });
    expect(skipOnboarding).toHaveBeenCalledWith(testServer);
  });
});
