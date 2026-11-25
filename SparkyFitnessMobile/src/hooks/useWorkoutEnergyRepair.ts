import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import type { IndividualSessionResponse } from '@workspace/shared';
import {
  needsEnergyRepair,
  planEnergyRepair,
  repairWorkoutEnergy,
} from '../services/healthkit/workoutEnergyRepair';

/**
 * The "Fix calories in Apple Health" action for a diary run or walk: shown
 * only on iOS, for an entry with energy and a start time whose span has none
 * in Apple Health (the watch counted none). `repair` writes it once.
 */
export function useWorkoutEnergyRepair(
  entry: IndividualSessionResponse | undefined
) {
  const plan = useMemo(
    () => (entry && Platform.OS === 'ios' ? planEnergyRepair(entry) : null),
    [entry]
  );
  const [result, setResult] = useState<{
    entryId: string;
    needed: boolean;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!plan) return;
    void needsEnergyRepair(plan).then((needed) => {
      if (!cancelled) setResult({ entryId: plan.entryId, needed });
    });
    return () => {
      cancelled = true;
    };
  }, [plan]);

  const repair = useCallback(async (): Promise<boolean> => {
    if (!plan || busy) return false;
    setBusy(true);
    try {
      const saved = await repairWorkoutEnergy(plan);
      if (saved) setResult({ entryId: plan.entryId, needed: false });
      return saved;
    } finally {
      setBusy(false);
    }
  }, [plan, busy]);

  const needed =
    plan != null && result?.entryId === plan.entryId && result.needed;
  return {
    visible: needed,
    kcal: plan?.kcal ?? 0,
    busy,
    repair,
  };
}
