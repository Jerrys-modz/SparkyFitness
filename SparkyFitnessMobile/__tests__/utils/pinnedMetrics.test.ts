import {
  coveredPinnedKeys,
  pickGlanceMetrics,
  pinnedTrendKeys,
  pinsActivePoints,
  resolveGlanceCandidates,
  resolvePinnedMetrics,
} from '../../src/utils/pinnedMetrics';

describe('resolvePinnedMetrics', () => {
  it('keeps registry order and splits rings from trends', () => {
    expect(
      resolvePinnedMetrics(['trend:sleep', 'ring:move', 'ring:steps'])
    ).toEqual([
      { kind: 'ring', key: 'move', pinned: 'ring:move' },
      { kind: 'ring', key: 'steps', pinned: 'ring:steps' },
      { kind: 'trend', key: 'sleep', pinned: 'trend:sleep' },
    ]);
  });

  it('resolves nutrition and hydration goals and the extra trends', () => {
    expect(
      resolvePinnedMetrics(['trend:hydration', 'goal:water', 'goal:protein'])
    ).toEqual([
      { kind: 'goal', key: 'protein', pinned: 'goal:protein' },
      { kind: 'goal', key: 'water', pinned: 'goal:water' },
      { kind: 'trend', key: 'hydration', pinned: 'trend:hydration' },
    ]);
  });

  it('drops keys the registry does not know', () => {
    expect(resolvePinnedMetrics(['ring:bogus', 'trend:gone'])).toEqual([]);
  });
});

describe('pinned metric helpers', () => {
  const metrics = resolvePinnedMetrics(['ring:points', 'trend:weight']);

  it('lists only the trends to load', () => {
    expect(pinnedTrendKeys(metrics)).toEqual(['weight']);
  });

  it('knows when Active points is pinned', () => {
    expect(pinsActivePoints(metrics)).toBe(true);
    expect(pinsActivePoints(resolvePinnedMetrics(['ring:move']))).toBe(false);
  });
});

describe('glance strip selection', () => {
  const none = {
    activityRings: null,
    exercise: false,
    calorieRing: false,
    macros: false,
    hydration: false,
  };

  it('lists automatic candidates best first and a manual pick in registry order', () => {
    expect(
      resolveGlanceCandidates(true, [])
        .map((m) => m.pinned)
        .slice(0, 3)
    ).toEqual(['goal:calories', 'ring:steps', 'trend:sleep']);
    expect(
      resolveGlanceCandidates(false, ['trend:sleep', 'ring:move']).map(
        (m) => m.pinned
      )
    ).toEqual(['ring:move', 'trend:sleep']);
  });

  it('works out which metrics other visible cards already show', () => {
    const covered = coveredPinnedKeys({
      activityRings: ['move', 'steps'],
      exercise: true,
      calorieRing: true,
      macros: true,
      hydration: true,
    });
    expect(covered.has('ring:steps')).toBe(true);
    expect(covered.has('ring:exercise')).toBe(true);
    expect(covered.has('goal:calories')).toBe(true);
    expect(covered.has('goal:protein')).toBe(true);
    expect(covered.has('goal:water')).toBe(true);
    expect(covered.has('trend:sleep')).toBe(false);
  });

  it('automatic mode skips covered and empty metrics and stops at four', () => {
    const picked = pickGlanceMetrics({
      auto: true,
      candidates: resolveGlanceCandidates(true, []),
      covered: coveredPinnedKeys({ ...none, calorieRing: true }),
      hasData: (metric) => metric.pinned !== 'trend:sleep',
    });
    expect(picked.map((m) => m.pinned)).toEqual([
      'ring:steps',
      'trend:weight',
      'goal:protein',
      'goal:water',
    ]);
  });

  it('a manual pick keeps what was chosen even when a card shows it, minus empty ones', () => {
    const picked = pickGlanceMetrics({
      auto: false,
      candidates: resolveGlanceCandidates(false, [
        'goal:calories',
        'trend:vo2max',
      ]),
      covered: coveredPinnedKeys({ ...none, calorieRing: true }),
      hasData: (metric) => metric.pinned !== 'trend:vo2max',
    });
    expect(picked.map((m) => m.pinned)).toEqual(['goal:calories']);
  });
});
