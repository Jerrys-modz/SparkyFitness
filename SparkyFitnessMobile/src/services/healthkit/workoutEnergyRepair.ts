import { Platform } from 'react-native';
import {
  queryQuantitySamples,
  requestAuthorization,
  saveQuantitySample,
} from '@kingstinct/react-native-healthkit';
import {
  workoutClockWindow,
  type IndividualSessionResponse,
} from '@workspace/shared';
import { addLog } from '../LogService';
import { entryActiveKcal } from '../shared/exerciseWritebackPlan';
import { getDeviceTimezone } from '../../utils/dateUtils';
import { EXERCISE_WRITEBACK_METADATA_KEY } from './dataTransformation';
import { EXERCISE_FILTER_OWN_PREF } from './exerciseWriteback';
import { loadHealthPreference, saveHealthPreference } from './preferences';

// Fix calories in Apple Health. A workout the watch saved with no active energy
// (the watch counted none) cannot be edited, and HealthKit has no call to add
// energy to a workout another source saved. What can be written is one active
// energy sample over the workout's time span: it counts in Health's daily
// Active Energy, and the Fitness app's day totals, though the workout's own page
// may still show none. The sample carries the write-back marker, so Sparky's own
// daily totals leave it out (the diary already counts the exercise) and a full
// write-back removal deletes it.

const ACTIVE_ENERGY = 'HKQuantityTypeIdentifierActiveEnergyBurned' as const;

/** Active energy under this, over the workout's span, counts as none. */
export const MIN_RECORDED_KCAL = 1;

export interface EnergyRepairPlan {
  /** The diary entry the energy belongs to. */
  entryId: string;
  start: Date;
  end: Date;
  kcal: number;
}

const repairedKey = (entryId: string): string =>
  `workoutEnergyRepaired:${entryId}`;

/**
 * What to write for a diary run or walk: the entry's active energy over the
 * time it covers. Null without a start time, a duration or any energy.
 */
export const planEnergyRepair = (
  entry: Pick<
    IndividualSessionResponse,
    | 'id'
    | 'entry_date'
    | 'entry_time'
    | 'record_timezone'
    | 'duration_minutes'
    | 'active_calories'
    | 'calories_applied'
    | 'calories_burned'
    | 'resting_calories'
  >,
  timezone: string = getDeviceTimezone(),
  bmrKcalPerDay: number | null = null
): EnergyRepairPlan | null => {
  const window = workoutClockWindow(
    {
      entry_date: entry.entry_date,
      entry_time: entry.entry_time ?? null,
      record_timezone: entry.record_timezone ?? null,
      duration_minutes: entry.duration_minutes,
    },
    timezone
  );
  if (!window || window.endMs <= window.startMs) return null;
  const kcal = entryActiveKcal(entry, bmrKcalPerDay);
  if (kcal == null || kcal < MIN_RECORDED_KCAL) return null;
  return {
    entryId: String(entry.id),
    start: new Date(window.startMs),
    end: new Date(window.endMs),
    kcal: Math.round(kcal * 10) / 10,
  };
};

/**
 * Whether Health has less than `MIN_RECORDED_KCAL` of active energy over the
 * plan's span and this entry was not repaired before. A read Health denies
 * comes back empty, so an unreadable span also counts as empty; the repair
 * itself is guarded by the saved mark.
 */
export const needsEnergyRepair = async (
  plan: EnergyRepairPlan
): Promise<boolean> => {
  if (Platform.OS !== 'ios') return false;
  try {
    if (await loadHealthPreference<boolean>(repairedKey(plan.entryId))) {
      return false;
    }
    const samples = await queryQuantitySamples(ACTIVE_ENERGY, {
      limit: 0,
      ascending: true,
      unit: 'kcal',
      filter: { date: { startDate: plan.start, endDate: plan.end } },
    });
    const recorded = (Array.isArray(samples) ? samples : []).reduce(
      (sum, sample) => sum + (Number(sample.quantity) || 0),
      0
    );
    return recorded < MIN_RECORDED_KCAL;
  } catch (error) {
    addLog(
      `[EnergyRepair] Could not read Apple Health energy: ${error instanceof Error ? error.message : String(error)}`,
      'WARNING'
    );
    return false;
  }
};

/** Writes the plan's energy to Apple Health once. Resolves to whether it saved. */
export const repairWorkoutEnergy = async (
  plan: EnergyRepairPlan
): Promise<boolean> => {
  if (Platform.OS !== 'ios') return false;
  try {
    if (await loadHealthPreference<boolean>(repairedKey(plan.entryId))) {
      return true;
    }
    // Asks only when sharing energy was never decided; a refusal throws below.
    await requestAuthorization({
      toShare: [ACTIVE_ENERGY],
      toRead: [ACTIVE_ENERGY],
    });
    // Set before saving: the sample must already be left out of Sparky's own
    // daily totals when it lands.
    await saveHealthPreference(EXERCISE_FILTER_OWN_PREF, true);
    const saved = await saveQuantitySample(
      ACTIVE_ENERGY,
      'kcal',
      plan.kcal,
      plan.start,
      plan.end,
      {
        [EXERCISE_WRITEBACK_METADATA_KEY]: `sparky-energy-repair-${plan.entryId}`,
        SparkyEnergyRepair: plan.entryId,
      }
    );
    if (!saved) {
      addLog('[EnergyRepair] Apple Health did not save the energy', 'WARNING');
      return false;
    }
    await saveHealthPreference(repairedKey(plan.entryId), true);
    addLog(
      `[EnergyRepair] Wrote ${plan.kcal} kcal for entry ${plan.entryId}`,
      'INFO'
    );
    return true;
  } catch (error) {
    addLog(
      `[EnergyRepair] Could not write energy: ${error instanceof Error ? error.message : String(error)}`,
      'ERROR'
    );
    return false;
  }
};
