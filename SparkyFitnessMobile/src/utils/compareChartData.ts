import { addDays, type CompareResponse } from '@workspace/shared';

import { compareDisplayValue } from '../constants/compareMetrics';
import type { CompareMode, CompareQuestion } from './compareQuestion';

export interface CompareDot {
  key: string;
  x: number;
  y: number;
}

/**
 * Pairs each of A's keys with B's value at the key shifted by `timing`
 * (days in day mode, weeks in week mode). B's deviations reach past each end
 * of the range, so pairing is by shifted key, never by index.
 */
export function pairedDots(
  response: CompareResponse,
  mode: CompareMode,
  timing: -1 | 0 | 1
): CompareDot[] {
  const shift = mode === 'week' ? 7 * timing : timing;
  const dots: CompareDot[] = [];
  for (const [key, x] of Object.entries(response.deviations.a)) {
    const y = response.deviations.b[addDays(key, shift)];
    if (y !== undefined) dots.push({ key, x, y });
  }
  return dots.sort((p, q) => (p.key < q.key ? -1 : p.key > q.key ? 1 : 0));
}

/** Least-squares line, or null with fewer than two points or no x spread. */
export function trendLine(
  points: readonly { x: number; y: number }[]
): { slope: number; intercept: number } | null {
  const n = points.length;
  if (n < 2) return null;
  const meanX = points.reduce((s, p) => s + p.x, 0) / n;
  const meanY = points.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (const p of points) {
    sxx += (p.x - meanX) ** 2;
    sxy += (p.x - meanX) * (p.y - meanY);
  }
  if (sxx === 0) return null;
  const slope = sxy / sxx;
  return { slope, intercept: meanY - slope * meanX };
}

/** Scales a series to 0-1 over its own values; gaps are null, a constant is 0.5. */
export function scaledSeries(
  values: Record<string, number>,
  keys: readonly string[]
): { key: string; scaled: number | null; raw: number | null }[] {
  const present = Object.values(values);
  const min = present.length ? Math.min(...present) : 0;
  const max = present.length ? Math.max(...present) : 0;
  return keys.map((key) => {
    const raw = values[key];
    if (raw === undefined) return { key, scaled: null, raw: null };
    return { key, scaled: max === min ? 0.5 : (raw - min) / (max - min), raw };
  });
}

function rangeOf(
  values: Record<string, number>
): { min: number; max: number } | null {
  const present = Object.values(values);
  if (present.length === 0) return null;
  return { min: Math.min(...present), max: Math.max(...present) };
}

/** Both raw series scaled 0-1 on a shared, date-ordered key axis, with raw ranges. */
export function overTimeData(response: CompareResponse): {
  rows: { key: string; a: number | null; b: number | null }[];
  aRange: { min: number; max: number } | null;
  bRange: { min: number; max: number } | null;
} {
  const aValues = response.a.values;
  const bValues = response.b.values;
  const keys = [
    ...new Set([...Object.keys(aValues), ...Object.keys(bValues)]),
  ].sort();
  const a = scaledSeries(aValues, keys);
  const b = scaledSeries(bValues, keys);
  return {
    rows: keys.map((key, i) => ({
      key,
      a: a[i].scaled,
      b: b[i].scaled,
    })),
    aRange: rangeOf(aValues),
    bRange: rangeOf(bValues),
  };
}

/** Dots on the display scale (mood 1-10), which is what the person reads off the axes. */
export function displayDots(
  dots: readonly CompareDot[],
  question: Pick<CompareQuestion, 'a' | 'b'>
): CompareDot[] {
  return dots.map((dot) => ({
    key: dot.key,
    x: compareDisplayValue(question.a, dot.x),
    y: compareDisplayValue(question.b, dot.y),
  }));
}
