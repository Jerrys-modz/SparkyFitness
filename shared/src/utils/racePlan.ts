import { addDays, compareDays, dayOfWeek } from './timezone.ts';
import { normalizePaceBand, type PaceBand } from './paceTargets.ts';
import { racePaceZones } from './racePaceZones.ts';
import type { IntervalPlan, IntervalStep, StepEffort } from './runIntervals.ts';

/**
 * A plan for a race: from today to race day, on the weekdays the person runs,
 * with the long run building up, an easier week every fourth week, a taper
 * before the race and the race itself as the last workout. Pure: the words
 * come in through `titles`, and the dates through `today` and `raceDay`.
 */

export type RaceDistance = '5k' | '10k' | 'half' | 'marathon' | '50k' | '100k';
export type RaceLevel = 'new' | 'some' | 'regular' | 'experienced';
/** Road is continuous running. Trail long runs are hike-run, and hills replace intervals. */
export type RaceSurface = 'road' | 'trail';

export const RACE_DISTANCES: readonly RaceDistance[] = [
  '5k',
  '10k',
  'half',
  'marathon',
  '50k',
  '100k',
];
export const RACE_LEVELS: readonly RaceLevel[] = [
  'new',
  'some',
  'regular',
  'experienced',
];
export const RACE_SURFACES: readonly RaceSurface[] = ['road', 'trail'];

const KM: Record<RaceDistance, number> = {
  '5k': 5,
  '10k': 10,
  half: 21.0975,
  marathon: 42.195,
  '50k': 50,
  '100k': 100,
};

/** Fewest weeks that make a sensible build for a distance and starting point. */
const MIN_WEEKS: Record<RaceDistance, Record<RaceLevel, number>> = {
  '5k': { new: 8, some: 6, regular: 4, experienced: 4 },
  '10k': { new: 10, some: 8, regular: 6, experienced: 5 },
  half: { new: 14, some: 12, regular: 10, experienced: 8 },
  marathon: { new: 24, some: 18, regular: 14, experienced: 12 },
  '50k': { new: 24, some: 20, regular: 16, experienced: 14 },
  '100k': { new: 30, some: 26, regular: 22, experienced: 18 },
};

/** The most weeks a plan spans; a race further off starts later. */
export const MAX_RACE_PLAN_WEEKS = 30;

/** Minutes of the long run at the start, by how much the person runs now. */
const START_LONG_MINUTES: Record<RaceLevel, number> = {
  new: 15,
  some: 25,
  regular: 40,
  experienced: 60,
};

/** Minutes of the longest run, a few weeks before the race. */
const PEAK_LONG_MINUTES: Record<RaceDistance, number> = {
  '5k': 45,
  '10k': 75,
  half: 110,
  marathon: 160,
  '50k': 240,
  '100k': 240,
};

/** Weeks of easing off at the end, the race week included. */
const TAPER_WEEKS: Record<RaceDistance, number> = {
  '5k': 1,
  '10k': 1,
  half: 2,
  marathon: 3,
  '50k': 3,
  '100k': 3,
};

/** A guess at an easy-ish race pace, seconds per kilometre, by level. */
const RACE_PACE: Record<RaceLevel, number> = {
  new: 450,
  some: 405,
  regular: 360,
  experienced: 315,
};

export interface RacePlanTitles {
  easy: string;
  long: string;
  tempo: string;
  intervals: string;
  shakeout: string;
  /** "Race day: 10K" style, already put together. */
  race: string;
  /** Used on a trail plan in place of intervals. Falls back to `intervals`. */
  hills?: string;
}

export interface RacePlanInput {
  distance: RaceDistance;
  level: RaceLevel;
  /** YYYY-MM-DD */
  raceDay: string;
  /** YYYY-MM-DD */
  today: string;
  /** Weekdays to run on, 0 = Sunday. The race day's weekday is always added. */
  runDays: readonly number[];
  /** Road unless set. Trail long runs walk the steep parts, and hills replace intervals. */
  surface?: RaceSurface;
  /**
   * Finish time the person is aiming for, in seconds. When it is a possible
   * time for the distance, the race is that long and the workouts carry the
   * paces it implies. A time that cannot be right is ignored.
   */
  goalSeconds?: number;
  titles: RacePlanTitles;
  /**
   * The pace to plan race day at, in seconds per kilometre, for example from a
   * fitness test. Without it the race is planned at a guess for the level.
   */
  racePaceSecondsPerKm?: number;
}

