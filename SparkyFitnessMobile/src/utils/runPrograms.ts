import type { IntervalPlan, IntervalStep } from './intervals';

/**
 * Multi-week run programs: an ordered list of workouts, each one an interval
 * plan. Pure data and maths; the person's place in a program is kept by
 * `services/runProgramService.ts`.
 */

export interface ProgramWorkout {
  /** 0-based week. */
  week: number;
  /** 0-based workout within the week. */
  day: number;
  plan: IntervalPlan;
}

export interface RunProgram {
  /** Stable id, also the translation key suffix. */
  id: string;
  workouts: ProgramWorkout[];
  weeks: number;
  workoutsPerWeek: number;
}

type Piece = readonly ['run' | 'walk', number];

const WARMUP_SECONDS = 5 * 60;
const COOLDOWN_SECONDS = 5 * 60;

/** A 5 minute walk, the given run/walk pieces, then a 5 minute walk. */
function workout(pieces: readonly Piece[]): IntervalPlan {
  const steps: IntervalStep[] = [{ kind: 'warmup', seconds: WARMUP_SECONDS }];
  for (const [kind, seconds] of pieces) {
    steps.push({ kind: kind === 'run' ? 'work' : 'recovery', seconds });
  }
  steps.push({ kind: 'cooldown', seconds: COOLDOWN_SECONDS });
  return { style: 'runWalk', steps };
}

const repeat = (count: number, pieces: readonly Piece[]): Piece[] =>
  Array.from({ length: count }, () => pieces).flat();

const run = (seconds: number): Piece => ['run', seconds];
const walk = (seconds: number): Piece => ['walk', seconds];

// A nine-week beginner progression from alternating minutes of running and
// walking to 30 minutes of running, three workouts a week. Each week lists its
// three workouts; a week that repeats one workout lists it three times.
const BEGINNER_5K_WEEKS: readonly (readonly (readonly Piece[])[])[] = [
  Array(3).fill(repeat(8, [run(60), walk(90)])),
  Array(3).fill(repeat(6, [run(90), walk(120)])),
  Array(3).fill(repeat(2, [run(90), walk(90), run(180), walk(180)])),
  Array(3).fill([
    run(180),
    walk(90),
    run(300),
    walk(150),
    run(180),
    walk(90),
    run(300),
  ]),
  [
    [run(300), walk(180), run(300), walk(180), run(300)],
    [run(480), walk(300), run(480)],
    [run(1200)],
  ],
  [
    [run(300), walk(180), run(480), walk(180), run(300)],
    [run(600), walk(180), run(600)],
    [run(1320)],
  ],
  Array(3).fill([run(1500)]),
  Array(3).fill([run(1680)]),
  Array(3).fill([run(1800)]),
];

function buildProgram(
  id: string,
  weeks: readonly (readonly (readonly Piece[])[])[]
): RunProgram {
  const workouts = weeks.flatMap((days, week) =>
    days.map((pieces, day) => ({ week, day, plan: workout(pieces) }))
  );
  return {
    id,
    workouts,
    weeks: weeks.length,
    workoutsPerWeek: weeks[0]?.length ?? 0,
  };
}

export const RUN_PROGRAMS: readonly RunProgram[] = [
  buildProgram('beginner5k', BEGINNER_5K_WEEKS),
];

export function findProgram(id: string): RunProgram | null {
  return RUN_PROGRAMS.find((program) => program.id === id) ?? null;
}

/** Where a person stands in a program. */
export interface ProgramProgress {
  programId: string;
  /**
   * Whether the person is using the program. Off keeps their place but stops
   * the Record screen choosing its workouts and the reminders. Absent in
   * older stored data, which means on.
   */
  enabled?: boolean;
  /** Index of the next workout to do; equals the length when finished. */
  next: number;
}

export interface ProgramStatus {
  program: RunProgram;
  /** The next workout, or null when every workout is done. */
  workout: ProgramWorkout | null;
  /** Workouts finished so far. */
  done: number;
  total: number;
  finished: boolean;
}

/** Resolves stored progress against the program, clamping a stale index. */
export function programStatus(progress: ProgramProgress): ProgramStatus | null {
  const program = findProgram(progress.programId);
  if (!program) return null;
  const total = program.workouts.length;
  const next = Math.min(Math.max(0, Math.floor(progress.next)), total);
  return {
    program,
    workout: program.workouts[next] ?? null,
    done: next,
    total,
    finished: next >= total,
  };
}

/** Moves on from workout `index`, but only if it is the one due. */
export function advanceProgress(
  progress: ProgramProgress,
  completedIndex: number
): ProgramProgress {
  return completedIndex === progress.next
    ? { ...progress, next: progress.next + 1 }
    : progress;
}

/** Total time of a plan in whole minutes, for a one-line description. */
export function planMinutes(plan: IntervalPlan): number {
  return Math.round(plan.steps.reduce((sum, s) => sum + s.seconds, 0) / 60);
}
