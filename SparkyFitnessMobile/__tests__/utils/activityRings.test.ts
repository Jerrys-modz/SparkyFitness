import {
  activePointsFromZones,
  buildActivityRings,
  resolveActivityRingKeys,
} from '../../src/utils/activityRings';

describe('resolveActivityRingKeys', () => {
  it('draws Move and Exercise for the apple style whatever was picked', () => {
    expect(resolveActivityRingKeys('apple', ['steps'])).toEqual([
      'move',
      'exercise',
    ]);
  });

  it('keeps registry order and drops unknown keys for a custom pick', () => {
    expect(
      resolveActivityRingKeys('custom', ['steps', 'bogus', 'move'])
    ).toEqual(['move', 'steps']);
  });

  it('falls back to the apple pair when a custom pick is empty', () => {
    expect(resolveActivityRingKeys('custom', [])).toEqual(['move', 'exercise']);
  });
});

describe('buildActivityRings', () => {
  const values = {
    move: { current: 250, goal: 500 },
    exercise: { current: 45, goal: 30 },
    steps: { current: 3000, goal: 0 },
    points: { current: 0, goal: 22 },
  };

  it('computes progress, letting an over-goal ring pass 1', () => {
    const rings = buildActivityRings(['move', 'exercise'], values);
    expect(rings.map((r) => r.progress)).toEqual([0.5, 1.5]);
  });

  it('reads a ring with no goal as empty, not full', () => {
    const [ring] = buildActivityRings(['steps'], values);
    expect(ring.progress).toBe(0);
    expect(ring.current).toBe(3000);
  });
});

describe('activePointsFromZones', () => {
  it('counts zones 2-3 once and zones 4-5 twice, per minute', () => {
    expect(
      activePointsFromZones([
        { zone: 1, seconds: 1800 },
        { zone: 2, seconds: 600 },
        { zone: 3, seconds: 600 },
        { zone: 4, seconds: 300 },
        { zone: 5, seconds: 300 },
      ])
    ).toBe(10 + 10 + 10 + 10);
  });

  it('is zero without zone data', () => {
    expect(activePointsFromZones(null)).toBe(0);
    expect(activePointsFromZones([])).toBe(0);
  });
});

describe('google style', () => {
  it('draws Exercise minutes and Active points', () => {
    expect(resolveActivityRingKeys('google', ['steps'])).toEqual([
      'exercise',
      'points',
    ]);
  });
});
