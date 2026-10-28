import type {
  IntervalPlan,
  IntervalStep,
  LoadStatus,
  PaceBand,
  RecoveryHint,
  StepEffort,
} from '@workspace/shared';

/**
 * Today's program workout laid out as a session: what it is, how long, and
 * the steps in order with the heart-rate zone and pace each one is run at.
 * Pure, so the card only words it.
 */

export type SessionLabelId =
  | 'warmup'
  | 'cooldown'
  | 'easy'
  | 'tempo'
  | 'marathon'
  | 'hill'
  | 'stride'
  | 'fast'
  | 'run'
  | 'walk'
  | 'briskWalk';

export type SessionKind =
  | 'easy'
  | 'long'
  | 'tempo'
  | 'marathon'
  | 'hills'
  | 'strides'
  | 'intervals'
  | 'runWalk'
  | 'briskWalk';

/** The pace ranges a plan's stretches are run at, as `useSuggestedRanges` builds them. */
export interface SessionPaces {
  work: PaceBand;
  easy: PaceBand;
  warm: PaceBand;
  byEffort: Partial<Record<StepEffort, PaceBand>> | null;
}

export interface SessionStep {
  label: SessionLabelId;
  seconds: number;
  /** A distance step: shown in metres instead of minutes. */
  meters: number | null;
  /** 1 (easiest) to 5. */
  zone: number;
  /** Null when there is no honest range to quote (a beginner's run/walk). */
  pace: PaceBand | null;
}

export interface SessionRow {
  /** A step, or a pair of steps repeated `count` times. */
  step: SessionStep;
  recovery: SessionStep | null;
  count: number;
}

export interface RecommendedSession {
  kind: SessionKind;
  totalSeconds: number;
  /** The zone of the hardest stretch. */
  topZone: number;
  rows: SessionRow[];
}

const ZONE_BY_LABEL: Record<SessionLabelId, number> = {
  warmup: 2,
  cooldown: 2,
  easy: 2,
  walk: 2,
  run: 2,
  briskWalk: 2,
  tempo: 3,
  marathon: 3,
  hill: 4,
  fast: 4,
  stride: 5,
};

function labelFor(
  step: IntervalStep,
  style: IntervalPlan['style'],
  hasRecovery: boolean
): SessionLabelId {
  if (step.kind === 'warmup') return 'warmup';
  if (step.kind === 'cooldown') return 'cooldown';
  if (step.kind === 'recovery') return style === 'runWalk' ? 'walk' : 'easy';
  switch (step.effort) {
    case 'tempo':
    case 'marathon':
    case 'hill':
    case 'stride':
      return step.effort;
    case 'easy':
      return 'easy';
    default:
      // Fast stretches come in pairs with an easy one; a lone stretch is a run.
      return style === 'fastEasy'
        ? hasRecovery
          ? 'fast'
          : 'easy'
        : style === 'briskWalk'
          ? 'briskWalk'
          : 'run';
  }
}

function paceFor(
  step: IntervalStep,
  label: SessionLabelId,
  style: IntervalPlan['style'],
  paces: SessionPaces | null
): PaceBand | null {
  if (step.pace) return step.pace;
  if (!paces) return null;
  switch (label) {
    case 'warmup':
    case 'cooldown':
      return paces.warm;
    case 'easy':
      return style === 'fastEasy' || step.kind === 'work' ? paces.easy : null;
    case 'tempo':
    case 'marathon':
    case 'hill':
    case 'stride':
      return paces.byEffort?.[label] ?? null;
    case 'fast':
      return paces.work;
    default:
      return null;
  }
}

const sameStep = (a: SessionStep, b: SessionStep): boolean =>
  a.label === b.label && a.seconds === b.seconds && a.meters === b.meters;

/** Folds a run of the same step, or of the same pair of steps, into one row. */
function foldRows(steps: SessionStep[]): SessionRow[] {
  const rows: SessionRow[] = [];
  let i = 0;
  while (i < steps.length) {
    const a = steps[i]!;
    const b = steps[i + 1];
    if (b && !sameStep(a, b)) {
      let count = 1;
      while (
        steps[i + count * 2] &&
        steps[i + count * 2 + 1] &&
        sameStep(a, steps[i + count * 2]!) &&
        sameStep(b, steps[i + count * 2 + 1]!)
      ) {
        count += 1;
      }
      if (count >= 2) {
        rows.push({ step: a, recovery: b, count });
        i += count * 2;
        continue;
      }
    }
    let count = 1;
    while (steps[i + count] && sameStep(a, steps[i + count]!)) count += 1;
    rows.push({ step: a, recovery: null, count });
    i += count;
  }
  return rows;
}

const LONG_RUN_SECONDS = 75 * 60;

export function buildRecommendedSession(
  plan: IntervalPlan,
  paces: SessionPaces | null
): RecommendedSession {
  const hasRecovery = plan.steps.some((s) => s.kind === 'recovery');
  const steps: SessionStep[] = plan.steps.map((step) => {
    const label = labelFor(step, plan.style, hasRecovery);
    return {
      label,
      seconds: step.seconds,
      meters: step.meters ?? null,
      zone: ZONE_BY_LABEL[label],
      pace: paceFor(step, label, plan.style, paces),
    };
  });
  const labels = new Set(steps.map((s) => s.label));
  const totalSeconds = plan.steps.reduce((sum, s) => sum + s.seconds, 0);
  const kind: SessionKind = labels.has('tempo')
    ? 'tempo'
    : labels.has('marathon')
      ? 'marathon'
      : labels.has('hill')
        ? 'hills'
        : labels.has('fast')
          ? 'intervals'
          : labels.has('stride')
            ? 'strides'
            : labels.has('run') || labels.has('walk')
              ? 'runWalk'
              : labels.has('briskWalk')
                ? 'briskWalk'
                : totalSeconds >= LONG_RUN_SECONDS
                  ? 'long'
                  : 'easy';
  return {
    kind,
    totalSeconds,
    topZone: Math.max(1, ...steps.map((s) => s.zone)),
    rows: foldRows(steps),
  };
}

export type SessionReason =
  'takeRest' | 'ready' | 'steady' | 'low' | 'high' | null;

/**
 * Why the session fits today, from the training-load verdict. Null while there
 * is too little history to say anything.
 */
export function sessionReason(
  status: LoadStatus | undefined,
  recovery: RecoveryHint | undefined
): SessionReason {
  if (!status || status === 'noData' || status === 'learning') return null;
  if (recovery === 'takeRest') return 'takeRest';
  if (recovery === 'ready') return 'ready';
  if (status === 'steady') return 'steady';
  if (status === 'low') return 'low';
  return 'high';
}
