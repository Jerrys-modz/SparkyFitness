import type { IntervalPlan } from '@workspace/shared';
import {
  buildRecommendedSession,
  sessionReason,
  type SessionPaces,
} from '../../src/utils/recommendedSession';

const band = (min: number, max: number) => ({
  minSecondsPerKm: min,
  maxSecondsPerKm: max,
});

const PACES: SessionPaces = {
  work: band(270, 290),
  easy: band(330, 350),
  warm: band(340, 380),
  byEffort: { tempo: band(295, 305) },
};

const tempoPlan: IntervalPlan = {
  style: 'fastEasy',
  steps: [
    { kind: 'warmup', seconds: 600 },
    { kind: 'work', seconds: 1200, effort: 'tempo' },
    { kind: 'cooldown', seconds: 600 },
  ],
};

describe('buildRecommendedSession', () => {
  it('lays out a tempo session with a zone and pace for each part', () => {
    const session = buildRecommendedSession(tempoPlan, PACES);
    expect(session.kind).toBe('tempo');
    expect(session.totalSeconds).toBe(2400);
    expect(session.topZone).toBe(3);
    expect(session.rows.map((r) => [r.step.label, r.step.zone])).toEqual([
      ['warmup', 2],
      ['tempo', 3],
      ['cooldown', 2],
    ]);
    expect(session.rows[1]!.step.pace).toEqual(band(295, 305));
    expect(session.rows[0]!.step.pace).toEqual(band(340, 380));
  });

  it('folds repeated work and recovery into one row', () => {
    const session = buildRecommendedSession(
      {
        style: 'fastEasy',
        steps: [
          { kind: 'warmup', seconds: 600 },
          ...Array.from({ length: 6 }, () => [
            { kind: 'work' as const, seconds: 60 },
            { kind: 'recovery' as const, seconds: 90 },
          ]).flat(),
          { kind: 'cooldown', seconds: 600 },
        ],
      },
      PACES
    );
    expect(session.kind).toBe('intervals');
    expect(session.rows).toHaveLength(3);
    const repeat = session.rows[1]!;
    expect(repeat.count).toBe(6);
    expect(repeat.step.label).toBe('fast');
    expect(repeat.recovery?.label).toBe('easy');
  });

  it('keeps distance steps in metres', () => {
    const session = buildRecommendedSession(
      {
        style: 'fastEasy',
        steps: [
          { kind: 'work', seconds: 90, meters: 400 },
          { kind: 'recovery', seconds: 120 },
          { kind: 'work', seconds: 90, meters: 400 },
          { kind: 'recovery', seconds: 120 },
        ],
      },
      PACES
    );
    expect(session.rows[0]!.count).toBe(2);
    expect(session.rows[0]!.step.meters).toBe(400);
  });

  it('quotes no pace for a beginner run/walk', () => {
    const session = buildRecommendedSession(
      {
        style: 'runWalk',
        steps: [
          { kind: 'warmup', seconds: 300 },
          { kind: 'work', seconds: 60 },
          { kind: 'recovery', seconds: 90 },
          { kind: 'work', seconds: 60 },
          { kind: 'recovery', seconds: 90 },
          { kind: 'cooldown', seconds: 300 },
        ],
      },
      PACES
    );
    expect(session.kind).toBe('runWalk');
    expect(session.rows[1]!.step.pace).toBeNull();
    expect(session.rows[1]!.recovery?.label).toBe('walk');
  });

  it('works without any pace ranges and calls a long easy run long', () => {
    const session = buildRecommendedSession(
      { style: 'fastEasy', steps: [{ kind: 'work', seconds: 90 * 60 }] },
      null
    );
    expect(session.kind).toBe('long');
    expect(session.rows[0]!.step.pace).toBeNull();
  });
});

describe('sessionReason', () => {
  it('says nothing while there is too little history', () => {
    expect(sessionReason('noData', 'ok')).toBeNull();
    expect(sessionReason('learning', 'ready')).toBeNull();
    expect(sessionReason(undefined, undefined)).toBeNull();
  });

  it('puts the rest nudge ahead of the status', () => {
    expect(sessionReason('high', 'takeRest')).toBe('takeRest');
    expect(sessionReason('low', 'ready')).toBe('ready');
    expect(sessionReason('steady', 'ok')).toBe('steady');
    expect(sessionReason('low', 'ok')).toBe('low');
    expect(sessionReason('spike', 'ok')).toBe('high');
  });
});
