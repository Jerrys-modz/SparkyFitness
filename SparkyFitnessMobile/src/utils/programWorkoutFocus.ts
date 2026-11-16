import type { TFunction } from 'i18next';
import type { IntervalPlan, IntervalStep } from '@workspace/shared';

/** What a program workout is mainly for, read from its steps. */
export type WorkoutFocus =
  | 'easy'
  | 'long'
  | 'tempo'
  | 'marathon'
  | 'hills'
  | 'strides'
  | 'intervals'
  | 'runWalk'
  | 'briskWalk';

/** A run this long or longer, with nothing harder in it, is a long run. */
const LONG_RUN_SECONDS = 75 * 60;

/** The heart rate zone (1 to 5) each kind of stretch is run in. */
const ZONE_BY_EFFORT = {
  easy: 2,
  zone2: 2,
  tempo: 3,
  marathon: 3,
  hill: 4,
  fast: 4,
  stride: 5,
} as const;

type Effort = keyof typeof ZONE_BY_EFFORT;

/** The effort of one work stretch; null for warm-ups, cool-downs and recoveries. */
function stepEffort(
  step: IntervalStep,
  style: IntervalPlan['style'],
  hasRecovery: boolean
): Effort | 'run' | 'briskWalk' | null {
  if (step.kind !== 'work') return null;
  if (step.effort) return step.effort;
  if (style === 'briskWalk') return 'briskWalk';
  if (style === 'runWalk') return 'run';
  // A fast stretch comes paired with an easy one; a lone stretch is easy.
  return hasRecovery ? 'fast' : 'easy';
}

/**
 * The workout's focus and the zone of its hardest stretch. Pure, so the
 * training programs screen only words it.
 */
export function workoutFocus(plan: IntervalPlan): {
  focus: WorkoutFocus;
  zone: number;
} {
  const hasRecovery = plan.steps.some((s) => s.kind === 'recovery');
  const efforts = new Set(
    plan.steps.map((s) => stepEffort(s, plan.style, hasRecovery))
  );
  const totalSeconds = plan.steps.reduce((sum, s) => sum + s.seconds, 0);
  const zone = Math.max(
    2,
    ...[...efforts].map((e) =>
      e && e in ZONE_BY_EFFORT ? ZONE_BY_EFFORT[e as Effort] : 2
    )
  );
  const focus: WorkoutFocus = efforts.has('tempo')
    ? 'tempo'
    : efforts.has('marathon')
      ? 'marathon'
      : efforts.has('hill')
        ? 'hills'
        : efforts.has('fast')
          ? 'intervals'
          : efforts.has('stride')
            ? 'strides'
            : efforts.has('run')
              ? 'runWalk'
              : efforts.has('briskWalk')
                ? 'briskWalk'
                : totalSeconds >= LONG_RUN_SECONDS
                  ? 'long'
                  : 'easy';
  return { focus, zone };
}

export function workoutFocusLabel(t: TFunction, focus: WorkoutFocus): string {
  switch (focus) {
    case 'easy':
      return t('runPrograms.focus.easy', { defaultValue: 'Easy run' });
    case 'long':
      return t('runPrograms.focus.long', { defaultValue: 'Long run' });
    case 'tempo':
      return t('runPrograms.focus.tempo', { defaultValue: 'Tempo run' });
    case 'marathon':
      return t('runPrograms.focus.marathon', {
        defaultValue: 'Marathon pace',
      });
    case 'hills':
      return t('runPrograms.focus.hills', { defaultValue: 'Hill repeats' });
    case 'strides':
      return t('runPrograms.focus.strides', {
        defaultValue: 'Easy run with strides',
      });
    case 'intervals':
      return t('runPrograms.focus.intervals', { defaultValue: 'Intervals' });
    case 'runWalk':
      return t('runPrograms.focus.runWalk', {
        defaultValue: 'Run/walk intervals',
      });
    case 'briskWalk':
      return t('runPrograms.focus.briskWalk', {
        defaultValue: 'Brisk walk',
      });
  }
}
