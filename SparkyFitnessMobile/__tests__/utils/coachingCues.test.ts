import { buildIntervalPlan } from '@workspace/shared';
import {
  INITIAL_COACHING_STATE,
  nextCoachingCues,
} from '../../src/utils/coachingCues';

// 2 min warm-up, work 3 / recovery 2 / work 3, 3 min cool-down = 13 min.
const plan = buildIntervalPlan({
  style: 'fastEasy',
  warmupSeconds: 120,
  workSeconds: 180,
  recoverySeconds: 120,
  rounds: 2,
  cooldownSeconds: 180,
});

const run = (
  elapsedSeconds: number,
  overrides: Partial<Parameters<typeof nextCoachingCues>[0]> = {}
) =>
  nextCoachingCues({
    elapsedSeconds,
    plan,
    checkInMinutes: 0,
    state: INITIAL_COACHING_STATE,
    ...overrides,
  });

describe('step warnings', () => {
  it('warns ten seconds before a step ends and names what is next', () => {
    const { cues, state } = run(110);
    expect(cues).toEqual([
      { kind: 'stepWarning', next: expect.objectContaining({ kind: 'work' }) },
    ]);
    expect(state.warnedStep).toBe(0);
  });

  it('warns once per step', () => {
    const first = run(112);
    const again = run(115, { state: first.state });
    expect(again.cues).toEqual([]);
  });

  it('says nothing earlier in the step', () => {
    expect(run(60).cues).toEqual([]);
  });

  it('skips steps too short to warn about', () => {
    const short = buildIntervalPlan({
      style: 'runWalk',
      warmupSeconds: 0,
      workSeconds: 20,
      recoverySeconds: 20,
      rounds: 2,
      cooldownSeconds: 0,
    });
    expect(run(15, { plan: short }).cues).toEqual([]);
  });

  it('has no next step to name on the last one', () => {
    const { cues } = run(13 * 60 - 5);
    expect(cues[0]).toEqual({ kind: 'stepWarning', next: null });
  });
});

describe('halfway and the last minute', () => {
  it('calls halfway once past the middle of a long enough plan', () => {
    const first = run(6.5 * 60 + 1);
    expect(first.cues).toEqual([{ kind: 'halfway' }]);
    expect(run(7 * 60, { state: first.state }).cues).toEqual([]);
  });

  it('calls the last minute', () => {
    const first = run(12 * 60 + 5);
    expect(first.cues.map((c) => c.kind)).toContain('lastMinute');
    expect(first.state.lastMinute).toBe(true);
  });

  it('gives short plans neither', () => {
    const tiny = buildIntervalPlan({
      style: 'runWalk',
      warmupSeconds: 0,
      workSeconds: 60,
      recoverySeconds: 60,
      rounds: 1,
      cooldownSeconds: 0,
    });
    expect(run(60, { plan: tiny }).cues.map((c) => c.kind)).not.toContain(
      'halfway'
    );
  });

  it('puts the step warning ahead of the others', () => {
    // 6:50 is both 10 s before the end of the recovery and past halfway.
    const { cues } = run(6 * 60 + 50);
    expect(cues[0]?.kind).toBe('stepWarning');
    expect(cues.map((c) => c.kind)).toContain('halfway');
  });
});

describe('check-ins', () => {
  it('speaks every interval and not before', () => {
    expect(run(299, { plan: null, checkInMinutes: 5 }).cues).toEqual([]);
    const first = run(300, { plan: null, checkInMinutes: 5 });
    expect(first.cues).toEqual([{ kind: 'checkIn', minutes: 5 }]);
    expect(
      run(301, { plan: null, checkInMinutes: 5, state: first.state }).cues
    ).toEqual([]);
    expect(
      run(600, { plan: null, checkInMinutes: 5, state: first.state }).cues
    ).toEqual([{ kind: 'checkIn', minutes: 10 }]);
  });

  it('says only the latest after a long gap', () => {
    const { cues, state } = run(1300, { plan: null, checkInMinutes: 10 });
    expect(cues).toEqual([{ kind: 'checkIn', minutes: 20 }]);
    expect(state.checkIns).toBe(2);
  });

  it('is silent when off', () => {
    expect(run(3000, { plan: null, checkInMinutes: 0 }).cues).toEqual([]);
  });
});
