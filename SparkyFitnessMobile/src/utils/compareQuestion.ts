import {
  COMPARE_METRICS,
  addDays,
  compareDays,
  daysBetween,
  type CompareMetricKey,
} from '@workspace/shared';

export type CompareMode = 'day' | 'week' | 'since';
/** The modes read over a span of days; since mode runs from its start date instead. */
export type SpanMode = Exclude<CompareMode, 'since'>;
export type CompareTimingChoice =
  'sameDay' | 'nextDay' | 'dayBefore' | 'sameWeek' | 'nextWeek' | 'sinceHabit';

export interface CompareQuestion {
  a: CompareMetricKey;
  b: CompareMetricKey;
  choice: CompareTimingChoice;
}

/** How a choice pairs the two: by the day or week with a lag, or before vs. since a start. */
type CompareTiming =
  { mode: SpanMode; timing: -1 | 0 | 1 } | { mode: 'since'; timing: 0 };

const TIMINGS: Record<CompareTimingChoice, CompareTiming> = {
  dayBefore: { mode: 'day', timing: -1 },
  sameDay: { mode: 'day', timing: 0 },
  nextDay: { mode: 'day', timing: 1 },
  sameWeek: { mode: 'week', timing: 0 },
  nextWeek: { mode: 'week', timing: 1 },
  sinceHabit: { mode: 'since', timing: 0 },
};

export function timingOf(choice: CompareTimingChoice): CompareTiming {
  return TIMINGS[choice];
}

export type CompareSpan = '30d' | '60d' | '90d' | '6m' | '1y' | 'custom';

export const COMPARE_SPANS: Record<SpanMode, readonly CompareSpan[]> = {
  day: ['30d', '60d', '90d', 'custom'],
  week: ['6m', '1y', 'custom'],
};

export const DEFAULT_COMPARE_SPAN: Record<SpanMode, CompareSpan> = {
  day: '90d',
  week: '6m',
};

const SPAN_DAYS: Record<Exclude<CompareSpan, 'custom'>, number> = {
  '30d': 30,
  '60d': 60,
  '90d': 90,
  '6m': 182,
  '1y': 364,
};

/** The longest custom span per mode; the server rejects anything longer. */
export const MAX_CUSTOM_DAYS: Record<SpanMode, number> = {
  day: 180,
  week: 366,
};

/** The server leaves today out itself, so the window simply ends today. */
export function compareWindow(
  span: CompareSpan,
  mode: SpanMode,
  today: string,
  custom?: { startDate: string; endDate: string } | null
): { startDate: string; endDate: string } {
  if (span === 'custom' && custom) {
    const maxDays = MAX_CUSTOM_DAYS[mode];
    const days = daysBetween(custom.startDate, custom.endDate) + 1;
    return {
      startDate:
        days > maxDays
          ? addDays(custom.endDate, -(maxDays - 1))
          : custom.startDate,
      endDate: custom.endDate,
    };
  }
  const key = span === 'custom' ? DEFAULT_COMPARE_SPAN[mode] : span;
  const days = SPAN_DAYS[key as Exclude<CompareSpan, 'custom'>];
  return { startDate: addDays(today, -(days - 1)), endDate: today };
}

/** The oldest start the server takes, in days back from today. */
const SINCE_MAX_START_DAYS = 730;

/** The days a since question can start on: 730 days back to yesterday. */
export function sinceStartBounds(today: string): { min: string; max: string } {
  return {
    min: addDays(today, -SINCE_MAX_START_DAYS),
    max: addDays(today, -1),
  };
}

/** A picked start kept inside those bounds, so one that has aged out is not refused. */
export function clampSinceStart(day: string, today: string): string {
  const { min, max } = sinceStartBounds(today);
  if (compareDays(day, min) < 0) return min;
  if (compareDays(day, max) > 0) return max;
  return day;
}

// Sleep is dated by the wake day, so caffeine "that night" is timing +1.
export const SUGGESTED_QUESTIONS: readonly CompareQuestion[] = [
  { a: 'timeAsleep', b: 'energy', choice: 'sameDay' },
  { a: 'meditated', b: 'mood', choice: 'sameDay' },
  { a: 'caffeine', b: 'timeAsleep', choice: 'nextDay' },
  { a: 'trainingLoad', b: 'overnightHrv', choice: 'nextDay' },
];

const MAX_RECENT = 5;

export function isCompareMetricKey(value: unknown): value is CompareMetricKey {
  return typeof value === 'string' && Object.hasOwn(COMPARE_METRICS, value);
}

function isTimingChoice(value: unknown): value is CompareTimingChoice {
  return typeof value === 'string' && Object.hasOwn(TIMINGS, value);
}

/**
 * The stored questions this build still knows. Recents are persisted on the
 * device, so a metric or timing renamed or removed since is dropped here
 * rather than reaching the copy, which would throw on it.
 */
export function knownCompareQuestions(stored: unknown): CompareQuestion[] {
  if (!Array.isArray(stored)) return [];
  return stored.flatMap((item: unknown): CompareQuestion[] => {
    if (typeof item !== 'object' || item === null) return [];
    const { a, b, choice } = item as Record<string, unknown>;
    return isCompareMetricKey(a) &&
      isCompareMetricKey(b) &&
      isTimingChoice(choice)
      ? [{ a, b, choice }]
      : [];
  });
}

export function withRecentQuestion(
  recent: readonly CompareQuestion[],
  q: CompareQuestion
): CompareQuestion[] {
  const rest = knownCompareQuestions(recent).filter(
    (r) => !(r.a === q.a && r.b === q.b && r.choice === q.choice)
  );
  return [q, ...rest].slice(0, MAX_RECENT);
}

export function isAskable(q: Partial<CompareQuestion>): q is CompareQuestion {
  const { a, b, choice } = q;
  if (!a || !b || !choice || a === b) return false;
  if (timingOf(choice).mode === 'week') {
    return (
      COMPARE_METRICS[a].weekly !== null && COMPARE_METRICS[b].weekly !== null
    );
  }
  return true;
}
