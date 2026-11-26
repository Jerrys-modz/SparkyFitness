import type { TFunction } from 'i18next';
import type { ExerciseActivityQueryItem } from '@workspace/shared';
import { sessionStats } from '../../src/utils/cardioSessionStats';

// The default value carries the English text; interpolate like i18next does.
const t = ((
  _key: string,
  options?: { defaultValue?: string; [name: string]: unknown }
) =>
  (options?.defaultValue ?? '').replace(
    /\{\{(\w+)\}\}/g,
    (_match, name: string) => String(options?.[name] ?? '')
  )) as unknown as TFunction;

const session = (
  overrides: Partial<ExerciseActivityQueryItem>
): ExerciseActivityQueryItem =>
  ({
    id: 's1',
    userId: 'u1',
    exerciseName: 'Running',
    category: 'Cardio',
    entryDate: '2026-11-26',
    entryTime: null,
    durationMinutes: 4,
    movingDurationMinutes: null,
    distanceMeters: null,
    distanceFormatted: null,
    avgPaceSecondsPerKm: null,
    formattedPace: null,
    caloriesBurned: 30,
    avgHeartRate: 113,
    ...overrides,
  }) as ExerciseActivityQueryItem;

const heartRateLabel = (item: ExerciseActivityQueryItem): string | undefined =>
  sessionStats(t, item, 'miles', 'celsius').find((stat) => stat.key === 'hr')
    ?.label;

describe('sessionStats heart rate label', () => {
  it('says what measured the heart rate', () => {
    expect(heartRateLabel(session({ hrSource: 'watch' }))).toBe(
      'Avg heart rate · Apple Watch'
    );
    expect(heartRateLabel(session({ hrSource: 'headphones' }))).toBe(
      'Avg heart rate · Headphones'
    );
  });

  it('adds nothing for a workout whose source is unknown', () => {
    expect(heartRateLabel(session({ hrSource: null }))).toBe('Avg heart rate');
    expect(heartRateLabel(session({}))).toBe('Avg heart rate');
  });
});
