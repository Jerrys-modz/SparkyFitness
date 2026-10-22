import type { RouteGhost } from '@workspace/shared';
import {
  ghostLead,
  ghostSecondsAt,
  raceLabel,
  raceTimeText,
} from '../../src/utils/routeRace';

// A 250 m route: 100 m in 30 s, 200 m in 70 s, the finish (250 m) in 100 s.
const ghost: RouteGhost = {
  entryId: 'e1',
  durationSeconds: 100,
  intervalM: 100,
  splits: [30, 70, 100],
  source: 'track',
};

describe('ghostSecondsAt', () => {
  it('reads the pace line at a knot', () => {
    expect(ghostSecondsAt(ghost, 250, 100)).toBe(30);
    expect(ghostSecondsAt(ghost, 250, 200)).toBe(70);
  });

  it('interpolates inside a stretch', () => {
    expect(ghostSecondsAt(ghost, 250, 50)).toBe(15);
    expect(ghostSecondsAt(ghost, 250, 150)).toBe(50);
    // The last stretch is only 50 m long.
    expect(ghostSecondsAt(ghost, 250, 225)).toBe(85);
  });

  it('is null at the start, past the finish and for hostile inputs', () => {
    expect(ghostSecondsAt(ghost, 250, 0)).toBeNull();
    expect(ghostSecondsAt(ghost, 250, -5)).toBeNull();
    expect(ghostSecondsAt(ghost, 250, 250)).toBeNull();
    expect(ghostSecondsAt(ghost, 250, 900)).toBeNull();
    expect(ghostSecondsAt(ghost, 250, Number.NaN)).toBeNull();
    expect(ghostSecondsAt(ghost, 0, 50)).toBeNull();
    expect(ghostSecondsAt({ ...ghost, splits: [] }, 250, 50)).toBeNull();
    expect(ghostSecondsAt({ ...ghost, intervalM: 0 }, 250, 50)).toBeNull();
  });
});

describe('ghostLead', () => {
  it('is positive when ahead of the best run and negative behind it', () => {
    expect(ghostLead(ghost, 250, 100, 25)).toBe(5);
    expect(ghostLead(ghost, 250, 100, 38)).toBe(-8);
    expect(ghostLead(ghost, 250, 100, 30)).toBe(0);
  });

  it('is null without a ghost or a usable clock', () => {
    expect(ghostLead(null, 250, 100, 25)).toBeNull();
    expect(ghostLead(ghost, 250, 100, -1)).toBeNull();
    expect(ghostLead(ghost, 250, 100, Number.NaN)).toBeNull();
  });
});

describe('raceTimeText and raceLabel', () => {
  const t = ((key: string, options: { defaultValue: string; time?: string }) =>
    options.defaultValue.replace('{{time}}', options.time ?? '')) as never;

  it('formats seconds, then minutes', () => {
    expect(raceTimeText(12)).toBe('12 s');
    expect(raceTimeText(-65)).toBe('1:05');
  });

  it('labels ahead, behind and level, and nothing for no lead', () => {
    expect(raceLabel(12, t)).toEqual({ text: 'Ahead 12 s', tone: 'ahead' });
    expect(raceLabel(-8, t)).toEqual({ text: 'Behind 8 s', tone: 'behind' });
    expect(raceLabel(0, t)?.tone).toBe('ahead');
    expect(raceLabel(null, t)).toBeNull();
    expect(raceLabel(Number.NaN, t)).toBeNull();
  });
});