export interface RacePlanWorkout {
  title: string;
  plan: IntervalPlan;
}

export interface RacePlan {
  workouts: RacePlanWorkout[];
  /** The weekdays used, race weekday included. */
  runDays: number[];
  startDay: string;
  endDay: string;
  /** Calendar weeks from the first workout to race day. */
  weeks: number;
  /** Fewest weeks that suit this distance and level. */
  minWeeks: number;
  /** Fewer weeks than that: the plan is not a sensible build. */
  tooShort: boolean;
  /** Minutes of the longest run in the plan, race excluded. */
  peakLongMinutes: number;
  /** The race estimated at, in minutes. The goal time when one was accepted. */
  raceMinutes: number;
  /** True when `goalSeconds` was a possible time and set the paces. */
  goalUsed: boolean;
}

type Session = 'easy' | 'long' | 'tempo' | 'intervals' | 'shakeout' | 'race';

const roundTo = (value: number, step: number) =>
  Math.max(step, Math.round(value / step) * step);
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
const step = (kind: IntervalStep['kind'], minutes: number): IntervalStep => ({
  kind,
  seconds: Math.round(minutes * 60),
});

/**
 * `minutes` of easy running: continuous, or for a beginner early on, a run of
 * `runMinutes` and a minute's walk, repeated, between a short walk each end.
 */
function easyRun(minutes: number, runMinutes: number | null): IntervalPlan {
  if (runMinutes === null) {
    return {
      style: 'runWalk',
      steps: [step('warmup', 5), step('work', minutes - 5)],
    };
  }
  const steps: IntervalStep[] = [step('warmup', 5)];
  let left = minutes - 10;
  while (left > 0) {
    const run = Math.min(runMinutes, left);
    steps.push(step('work', run));
    left -= run;
    if (left > 0) {
      steps.push(step('recovery', Math.min(1, left)));
      left -= 1;
    }
  }
  steps.push(step('cooldown', 5));
  return { style: 'runWalk', steps };
}

function tempo(workMinutes: number): IntervalPlan {
  return {
    style: 'fastEasy',
    steps: [
      step('warmup', 10),
      step('work', workMinutes),
      step('cooldown', 10),
    ],
  };
}

function intervals(repeats: number): IntervalPlan {
  const steps: IntervalStep[] = [step('warmup', 10)];
  for (let i = 0; i < repeats; i++) {
    steps.push(step('work', 3));
    steps.push(step('recovery', i === repeats - 1 ? 0.5 : 2));
  }
  steps.push(step('cooldown', 10));
  return { style: 'fastEasy', steps };
}

function hillRepeats(count: number): IntervalPlan {
  const steps: IntervalStep[] = [step('warmup', 10)];
  for (let i = 0; i < count; i++) {
    steps.push({ ...step('work', 1), effort: 'hill' });
    steps.push(step('recovery', 2));
  }
  steps.push(step('cooldown', 10));
  return { style: 'fastEasy', steps };
}

/** A long trail run: 20 minutes of running, then 5 of walking, until the time is used. */
function hikeRun(minutes: number): IntervalPlan {
  const steps: IntervalStep[] = [step('warmup', 5)];
  let left = Math.max(0, minutes - 10) * 60;
  while (left > 0) {
    const runFor = Math.min(20 * 60, left);
    steps.push({ ...step('work', runFor / 60), effort: 'easy' });
    left -= runFor;
    if (left <= 0) break;
    const walkFor = Math.min(5 * 60, left);
    steps.push(step('recovery', walkFor / 60));
    left -= walkFor;
  }
  steps.push(step('cooldown', 5));
  return { style: 'runWalk', steps };
}

