// Statistics for deciding whether two daily series are linked. Pure and dependency-free.

export const Z_95 = 1.959963984540054;

export function mean(xs: readonly number[]): number {
  if (xs.length === 0) return NaN;
  let sum = 0;
  for (const v of xs) sum += v;
  return sum / xs.length;
}

/** Sample standard deviation (n - 1); null when there are fewer than 2 values. */
export function sampleSd(xs: readonly number[]): number | null {
  if (xs.length < 2) return null;
  return Math.sqrt(sampleVariance(xs));
}

function sampleVariance(xs: readonly number[]): number {
  const m = mean(xs);
  let ss = 0;
  for (const v of xs) ss += (v - m) ** 2;
  return ss / (xs.length - 1);
}

/** 1-based ranks, with tied values sharing their average rank. */
export function ranks(xs: readonly number[]): number[] {
  const order = xs.map((_, i) => i).sort((a, b) => xs[a] - xs[b]);
  const out = new Array<number>(xs.length);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && xs[order[j + 1]] === xs[order[i]]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[order[k]] = avg;
    i = j + 1;
  }
  return out;
}

/** Pearson r; null when n < 3, the lengths differ, or either series is constant. */
export function pearson(
  x: readonly number[],
  y: readonly number[]
): number | null {
  const n = x.length;
  if (n < 3 || y.length !== n) return null;
  const mx = mean(x);
  const my = mean(y);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return null;
  return Math.max(-1, Math.min(1, sxy / Math.sqrt(sxx * syy)));
}

/** Spearman rho: Pearson on average ranks. */
export function spearman(
  x: readonly number[],
  y: readonly number[]
): number | null {
  return pearson(ranks(x), ranks(y));
}

/** Lag-1 autocorrelation; 0 when n < 3 or the series is constant. */
export function lag1Autocorrelation(xs: readonly number[]): number {
  const n = xs.length;
  if (n < 3) return 0;
  const m = mean(xs);
  let num = 0;
  let den = 0;
  for (let t = 0; t < n; t++) {
    den += (xs[t] - m) ** 2;
    if (t + 1 < n) num += (xs[t] - m) * (xs[t + 1] - m);
  }
  return den === 0 ? 0 : num / den;
}

/** Effective sample size when both series are autocorrelated; between 4 and n. */
export function effectiveN(n: number, rhoA: number, rhoB: number): number {
  const clamp = (r: number) => Math.min(Math.max(r, 0), 1 - 1e-9);
  const prod = clamp(rhoA) * clamp(rhoB);
  const adjusted = (n * (1 - prod)) / (1 + prod);
  return Math.max(4, Math.min(n, adjusted));
}

function logGamma(z: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  }
  const zz = z - 1;
  let a = c[0];
  const t = zz + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (zz + i);
  return (
    0.5 * Math.log(2 * Math.PI) + (zz + 0.5) * Math.log(t) - t + Math.log(a)
  );
}

// Continued fraction for the incomplete beta function (modified Lentz).
function betaContinuedFraction(x: number, a: number, b: number): number {
  const tiny = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 500; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-15) break;
  }
  return h;
}

// Regularized incomplete beta function I_x(a, b).
function regularizedBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(
    logGamma(a + b) -
      logGamma(a) -
      logGamma(b) +
      a * Math.log(x) +
      b * Math.log(1 - x)
  );
  if (x < (a + 1) / (a + b + 2)) {
    return (front * betaContinuedFraction(x, a, b)) / a;
  }
  return 1 - (front * betaContinuedFraction(1 - x, b, a)) / b;
}

/** Two-sided p-value of Student's t; df may be fractional. */
export function tTwoSidedP(t: number, df: number): number {
  if (Number.isNaN(t) || !(df > 0)) return NaN;
  if (!Number.isFinite(t)) return 0;
  return regularizedBeta(df / (df + t * t), df / 2, 0.5);
}

/** The t value whose two-sided p-value is 0.05. */
export function tCritical95(df: number): number {
  let low = 0;
  let high = 1;
  while (tTwoSidedP(high, df) > 0.05 && high < 1e9) high *= 2;
  for (let i = 0; i < 200; i++) {
    const mid = (low + high) / 2;
    if (tTwoSidedP(mid, df) > 0.05) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

/** p-value and 95% range for a correlation r given an effective sample size. */
export function correlationTest(
  r: number,
  nEff: number
): { p: number; low: number; high: number } {
  if (Math.abs(r) >= 1) return { p: 0, low: r, high: r };
  const df = nEff - 2;
  const t = r * Math.sqrt(df / (1 - r * r));
  const p = df > 0 ? tTwoSidedP(t, df) : 1;
  if (nEff <= 3) return { p, low: -1, high: 1 };
  const z = Math.atanh(r);
  const half = Z_95 / Math.sqrt(nEff - 3);
  return { p, low: Math.tanh(z - half), high: Math.tanh(z + half) };
}

/** Welch's t-test where each group's variance is divided by its effective n. */
export function welch(
  a: readonly number[],
  b: readonly number[],
  nEffA: number,
  nEffB: number
): {
  diff: number;
  se: number;
  df: number;
  p: number;
  low: number;
  high: number;
} {
  const diff = mean(a) - mean(b);
  const va = (sampleSd(a) ?? NaN) ** 2 / nEffA;
  const vb = (sampleSd(b) ?? NaN) ** 2 / nEffB;
  const se = Math.sqrt(va + vb);
  const df = (va + vb) ** 2 / (va ** 2 / (nEffA - 1) + vb ** 2 / (nEffB - 1));
  if (se === 0) {
    return { diff, se, df, p: diff === 0 ? 1 : 0, low: diff, high: diff };
  }
  const p = tTwoSidedP(diff / se, df);
  const margin = tCritical95(df) * se;
  return { diff, se, df, p, low: diff - margin, high: diff + margin };
}
