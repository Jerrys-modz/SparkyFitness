import {
  pinnedTrendKeys,
  pinsActivePoints,
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