/** Puts a pace on the work steps. Hills are left alone: pace means nothing uphill. */
function stampPace(
  plan: IntervalPlan,
  band: PaceBand | undefined,
  effort?: StepEffort
): IntervalPlan {
  if (!band) return plan;
  return {
    ...plan,
    steps: plan.steps.map((s) =>
      s.kind === 'work' && s.effort !== 'hill'
        ? { ...s, pace: band, ...(effort && !s.effort ? { effort } : {}) }
        : s
    ),
  };
}

const roundPace = (seconds: number): number => Math.round(seconds / 5) * 5;

/** A narrow band around the goal pace, or undefined when it cannot be set. */
function goalRaceBand(seconds: number, km: number): PaceBand | undefined {
  const pace = seconds / km;
  return (
    normalizePaceBand({
      minSecondsPerKm: roundPace(pace * 0.98),
      maxSecondsPerKm: roundPace(pace * 1.04),
    }) ?? undefined
  );
}
function racePlan(raceMinutes: number, level: RaceLevel): IntervalPlan {
  // A step is at most four hours, so a very long race is cut into pieces.
  const pieces: IntervalStep[] = [];
  for (let left = raceMinutes; left > 0; left -= 180) {
    pieces.push(step('work', Math.min(180, left)));
  }
  return {
    style: 'runWalk',
    steps: [
      step('warmup', level === 'new' ? 5 : 10),
      ...pieces,
      step('cooldown', 5),
    ],
  };
}

/** The days a plan has a workout on, first to last. */
function planDays(
  startDay: string,
  raceDay: string,
  days: ReadonlySet<number>,
  offsets: number[]
): string[] {
  const out: string[] = [];
  let offset = 0;
  for (let d = startDay; compareDays(d, raceDay) <= 0; d = addDays(d, 1)) {
    if (days.has(dayOfWeek(d))) {
      out.push(d);
      offsets.push(offset);
    }
    offset++;
  }
  return out;
}

/** A pace worth planning a race at: faster than 2:30 or slower than 12:00 per km is not. */
function usablePace(pace: number | undefined): number | null {
  if (pace === undefined || !Number.isFinite(pace)) return null;
  return pace >= 150 && pace <= 720 ? pace : null;
}

