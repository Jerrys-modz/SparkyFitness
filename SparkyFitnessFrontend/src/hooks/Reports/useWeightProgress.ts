import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  computeWeightMilestones,
  computeWeightProgress,
  energyBalanceWindow,
  estimateFatFromEnergyBalance,
  resolveWeightProgressStart,
  todayInZone,
  waistToHeightSeries,
  type CheckInMeasurementsResponse,
  type EnergyBalanceEstimate,
  type WaistToHeightPoint,
  type WeightMilestoneSummary,
  type WeightProgress,
  type WeightProgressSettings,
  type WeightSample,
} from '@workspace/shared';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { checkInKeys } from '@/api/keys/checkin';
import { onboardingKeys } from '@/api/keys/onboarding';
import { diaryReportKeys } from '@/api/keys/diary';
import { fetchRecentStandardMeasurements } from '@/api/CheckIn/checkInService';
import { fetchOnboardingStartWeight } from '@/api/Onboarding/onboarding';
import { loadMiniNutritionTrendData } from '@/api/Diary/foodEntryService';
import { useAdaptiveTdee } from '@/hooks/Diary/useDailyProgress';
import {
  loadWeightProgressSettings,
  saveWeightProgressSettings,
} from '@/utils/weightProgressSettings';

/** Far enough back to cover every check-in anyone has logged. */
const HISTORY_START = '2000-01-01';

const EMPTY_HISTORY: CheckInMeasurementsResponse[] = [];

/** Every check-in day the person has, oldest first as the server sends them. */
export const useMeasurementHistory = () => {
  const { t } = useTranslation();
  const { activeUserId } = useActiveUser();
  const { timezone } = usePreferences();
  const today = todayInZone(timezone);
  return useQuery({
    queryKey: checkInKeys.measurementHistory(activeUserId),
    queryFn: () => fetchRecentStandardMeasurements(HISTORY_START, today),
    enabled: !!activeUserId,
    meta: {
      errorMessage: t(
        'reports.weightProgress.loadFailed',
        'Failed to load your measurement history.'
      ),
    },
  });
};

const weightSamplesOf = (
  rows: readonly CheckInMeasurementsResponse[]
): WeightSample[] =>
  rows.flatMap((row) => {
    const weight = Number(row.weight);
    return row.weight != null && Number.isFinite(weight) && weight > 0
      ? [{ date: row.entry_date, weight }]
      : [];
  });

/** Waist-to-height ratio for every day with a waist, from all history. */
export const useWaistToHeight = (): {
  series: WaistToHeightPoint[];
  isLoading: boolean;
} => {
  const { data = EMPTY_HISTORY, isLoading } = useMeasurementHistory();
  const series = useMemo(
    () =>
      waistToHeightSeries(
        data.map((row) => ({
          date: row.entry_date,
          waist: row.waist,
          height: row.height,
        }))
      ),
    [data]
  );
  return { series, isLoading };
};

/** The card's per-person choices, kept in this browser. */
const useWeightProgressSettings = (userId: string | null) => {
  const [state, setState] = useState(() => ({
    userId,
    settings: loadWeightProgressSettings(userId),
  }));
  // Another person on screen starts from their own choices; `update` below
  // stores them under that person.
  const settings = useMemo(
    () =>
      state.userId === userId
        ? state.settings
        : loadWeightProgressSettings(userId),
    [state, userId]
  );

  const update = useCallback(
    (change: Partial<WeightProgressSettings>) => {
      setState((prev) => {
        const base =
          prev.userId === userId
            ? prev.settings
            : loadWeightProgressSettings(userId);
        const next = { ...base, ...change };
        saveWeightProgressSettings(userId, next);
        return { userId, settings: next };
      });
    },
    [userId]
  );
  return [settings, update] as const;
};

export interface WeightProgressData {
  isLoading: boolean;
  progress: WeightProgress | null;
  milestones: WeightMilestoneSummary | null;
  energy: EnergyBalanceEstimate | null;
  /** The daily expenditure the energy estimate used, kcal. */
  expenditureKcal: number | null;
  settings: WeightProgressSettings;
  updateSettings: (change: Partial<WeightProgressSettings>) => void;
}

/** Weight progress, milestones and the energy-balance estimate. */
export const useWeightProgress = (
  targetWeightKg: number | null
): WeightProgressData => {
  const { activeUserId } = useActiveUser();
  const { timezone, weightUnit } = usePreferences();
  const today = todayInZone(timezone);
  const [settings, updateSettings] = useWeightProgressSettings(activeUserId);

  const history = useMeasurementHistory();
  const onboarding = useQuery({
    queryKey: onboardingKeys.startWeight(activeUserId),
    queryFn: fetchOnboardingStartWeight,
    enabled: !!activeUserId,
    staleTime: 1000 * 60 * 60,
  });
  const adaptive = useAdaptiveTdee(today);

  const samples = useMemo(
    () => weightSamplesOf(history.data ?? EMPTY_HISTORY),
    [history.data]
  );
  const start = useMemo(
    () =>
      resolveWeightProgressStart({
        samples,
        custom: settings.customStart,
        onboardingWeight: onboarding.data?.weightKg,
        onboardingDate: onboarding.data?.date,
      }),
    [samples, settings.customStart, onboarding.data]
  );
  const balanceWindow = useMemo(
    () => energyBalanceWindow(today, start?.date),
    [today, start?.date]
  );
  const intake = useQuery({
    queryKey: diaryReportKeys.nutritionTrendDetail(
      activeUserId ?? '',
      balanceWindow.from,
      balanceWindow.to
    ),
    queryFn: () =>
      loadMiniNutritionTrendData(
        activeUserId!,
        balanceWindow.from,
        balanceWindow.to
      ),
    enabled: !!activeUserId && !!start,
  });

  const progress = useMemo(
    () => computeWeightProgress({ samples, start, target: targetWeightKg }),
    [samples, start, targetWeightKg]
  );
  const milestones = useMemo(
    () =>
      computeWeightMilestones({
        samples,
        start,
        target: targetWeightKg,
        unit: weightUnit === 'kg' ? 'kg' : 'lbs',
      }),
    [samples, start, targetWeightKg, weightUnit]
  );
  const expenditureKcal = adaptive.data?.tdee ?? null;
  const energy = useMemo(
    () =>
      estimateFatFromEnergyBalance({
        intake: (intake.data ?? []).map((day) => ({
          date: day.date,
          calories: Number(day.calories),
        })),
        expenditureKcal,
        from: balanceWindow.from,
        to: balanceWindow.to,
        samples,
      }),
    [intake.data, expenditureKcal, balanceWindow, samples]
  );

  return {
    isLoading: history.isLoading,
    progress,
    milestones,
    energy,
    expenditureKcal,
    settings,
    updateSettings,
  };
};
