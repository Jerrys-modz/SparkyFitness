import type { IntervalPlan } from '@workspace/shared';
import { workoutFocus } from '../../src/utils/programWorkoutFocus';

const step = (
  kind: 'warmup' | 'work' | 'recovery' | 'cooldown',
  seconds: number,
  effort?: IntervalPlan['steps'][number]['effort']
) => ({ kind, seconds, ...(effort ? { effort } : {}) });

describe('workoutFocus', () => {
  it('reads a run/walk plan as run/walk intervals in zone 2', () => {
    expect(
      workoutFocus({
        style: 'runWalk',
        steps: [step('warmup', 300), step('work', 60), step('recovery', 90)],
      })
    ).toEqual({ focus: 'runWalk', zone: 2 });
  });

  it('reads fast stretches with recoveries as intervals in zone 4', () => {
    expect(
      workoutFocus({
        style: 'fastEasy',
        steps: [step('work', 120), step('recovery', 120), step('work', 120)],
      })
    ).toEqual({ focus: 'intervals', zone: 4 });
  });

  it('names a tempo run by its effort', () => {
    expect(
      workoutFocus({
        style: 'fastEasy',
        steps: [step('warmup', 600), step('work', 1200, 'tempo')],
      })
    ).toEqual({ focus: 'tempo', zone: 3 });
  });

  it('calls a long easy run a long run and a short one easy', () => {
    expect(
      workoutFocus({ style: 'fastEasy', steps: [step('work', 80 * 60)] }).focus
    ).toBe('long');
    expect(
      workoutFocus({ style: 'fastEasy', steps: [step('work', 30 * 60)] }).focus
    ).toBe('easy');
  });

  it('puts strides in zone 5', () => {
    expect(
      workoutFocus({
        style: 'fastEasy',
        steps: [step('work', 1800, 'easy'), step('work', 20, 'stride')],
      })
    ).toEqual({ focus: 'strides', zone: 5 });
  });
});