export function buildRacePlan(input: RacePlanInput): RacePlan {
  const { distance, level, raceDay, today, titles } = input;
  const days = new Set([...input.runDays, dayOfWeek(raceDay)]);
  // A race further off than the longest plan starts later.
  const earliest = addDays(raceDay, -(MAX_RACE_PLAN_WEEKS * 7 - 1));
  const startDay = compareDays(today, earliest) < 0 ? earliest : today;
  const offsets: number[] = [];
  const dates = planDays(startDay, raceDay, days, offsets);
  if (dates.length === 0) {
    // The race day is past: nothing to plan.
    return {
      workouts: [],
      runDays: [...days].sort((a, b) => a - b),
      startDay,
      endDay: raceDay,
      weeks: 0,
      minWeeks: MIN_WEEKS[distance][level],
      tooShort: true,
      peakLongMinutes: 0,
      raceMinutes: 0,
      goalUsed: false,
    };
  }
  const surface = input.surface ?? 'road';
  const raceIndex = dates.length - 1;
  const blocks = Math.floor((offsets.at(-1) ?? 0) / 7) + 1;
  const minWeeks = MIN_WEEKS[distance][level];
  const taper = Math.min(TAPER_WEEKS[distance], Math.max(1, blocks - 1));
  const buildBlocks = Math.max(1, blocks - taper);
  const start = START_LONG_MINUTES[level];
  const rawPeak = Math.max(PEAK_LONG_MINUTES[distance], start);
  // A trail long run takes longer for the same climb, and no step passes four hours.
  const peak = Math.min(
    240,
    surface === 'trail' ? roundTo(rawPeak * 1.15, 5) : rawPeak
  );
  const zones =
    input.goalSeconds === undefined
      ? null
      : racePaceZones({
          distanceKm: KM[distance],
          seconds: input.goalSeconds,
        });
  const goalUsed = zones !== null;
  // A goal time sets the race; without one a fitness test's race pace does,
  // and without that the level's usual pace.
  const racePace = usablePace(input.racePaceSecondsPerKm) ?? RACE_PACE[level];
  const raceMinutes = goalUsed
    ? Math.round((input.goalSeconds ?? 0) / 60)
    : Math.round((KM[distance] * racePace) / 60);
  const raceBand = goalUsed
    ? goalRaceBand(input.goalSeconds ?? 0, KM[distance])
    : undefined;

  const longFor = (block: number): number => {
    if (block >= buildBlocks) {
      // Taper: 75%, then lower each week.
      const t = block - buildBlocks;
      return roundTo(peak * Math.max(0.3, 0.75 - 0.2 * t), 5);
    }
    const progress = buildBlocks === 1 ? 1 : block / (buildBlocks - 1);
    let minutes = start + (peak - start) * progress;
    // Every fourth week is lighter, except the last before the taper.
    if ((block + 1) % 4 === 0 && block < buildBlocks - 1) minutes *= 0.75;
    return roundTo(minutes, 5);
  };

  const workouts: RacePlanWorkout[] = [];
  let peakLong = 0;
  // Which week of the plan each workout falls in, counted once.
  const blockOf = offsets.map((o) => Math.floor(o / 7));
  for (let i = 0; i < dates.length; i++) {
    const block = blockOf[i] ?? 0;
    const first = blockOf.indexOf(block);
    const n = blockOf.lastIndexOf(block) - first + 1;
    const position = i - first;
    const progress =
      buildBlocks === 1 ? 1 : Math.min(1, block / (buildBlocks - 1));
    const inTaper = block >= buildBlocks;
    const recovery = (block + 1) % 4 === 0 && block < buildBlocks - 1;

    let session: Session;
    if (i === raceIndex) session = 'race';
    else if (block === blocks - 1) session = 'shakeout';
    else if (position === n - 1) session = 'long';
    else if (
      n >= 4 &&
      position === n - 3 &&
      level !== 'new' &&
      !inTaper &&
      !recovery
    ) {
      session = block % 2 === 0 ? 'tempo' : 'intervals';
    } else session = 'easy';

    const long = longFor(block);
    const easyMinutes = clamp(
      roundTo(long * (level === 'new' ? 0.6 : 0.5), 5),
      level === 'new' ? 15 : 20,
      50
    );
    // A beginner runs for a minute and walks for a minute at first, growing.
    const beginnerRun =
      level === 'new' && !inTaper ? Math.round(1 + progress * 9) : null;
    const runWalk =
      beginnerRun !== null && beginnerRun < 10 ? beginnerRun : null;

    let title: string;
    let plan: IntervalPlan;
    switch (session) {
      case 'race':
        title = titles.race;
        plan = stampPace(racePlan(raceMinutes, level), raceBand);
        break;
      case 'shakeout':
        title = titles.shakeout;
        plan = stampPace(
          easyRun(level === 'new' ? 15 : 20, null),
          zones?.easy,
          'easy'
        );
        break;
      case 'long':
        title = titles.long;
        plan = stampPace(
          surface === 'trail'
            ? hikeRun(Math.max(15, long))
            : easyRun(Math.max(15, long), runWalk),
          zones?.easy,
          'easy'
        );
        peakLong = Math.max(peakLong, long);
        break;
      case 'tempo':
        title = titles.tempo;
        plan = stampPace(
          tempo(clamp(roundTo(long * 0.3, 5), 10, 25)),
          zones?.tempo,
          'tempo'
        );
        break;
      case 'intervals':
        if (surface === 'trail') {
          title = titles.hills ?? titles.intervals;
          plan = hillRepeats(6 + Math.min(4, Math.floor(progress * 4)));
        } else {
          title = titles.intervals;
          plan = stampPace(
            intervals(4 + Math.min(4, Math.floor(progress * 4))),
            zones?.interval
          );
        }
        break;
      default:
        title = titles.easy;
        plan = stampPace(
          easyRun(Math.max(15, easyMinutes), runWalk),
          zones?.easy,
          'easy'
        );
    }
    workouts.push({ title: title.slice(0, 40), plan });
  }

  return {
    workouts,
    runDays: [...days].sort((a, b) => a - b),
    startDay,
    endDay: raceDay,
    weeks: blocks,
    minWeeks,
    tooShort: blocks < minWeeks,
    peakLongMinutes: peakLong,
    raceMinutes,
    goalUsed,
  };
}
