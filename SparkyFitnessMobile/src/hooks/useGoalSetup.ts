import {
  useMutation,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { bodyFatFromOnboardingRange } from '@workspace/shared';
import { fetchDailyGoals, saveDailyGoals } from '../services/api/goalsApi';
import { upsertCheckIn } from '../services/api/measurementsApi';
import {
  fetchOnboardingStatus,
  skipOnboarding,
  submitOnboarding,
} from '../services/api/onboardingApi';
import { updatePreferences } from '../services/api/preferencesApi';
import { updateProfileBasics } from '../services/api/profileApi';
import { addLog } from '../services/LogService';
import { getActiveServerConfig, type ServerConfig } from '../services/storage';
import type { UserPreferences } from '../types/preferences';
import { getTodayDate } from '../utils/dateUtils';
import {
  goalSetupPreferencesPatch,
  goalsFromTargets,
  toOnboardingSubmission,
  type GoalSetupAnswers,
  type suggestGoalTargets,
} from '../utils/goalSetup';
import {
  dailySummaryRootQueryKey,
  latestMeasurementsOnOrBeforeRootQueryKey,
  preferencesQueryKey,
  profileQueryKey,
} from './queryKeys';
import { refreshHealthSyncCache } from './refreshHealthSyncCache';
import { serverOnScreen } from './serverOnScreen';

/**
 * The account goal setup belongs to, taken once when the screen opens: the
 * one on screen, else the active one (right after first sign-in the cached
 * server list may not be loaded yet).
 */
export async function goalSetupAccount(
  queryClient: QueryClient
): Promise<ServerConfig | null> {
  return serverOnScreen(queryClient) ?? (await getActiveServerConfig());
}

/** How long the sign-in screen waits for the status before moving on. */
const STATUS_TIMEOUT_MS = 5000;

/**
 * Whether goal setup should be offered after signing in to `serverConfig`:
 * only when the account has neither finished nor skipped it. Any failure,
 * a timeout or an older server without the route reads as "no", so signing
 * in is never held up by it.
 */
export async function shouldOfferGoalSetup(
  serverConfig?: ServerConfig
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const status = await Promise.race([
      fetchOnboardingStatus(serverConfig),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), STATUS_TIMEOUT_MS);
      }),
    ]);
    return (
      status !== null && !status.onboardingComplete && !status.onboardingSkipped
    );
  } catch (error) {
    addLog(`Goal setup status check failed: ${error}`, 'WARNING');
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

interface SaveGoalSetupVars {
  /** The account goal setup was started on. */
  serverConfig: ServerConfig;
  answers: GoalSetupAnswers;
  goals: NonNullable<ReturnType<typeof suggestGoalTargets>>['goals'];
  units: {
    weightUnit?: UserPreferences['default_weight_unit'];
    measurementUnit?: UserPreferences['default_measurement_unit'];
  };
}

/**
 * Saves goal setup to the account it was started on: preferences and
 * today's goals (cascading forward) first, then the profile and today's
 * check-in, then marks setup finished.
 */
export function useSaveGoalSetup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      serverConfig,
      answers,
      goals,
      units,
    }: SaveGoalSetupVars) => {
      const submission = toOnboardingSubmission(answers);
      if (!submission) throw new Error('Goal setup answers are incomplete');
      const today = getTodayDate();

      await updatePreferences(
        goalSetupPreferencesPatch(answers, units),
        serverConfig
      );

      const current = await fetchDailyGoals(today, serverConfig);
      await saveDailyGoals(
        today,
        goalsFromTargets(current, goals),
        true,
        serverConfig
      );

      // The profile and the check-in only refine later calculations; a failure
      // there should not lose the goals the person just chose.
      try {
        await updateProfileBasics(
          { gender: submission.sex, date_of_birth: submission.birthDate },
          serverConfig
        );
      } catch (error) {
        addLog(`Goal setup: profile save failed: ${error}`, 'WARNING');
      }
      try {
        const bodyFat = bodyFatFromOnboardingRange(answers.bodyFatRange);
        await upsertCheckIn({
          entryDate: today,
          weight: submission.currentWeight,
          height: submission.height,
          ...(bodyFat !== null ? { bodyFatPercentage: bodyFat } : {}),
          serverConfig,
        });
      } catch (error) {
        addLog(`Goal setup: check-in save failed: ${error}`, 'WARNING');
      }

      await submitOnboarding(submission, serverConfig);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: preferencesQueryKey });
      queryClient.invalidateQueries({ queryKey: profileQueryKey });
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      queryClient.invalidateQueries({ queryKey: ['goalsRange'] });
      queryClient.invalidateQueries({ queryKey: dailySummaryRootQueryKey });
      queryClient.invalidateQueries({
        queryKey: latestMeasurementsOnOrBeforeRootQueryKey,
      });
      refreshHealthSyncCache(queryClient);
    },
    onError: (error) => {
      addLog(`Goal setup save failed: ${error}`, 'ERROR');
    },
  });
}

/** Marks goal setup as skipped on the account it was started on. */
export function useSkipGoalSetup() {
  return useMutation({
    mutationFn: (serverConfig: ServerConfig) => skipOnboarding(serverConfig),
    onError: (error) => {
      addLog(`Goal setup skip failed: ${error}`, 'WARNING');
    },
  });
}
