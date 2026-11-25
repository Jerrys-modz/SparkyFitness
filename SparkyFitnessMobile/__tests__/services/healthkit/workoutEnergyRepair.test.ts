import {
  deleteObjects,
  queryQuantitySamples,
  saveWorkoutSample,
} from '@kingstinct/react-native-healthkit';
import {
  loadHealthPreference,
  saveHealthPreference,
} from '../../../src/services/healthkit/preferences';
import {
  needsEnergyRepair,
  planEnergyRepair,
  repairWorkoutEnergy,
} from '../../../src/services/healthkit/workoutEnergyRepair';
import { EXERCISE_WRITEBACK_METADATA_KEY } from '../../../src/services/healthkit/dataTransformation';

jest.mock('../../../src/services/healthkit/preferences', () => ({
  loadHealthPreference: jest.fn(),
  saveHealthPreference: jest.fn(),
  HEALTH_PREFERENCE_PREFIX: '@HealthKit',
}));
jest.mock('../../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('react-native', () => ({ Platform: { OS: 'ios', Version: '26.0' } }));

const entry = {
  id: 'run-1',
  entry_date: '2026-11-25',
  entry_time: '06:31:00',
  record_timezone: 'UTC',
  duration_minutes: 33,
  name: 'Running',
  category: 'Cardio',
  exercise_snapshot: { name: 'Running', category: 'Cardio' },
  active_calories: null,
  calories_applied: null,
  calories_burned: 415,
  resting_calories: null,
} as never;

let store: Record<string, unknown> = {};
beforeEach(() => {
  jest.clearAllMocks();
  store = {};
  (loadHealthPreference as jest.Mock).mockImplementation((key: string) =>
    Promise.resolve(key in store ? store[key] : null)
  );
  (saveHealthPreference as jest.Mock).mockImplementation(
    (key: string, value: unknown) => {
      store[key] = value;
      return Promise.resolve();
    }
  );
});

describe('planEnergyRepair', () => {
  it('covers the run from its start for its duration, with its energy', () => {
    const plan = planEnergyRepair(entry, 'UTC');
    expect(plan?.entryId).toBe('run-1');
    expect(plan?.start.toISOString()).toBe('2026-11-25T06:31:00.000Z');
    expect(plan?.end.toISOString()).toBe('2026-11-25T07:04:00.000Z');
    expect(plan?.kcal).toBe(415);
  });

  it('is always a plain Other workout, whatever the entry was', () => {
    expect(planEnergyRepair(entry, 'UTC')?.activityType).toBe('other');
  });

  it('takes the resting share off a Sparky estimate', () => {
    const plan = planEnergyRepair(
      { ...(entry as object), resting_calories: 40 } as never,
      'UTC'
    );
    expect(plan?.kcal).toBe(375);
  });

  it('is null without a start time or without any energy', () => {
    expect(
      planEnergyRepair({ ...(entry as object), entry_time: null } as never)
    ).toBeNull();
    expect(
      planEnergyRepair(
        { ...(entry as object), calories_burned: 0 } as never,
        'UTC'
      )
    ).toBeNull();
  });
});

describe('needsEnergyRepair', () => {
  const plan = planEnergyRepair(entry, 'UTC')!;

  it('is true when Apple Health has no energy over the span', async () => {
    (queryQuantitySamples as jest.Mock).mockResolvedValue([]);
    await expect(needsEnergyRepair(plan)).resolves.toBe(true);
  });

  it('is false when the watch recorded energy', async () => {
    (queryQuantitySamples as jest.Mock).mockResolvedValue([
      { quantity: 300 },
      { quantity: 100 },
    ]);
    await expect(needsEnergyRepair(plan)).resolves.toBe(false);
  });

  it('ignores the bare sample an earlier version wrote', async () => {
    (queryQuantitySamples as jest.Mock).mockResolvedValue([
      {
        quantity: 415,
        metadata: {
          [EXERCISE_WRITEBACK_METADATA_KEY]: 'sparky-energy-repair-run-1',
        },
      },
    ]);
    await expect(needsEnergyRepair(plan)).resolves.toBe(true);
  });

  it('is false once the entry was repaired', async () => {
    store['workoutEnergyRepairedAsWorkout:run-1'] = true;
    (queryQuantitySamples as jest.Mock).mockResolvedValue([]);
    await expect(needsEnergyRepair(plan)).resolves.toBe(false);
  });
});

describe('repairWorkoutEnergy', () => {
  const plan = planEnergyRepair(entry, 'UTC')!;

  it('saves a marked workout with the energy over the run and remembers it', async () => {
    await expect(repairWorkoutEnergy(plan)).resolves.toBe(true);
    const [, quantities, start, end, , metadata] = (
      saveWorkoutSample as jest.Mock
    ).mock.calls[0];
    expect(start).toEqual(plan.start);
    expect(end).toEqual(plan.end);
    expect(quantities).toEqual([
      expect.objectContaining({
        quantityType: 'HKQuantityTypeIdentifierActiveEnergyBurned',
        unit: 'kcal',
        quantity: 415,
      }),
    ]);
    expect(metadata[EXERCISE_WRITEBACK_METADATA_KEY]).toBe(
      'sparky-energy-repair-run-1'
    );
    expect(store['workoutEnergyRepairedAsWorkout:run-1']).toBe(true);
    expect(store.writebackExerciseFilterOwn).toBe(true);
  });

  it('removes the bare energy sample an earlier version wrote first', async () => {
    await repairWorkoutEnergy(plan);
    expect(deleteObjects).toHaveBeenCalledWith(
      'HKQuantityTypeIdentifierActiveEnergyBurned',
      {
        metadata: {
          withMetadataKey: EXERCISE_WRITEBACK_METADATA_KEY,
          value: 'sparky-energy-repair-run-1',
        },
      }
    );
  });

  it('never writes twice for one entry', async () => {
    await repairWorkoutEnergy(plan);
    await repairWorkoutEnergy(plan);
    expect(saveWorkoutSample).toHaveBeenCalledTimes(1);
  });

  it('reports a failed save and leaves the entry open', async () => {
    (saveWorkoutSample as jest.Mock).mockResolvedValueOnce(undefined);
    await expect(repairWorkoutEnergy(plan)).resolves.toBe(false);
    expect(store['workoutEnergyRepairedAsWorkout:run-1']).toBeUndefined();
  });
});
