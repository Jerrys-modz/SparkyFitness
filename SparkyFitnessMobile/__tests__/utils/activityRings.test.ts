import {
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
