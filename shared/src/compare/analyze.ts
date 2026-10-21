// Does A go with B? Each metric is first compared with its own recent normal, so a
// shared drift or trend does not read as a link. Pure and dependency-free.

import { addDays, dayOfWeek, daysBetween } from '../utils/timezone.ts';
import {
  COMPARE_METRICS,
  type CompareMetricKey,
  type CompareMetricKind,
} from './metrics.ts';
import {
  correlationTest,
  effectiveN,
  lag1Autocorrelation,
  mean,
  pearson,
  ranks,
  sampleSd,
  spearman,
  tTwoSidedP,
  welch,
} from './stats.ts';

export type DaySeries = Record<string, number>; // day → value; missing days absent
export type CompareTiming = -1 | 0 | 1;
export type CompareStrength = 'weak' | 'moderate' | 'strong';
export type CompareDirectionCheck =
  'firstComesFirst' | 'strongerOtherWay' | 'cantTell';
export type CompareWeekendCheck = 'holds' | 'mayBeWeekends';

export interface CompareResult {
  status: 'ok' | 'not_enough';
  n: number;
  needed: number; // 14 days / 8 weeks / 5 per yes-no group
  reason?: 'tooFew' | 'noVariation'; // only when not_enough
  method?: 'pearson' | 'spearman' | 'difference';
  nEff?: number;
  r?: number;
  p?: number;
  low?: number;
  high?: number;
  linked?: boolean; // p < 0.05
  strength?: CompareStrength; // only when linked and method is pearson/spearman
  sign?: 'positive' | 'negative';
  binary?: {
    yesKey: CompareMetricKey;
    yesMean: number;
    noMean: number;
    yesCount: number;
    noCount: number;
    diff: number;
  };
  checks: {
    ownNormal: true;
    direction?: CompareDirectionCheck;
    weekend?: CompareWeekendCheck;
  };
}

const DAYS_NEEDED = 14;
const PER_GROUP_NEEDED = 5;
const ALPHA = 0.05;

/** Each day's value minus the mean of the `window` days before it; a day with fewer than `minValues` of them drops out. */
export function deviationsFromOwnNormal(
  series: DaySeries,
  days: readonly string[],
  window = 14,
  minValues = 7
): DaySeries {
  const out: DaySeries = {};
  for (const day of days) {
    const value = valueAt(series, day);
    if (value === undefined) continue;
    const before: number[] = [];
    for (let i = 1; i <= window; i++) {
      const earlier = valueAt(series, addDays(day, -i));
      if (earlier !== undefined) before.push(earlier);
    }
    if (before.length >= minValues) out[day] = value - mean(before);
  }
  return out;
}

/** Pairs A on each day d in start..end with B on d + timing, both against their own normal. */
export function analyzeDays(input: {
  a: { key: CompareMetricKey; values: DaySeries };
  b: { key: CompareMetricKey; values: DaySeries };
  timing: CompareTiming;
  start: string;
  end: string;
}): CompareResult {
  const days = dayRange(input.start, input.end);
  // B can sit a day either side of A: the timing, and the mirrored pairing.
  const around = dayRange(addDays(input.start, -1), addDays(input.end, 1));
  return analyzePairs({
    keys: days,
    a: daySide(input.a, days),
    b: daySide(input.b, around),
    timing: input.timing,
    shift: addDays,
    needed: DAYS_NEEDED,
    isWeekend: (day) => {
      const weekday = dayOfWeek(day);
      return weekday === 0 || weekday === 6;
    },
  });
}

/** A metric ready to pair: deviations from its own normal, or raw 0/1 for a yes/no metric. */
interface Side {
  key: CompareMetricKey;
  kind: CompareMetricKind;
  raw: DaySeries;
  values: DaySeries;
}

function daySide(
  metric: { key: CompareMetricKey; values: DaySeries },
  days: readonly string[]
): Side {
  const kind = COMPARE_METRICS[metric.key].kind;
  const values =
    kind === 'binary'
      ? metric.values
      : deviationsFromOwnNormal(metric.values, days);
  return { key: metric.key, kind, raw: metric.values, values };
}

