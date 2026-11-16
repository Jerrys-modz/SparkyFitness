import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  computeWeightMilestones,
  computeWeightProgress,
  DEFAULT_WEIGHT_PROGRESS_SETTINGS,
  energyBalanceWindow,
  estimateFatFromEnergyBalance,
  resolveWeightProgressStart,
  waistToHeightSeries,
  type EnergyBalanceEstimate,
  type WaistToHeightPoint,
  type WeightMilestoneSummary,
  type WeightMilestoneUnit,
  type WeightProgress,
  type WeightProgressSettings,
  type WeightSample,
} from '@workspace/shared';
import { fetchMeasurementsRange } from '../services/api/measurementsApi';
import { fetchNutritionTrends } from '../services/api/reportsApi';
import {
  fetchAdaptiveTdeeKcal,
  fetchOnboardingStartWeight,
} from '../services/api/weightProgressApi';
import {
  loadWeightProgressSettings,
  saveWeightProgressSettings,
} from '../services/weightProgressSettings';
import { getActiveServerConfigId } from '../services/storage';
import { getTodayDate } from '../utils/dateUtils';
import type { CheckInMeasurementRange } from '../types/measurements';
import {
  adaptiveTdeeQueryKey,
  measurementsRangeQueryKey,
  nutritionTrendsQueryKey,
  onboardingStartWeightQueryKey,
} from './queryKeys';
import { useRefetchOnFocus } from './useRefetchOnFocus';

/** Far enough back to cover every check-in anyone has logged. */
const HISTORY_START = '2000-01-01';
const EMPTY: CheckInMeasurementRange[] = [];

/** Every check-in day, shared with the rest of the measurements cache family. */
function useMeasurementHistory() {
  const today = getTodayDate();
  const query = useQuery({
    queryKey: measurementsRangeQueryKey(HISTORY_START, today),
    queryFn: () => fetchMeasurementsRange(HISTORY_START, today),
  });
  useRefetchOnFocus(query.refetch);
  return query;
}

const weightSamplesOf = (
  rows: readonly CheckInMeasurementRange[]
): WeightSample[] =>
  rows.flatMap((row) => {
    const weight = Number(row.weight);
    return row.weight != null && Number.isFinite(weight) && weight > 0
      ? [{ date: row.entry_date, weight }]
      : [];
  });

/** Waist-to-height ratio for every day with a waist, from all history. */
export function useWaistToHeight(): {
  series: WaistToHeightPoint[];
  isLoading: boolean;
} {
  const { data = EMPTY, isLoading } = useMeasurementHistory();
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
}

/** The card's choices on this device, per server. */
function useWeightProgressSettings() {
  const [state, setState] = useState<{
    serverId: string | null;
    settings: WeightProgressSettings;
    loaded: boolean;
  }>({
    serverId: null,
    settings: DEFAULT_WEIGHT_PROGRESS_SETTINGS,
    loaded: false,
  });
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const serverId = await getActiveServerConfigId();
      const settings = await loadWeightProgressSettings(serverId);
      if (!cancelled) setState({ serverId, settings, loaded: true });
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const update = useCallback((change: Partial<WeightProgressSettings>) => {
    setState((prev) => {
      const settings = { ...prev.settings, ...change };
      void saveWeightProgressSettings(prev.serverId, settings);
      return { ...prev, settings };
    });
  }, []);
  return { ...state, update };
}

export interface WeightProgressData {
  isLoading: boolean;
  progress: WeightProgress | null;
  milestones: WeightMilestoneSummary | null;
  energy: EnergyBalanceEstimate | null;
  expenditureKcal: number | null;
  settings: WeightProgressSettings;
  updateSettings: (change: Partial<WeightProgressSettings>) => void;
}

/** Weight progress, milestones and the energy-balance estimate. */
export function useWeightProgress({
  targetWeightKg,
  unit,
}: {
  targetWeightKg: number | null;
  unit: WeightMilestoneUnit;
}): WeightProgressData {
  const today = getTodayDate();
  const settingsState = useWeightProgressSettings();
  const history = useMeasurementHistory();
  const onboarding = useQuery({
    queryKey: onboardingStartWeightQueryKey,
    queryFn: fetchOnboardingStartWeight,
  });
  const adaptive = useQuery({
    queryKey: adaptiveTdeeQueryKey(today),
    queryFn: () => fetchAdaptiveTdeeKcal(today),
  });

  const samples = useMemo(
    () => weightSamplesOf(history.data ?? EMPTY),
    [history.data]
  );
  const { settings } = settingsState;
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
    queryKey: nutritionTrendsQueryKey(balanceWindow.from, balanceWindow.to),
    queryFn: () => fetchNutritionTrends(balanceWindow.from, balanceWindow.to),
    enabled: !!start,
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
        unit,
      }),
    [samples, start, targetWeightKg, unit]
  );
  const expenditureKcal = adaptive.data ?? null;
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
    isLoading: history.isLoading || !settingsState.loaded,
    progress,
    milestones,
    energy,
    expenditureKcal,
    settings,
    updateSettings: settingsState.update,
  };
}
