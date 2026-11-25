import { Platform } from 'react-native';
import {
  deleteObjects,
  queryQuantitySamples,
  requestAuthorization,
  saveWorkoutSample,
} from '@kingstinct/react-native-healthkit';
import {
  workoutClockWindow,
  type IndividualSessionResponse,
} from '@workspace/shared';
import { addLog } from '../LogService';
import {
  entryActiveKcal,
  type WorkoutWrite,
} from '../shared/exerciseWritebackPlan';
import { getDeviceTimezone } from '../../utils/dateUtils';
import { EXERCISE_WRITEBACK_METADATA_KEY } from './dataTransformation';
import {
  EXERCISE_FILTER_OWN_PREF,
  WORKOUT_TYPE,
  buildWorkoutSave,
} from './exerciseWriteback';
import { loadHealthPreference, saveHealthPreference } from './preferences';

// Fix calories in Apple Health. A workout the watch saved with no active energy
// (the watch counted none) cannot be edited, and HealthKit has no call to add
// energy to a workout another source saved. So the repair saves a workout of
// our own over the same time, with the entry's energy attached, like exercise
// write-back does: Apple counts the energy of a workout an app saves in the
// Move ring and the day's Active Energy, which a bare energy sample does not
// give. It shows as a second workout next to the watch's. Everything written
// carries the write-back marker, so Sparky's own daily totals leave it out (the
// diary already counts the exercise) and a full write-back removal deletes it.

const ACTIVE_ENERGY = 'HKQuantityTypeIdentifierActiveEnergyBurned' as const;

/** Active energy under this, over the workout's span, counts as none. */
export const MIN_RECORDED_KCAL = 1;

export interface EnergyRepairPlan {
  /** The diary entry the energy belongs to. */
  entryId: string;
  title: string;
  activityType: WorkoutWrite['activityType'];
  start: Date;
  end: Date;
  kcal: number;
}

// v2: the first version wrote a bare energy sample, which the Move ring ignores.
const repairedKey = (entryId: string): string =>
  `workoutEnergyRepairedAsWorkout:${entryId}`;
const repairKey = (entryId: string): string =>
  `sparky-energy-repair-${entryId}`;
const OLD_REPAIR_KEY_PREFIX = 'sparky-energy-repair-';

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
    | 'exercise_snapshot'
    | 'name'
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
  const title = entry.exercise_snapshot?.name ?? entry.name ?? '';
  return {
    entryId: String(entry.id),
    title,
    // Whatever it was, the repair workout is a plain one: it only carries the
    // energy, so it does not claim a sport the watch never measured.
    activityType: 'other',
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
    // A bare sample an earlier version wrote does not count as recorded.
    const recorded = (Array.isArray(samples) ? samples : [])
      .filter((sample) => {
        const marker = (
          sample.metadata as Record<string, unknown> | undefined
        )?.[EXERCISE_WRITEBACK_METADATA_KEY];
        return !(
          typeof marker === 'string' && marker.startsWith(OLD_REPAIR_KEY_PREFIX)
        );
      })
      .reduce((sum, sample) => sum + (Number(sample.quantity) || 0), 0);
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
    // Asks only when sharing was never decided; a refusal throws below.
    await requestAuthorization({
      toShare: [ACTIVE_ENERGY, WORKOUT_TYPE],
      toRead: [ACTIVE_ENERGY, WORKOUT_TYPE],
    });
    // The first version wrote a bare energy sample; the workout replaces it.
    await deleteObjects(ACTIVE_ENERGY, {
      metadata: {
        withMetadataKey: EXERCISE_WRITEBACK_METADATA_KEY,
        value: repairKey(plan.entryId),
      },
    }).catch(() => 0);
    // Set before saving: the workout's energy must already be left out of
    // Sparky's own daily totals when it lands.
    await saveHealthPreference(EXERCISE_FILTER_OWN_PREF, true);
    const save = buildWorkoutSave(
      {
        key: repairKey(plan.entryId),
        kind: 'individual',
        title: plan.title,
        activityType: plan.activityType,
        start: plan.start,
        end: plan.end,
        activeKcal: plan.kcal,
        distanceMeters: null,
        summary: '',
        sets: [],
      },
      1,
      getDeviceTimezone()
    );
    const saved = await saveWorkoutSample(
      save.activityType as Parameters<typeof saveWorkoutSample>[0],
      save.quantities,
      save.start,
      save.end,
      undefined,
      save.metadata
    );
    if (!saved) {
      addLog('[EnergyRepair] Apple Health did not save the workout', 'WARNING');
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