/** A's keys in order, each paired with B's key `timing` steps later; `shift` moves a key by whole steps. */
interface PairInput {
  keys: readonly string[];
  a: Side;
  b: Side;
  timing: number;
  shift: (key: string, steps: number) => string;
  needed: number;
  isWeekend?: (key: string) => boolean;
}

interface Pairs {
  aKeys: string[];
  bKeys: string[];
  a: number[];
  b: number[];
}

type CorrelationMethod = 'pearson' | 'spearman';

interface Fit {
  r: number;
  nEff: number;
  p: number;
  low: number;
  high: number;
}

/** Pairing, test, verdict and checks; nothing here depends on the keys being days. */
function analyzePairs(input: PairInput): CompareResult {
  const pairs = pairUp(input, input.timing);
  const n = pairs.a.length;
  if (n < input.needed) return notEnough(n, input.needed, 'tooFew');
  if ((input.a.kind === 'binary') !== (input.b.kind === 'binary')) {
    return compareGroups(input, pairs);
  }

  const method: CorrelationMethod =
    input.a.kind === 'ordinal' || input.b.kind === 'ordinal'
      ? 'spearman'
      : 'pearson';
  const fit = correlate(pairs, method);
  if (!fit) return notEnough(n, input.needed, 'noVariation');

  const result: CompareResult = {
    status: 'ok',
    n,
    needed: input.needed,
    method,
    ...fit,
    linked: fit.p < ALPHA,
    checks: { ownNormal: true },
  };
  if (!result.linked) return result;
  result.strength = strengthOf(fit.r);
  result.sign = fit.r > 0 ? 'positive' : 'negative';
  result.checks.direction = directionCheck(input, method, fit.r);
  if (input.isWeekend) {
    result.checks.weekend = weekendCheck(pairs, method, fit, input.isWeekend);
  }
  return result;
}

function pairUp(input: PairInput, timing: number): Pairs {
  const pairs: Pairs = { aKeys: [], bKeys: [], a: [], b: [] };
  for (const aKey of input.keys) {
    const bKey = input.shift(aKey, timing);
    const a = valueAt(input.a.values, aKey);
    const b = valueAt(input.b.values, bKey);
    if (a === undefined || b === undefined) continue;
    pairs.aKeys.push(aKey);
    pairs.bKeys.push(bKey);
    pairs.a.push(a);
    pairs.b.push(b);
  }
  return pairs;
}

/** r with its effective n, p and 95% range; null when either side never varies. */
function correlate(pairs: Pairs, method: CorrelationMethod): Fit | null {
  const r =
    method === 'spearman'
      ? spearman(pairs.a, pairs.b)
      : pearson(pairs.a, pairs.b);
  if (r === null) return null;
  const nEff = effectiveN(
    pairs.a.length,
    lag1Autocorrelation(pairs.a),
    lag1Autocorrelation(pairs.b)
  );
  return { r, nEff, ...correlationTest(r, nEff) };
}

/** Yes days against no days: Welch on the other metric's deviations, each group with its own effective n. */
function compareGroups(input: PairInput, pairs: Pairs): CompareResult {
  const yesOnA = input.a.kind === 'binary';
  const flags = yesOnA ? pairs.a : pairs.b;
  const deviations = yesOnA ? pairs.b : pairs.a;
  const outcome = yesOnA ? input.b : input.a;
  const outcomeKeys = yesOnA ? pairs.bKeys : pairs.aKeys;
  const n = deviations.length;

  const yes = { deviations: [] as number[], raw: [] as number[] };
  const no = { deviations: [] as number[], raw: [] as number[] };
  flags.forEach((flag, i) => {
    const group = flag > 0 ? yes : no;
    group.deviations.push(deviations[i]);
    group.raw.push(outcome.raw[outcomeKeys[i]]);
  });
  const fewest = Math.min(yes.deviations.length, no.deviations.length);
  if (fewest < PER_GROUP_NEEDED) {
    return notEnough(fewest, PER_GROUP_NEEDED, 'tooFew');
  }
  if (!sampleSd(deviations)) return notEnough(n, input.needed, 'noVariation');

  const nEffYes = meanEffectiveN(yes.deviations);
  const nEffNo = meanEffectiveN(no.deviations);
  const test = welch(yes.deviations, no.deviations, nEffYes, nEffNo);
  const result: CompareResult = {
    status: 'ok',
    n,
    needed: input.needed,
    method: 'difference',
    nEff: nEffYes + nEffNo,
    p: test.p,
    low: test.low,
    high: test.high,
    linked: test.p < ALPHA,
    binary: {
      yesKey: (yesOnA ? input.a : input.b).key,
      yesMean: mean(yes.raw),
      noMean: mean(no.raw),
      yesCount: yes.deviations.length,
      noCount: no.deviations.length,
      diff: test.diff,
    },
    checks: { ownNormal: true },
  };
  if (result.linked) result.sign = test.diff > 0 ? 'positive' : 'negative';
  return result;
}

