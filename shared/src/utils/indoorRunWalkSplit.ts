/**
 * Splits an indoor run's distance between its running and its walking.
 *
 * A watch estimates indoor distance from its pedometer, and that estimate is
 * not off by the same share at every speed: slow walking reads short while a
 * steady run reads long. A treadmill's total only fixes their sum, so scaling
 * the whole series to it leaves the run block too fast and the walking too
 * slow. When the belt speed of the run block is known, that block's distance
 * is its speed times its time, and the rest of the total is the walking.
 *
 * A series is rows of `[active seconds, cumulative metres]`, as the watch
 * records it.
 */

export type DistanceRow = readonly [number, number];

/** A belt slower than this is a walk: there is no run block to separate. */
export const MIN_RUN_BELT_SPEED_MPS = 1.7;
/** A run block shorter than this says too little to split off. */
export const MIN_RUN_BLOCK_SECONDS = 60;
/** The factors have to stay a believable pedometer error, or the split is refused. */
const MIN_FACTOR = 0.5;
const MAX_FACTOR = 2;
/** Rows either side of one that are averaged to judge its speed. */
const SMOOTHING_ROWS = 3;
/** A row is running when its speed is at least this share of the belt's. */
const RUN_SHARE_OF_BELT = 0.7;

export interface IndoorRunWalkSplit {
  /** The series with the run block and the walking each scaled to its share. */
  series: [number, number][];
  /** Multiplies the series' run rows: the run block's true distance over its shown one. */
  runFactor: number;
  /** Multiplies the series' walking rows. */
  walkFactor: number;
  /** Time spent in the run block, in seconds. */
  runSeconds: number;
  /** Distance the series showed for the run block, in metres. */
  shownRunMeters: number;
  /** Distance the run block really covered (belt speed times its time), in metres. */
  runMeters: number;
}

interface Interval {
  seconds: number;
  meters: number;
  running: boolean;
}

function intervalsOf(rows: readonly DistanceRow[]): Interval[] {
  const out: Interval[] = [];
  let lastT = 0;
  let lastM = 0;
  for (const [t, m] of rows) {
    const seconds = t - lastT;
    const meters = m - lastM;
    // Rows out of order, or a counter that went backwards, are not a series
    // this can read.
    if (!(seconds > 0) || meters < 0) return [];
    out.push({ seconds, meters, running: false });
    lastT = t;
    lastM = m;
  }
  return out;
}

/** Marks each interval as running when its smoothed speed is near the belt's. */
function classify(intervals: Interval[], beltSpeedMps: number): void {
  const threshold = beltSpeedMps * RUN_SHARE_OF_BELT;
  for (let i = 0; i < intervals.length; i++) {
    let seconds = 0;
    let meters = 0;
    for (
      let j = Math.max(0, i - SMOOTHING_ROWS);
      j <= Math.min(intervals.length - 1, i + SMOOTHING_ROWS);
      j++
    ) {
      seconds += intervals[j]!.seconds;
      meters += intervals[j]!.meters;
    }
    intervals[i]!.running = seconds > 0 && meters / seconds >= threshold;
  }
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * Rescales `rows` so they end at `totalMeters` with the run block at the belt
 * speed, or null when that cannot be done sensibly: a belt too slow to be a
 * run, a series that has no walking or no running in it, a run block that is
 * too short, a total smaller than the run block, or factors outside what a
 * pedometer could be off by. The caller falls back to scaling the whole
 * series by one factor then.
 */
export function splitIndoorRunWalk(
  rows: readonly DistanceRow[],
  totalMeters: number,
  beltSpeedMps: number
): IndoorRunWalkSplit | null {
  if (!(totalMeters > 0) || !(beltSpeedMps >= MIN_RUN_BELT_SPEED_MPS)) {
    return null;
  }
  if (rows.length < 4) return null;
  const intervals = intervalsOf(rows);
  if (intervals.length === 0) return null;
  classify(intervals, beltSpeedMps);

  let runSeconds = 0;
  let shownRun = 0;
  let shownWalk = 0;
  for (const interval of intervals) {
    if (interval.running) {
      runSeconds += interval.seconds;
      shownRun += interval.meters;
    } else {
      shownWalk += interval.meters;
    }
  }
  if (runSeconds < MIN_RUN_BLOCK_SECONDS) return null;
  if (!(shownRun > 0) || !(shownWalk > 0)) return null;

  const runMeters = beltSpeedMps * runSeconds;
  const walkMeters = totalMeters - runMeters;
  if (!(walkMeters > 0)) return null;

  const runFactor = runMeters / shownRun;
  const walkFactor = walkMeters / shownWalk;
  for (const factor of [runFactor, walkFactor]) {
    if (!(factor >= MIN_FACTOR && factor <= MAX_FACTOR)) return null;
  }

  const series: [number, number][] = [];
  let cumulative = 0;
  intervals.forEach((interval, i) => {
    cumulative += interval.meters * (interval.running ? runFactor : walkFactor);
    series.push([rows[i]![0], round2(cumulative)]);
  });
  return {
    series,
    runFactor,
    walkFactor,
    runSeconds,
    shownRunMeters: shownRun,
    runMeters,
  };
}