/** Effective n for the mean of one sequence: with the second ρ at 1, effectiveN is n(1 − ρ)/(1 + ρ). */
function meanEffectiveN(xs: readonly number[]): number {
  return effectiveN(xs.length, lag1Autocorrelation(xs), 1);
}

/**
 * The mirrored pairing swaps which comes first: (B_d, A_{d+1}) when timing ≥ 0, else
 * (A_d, B_{d+1}). On A's keys that is B one step earlier, or one step later.
 */
function directionCheck(
  input: PairInput,
  method: CorrelationMethod,
  r: number
): CompareDirectionCheck {
  const mirrored = pairUp(input, input.timing >= 0 ? -1 : 1);
  const fit =
    mirrored.a.length >= input.needed ? correlate(mirrored, method) : null;
  if (!fit) return 'cantTell';
  if (fit.p >= ALPHA) return 'firstComesFirst';
  return Math.abs(fit.r) > Math.abs(r) ? 'strongerOtherWay' : 'cantTell';
}

/** Partial correlation of the pairs controlling for A's key being a weekend, with df = nEff − 3. */
function weekendCheck(
  pairs: Pairs,
  method: CorrelationMethod,
  fit: Fit,
  isWeekend: (key: string) => boolean
): CompareWeekendCheck {
  const x = method === 'spearman' ? ranks(pairs.a) : pairs.a;
  const y = method === 'spearman' ? ranks(pairs.b) : pairs.b;
  const w = pairs.aKeys.map((key) => (isWeekend(key) ? 1 : 0));
  // null when every paired day is a weekday (or a weekend): nothing to control for.
  const rxw = pearson(x, w) ?? 0;
  const ryw = pearson(y, w) ?? 0;
  const scale = Math.sqrt((1 - rxw ** 2) * (1 - ryw ** 2));
  if (scale === 0) return 'mayBeWeekends';
  const partial = Math.max(-1, Math.min(1, (fit.r - rxw * ryw) / scale));
  const df = fit.nEff - 3;
  const p =
    Math.abs(partial) === 1
      ? 0
      : tTwoSidedP(partial * Math.sqrt(df / (1 - partial ** 2)), df);
  return Math.sign(partial) === Math.sign(fit.r) && p < ALPHA
    ? 'holds'
    : 'mayBeWeekends';
}

function strengthOf(r: number): CompareStrength {
  const size = Math.abs(r);
  if (size < 0.3) return 'weak';
  if (size < 0.5) return 'moderate';
  return 'strong';
}

/** `tooFew`: below the minimum. `noVariation`: the minimum is met but a side never varies. */
function notEnough(
  n: number,
  needed: number,
  reason: NonNullable<CompareResult['reason']>
): CompareResult {
  return {
    status: 'not_enough',
    n,
    needed,
    reason,
    checks: { ownNormal: true },
  };
}

function valueAt(series: DaySeries, key: string): number | undefined {
  const value: number | undefined = series[key];
  return value !== undefined && Number.isFinite(value) ? value : undefined;
}

/** Every day from start to end inclusive; empty when end is before start. */
function dayRange(start: string, end: string): string[] {
  const days: string[] = [];
  const count = daysBetween(start, end);
  for (let i = 0; i <= count; i++) days.push(addDays(start, i));
  return days;
}
