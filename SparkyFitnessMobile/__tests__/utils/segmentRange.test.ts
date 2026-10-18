import {
  canMakeSegment,
  defaultSegmentRange,
  distanceAtBarPosition,
  handleFraction,
  moveSegmentHandle,
  nudgeSegmentHandle,
  segmentRangeLength,
} from '../../src/utils/segmentRange';

describe('segment range', () => {
  it('needs a line of at least 100 m', () => {
    expect(canMakeSegment(99)).toBe(false);
    expect(canMakeSegment(100)).toBe(true);
  });

  it('starts with the middle third, widened to the minimum on a short line', () => {
    expect(defaultSegmentRange(3000)).toEqual({ startM: 1000, endM: 2000 });
    const short = defaultSegmentRange(150);
    expect(segmentRangeLength(short)).toBeGreaterThanOrEqual(100);
    expect(short.startM).toBeGreaterThanOrEqual(0);
    expect(short.endM).toBeLessThanOrEqual(150);
  });

  it('keeps a default under the 100 km maximum on a very long line', () => {
    const range = defaultSegmentRange(900_000);
    expect(segmentRangeLength(range)).toBeLessThanOrEqual(100_000);
  });

  it('moves a handle and keeps it on the line', () => {
    const range = { startM: 1000, endM: 2000 };
    expect(moveSegmentHandle(range, 'start', 500, 3000)).toEqual({
      startM: 500,
      endM: 2000,
    });
    expect(moveSegmentHandle(range, 'start', -50, 3000)).toEqual({
      startM: 0,
      endM: 2000,
    });
    expect(moveSegmentHandle(range, 'end', 9999, 3000)).toEqual({
      startM: 1000,
      endM: 3000,
    });
  });

  it('never lets the handles come closer than 100 m or cross', () => {
    const range = { startM: 1000, endM: 2000 };
    expect(moveSegmentHandle(range, 'start', 1990, 3000).startM).toBe(1900);
    expect(moveSegmentHandle(range, 'end', 900, 3000).endM).toBe(1100);
  });

  it('never lets a segment grow past 100 km', () => {
    const range = { startM: 0, endM: 100_000 };
    expect(moveSegmentHandle(range, 'end', 200_000, 500_000).endM).toBe(
      100_000
    );
    expect(
      moveSegmentHandle({ startM: 400_000, endM: 450_000 }, 'start', 0, 500_000)
        .startM
    ).toBe(350_000);
  });

  it('nudges by 50 m either way within the limits', () => {
    const range = { startM: 1000, endM: 2000 };
    expect(nudgeSegmentHandle(range, 'start', 1, 3000).startM).toBe(1050);
    expect(nudgeSegmentHandle(range, 'end', -1, 3000).endM).toBe(1950);
    expect(
      nudgeSegmentHandle({ startM: 0, endM: 200 }, 'start', -1, 3000).startM
    ).toBe(0);
    expect(
      nudgeSegmentHandle({ startM: 0, endM: 100 }, 'end', -1, 3000).endM
    ).toBe(100);
  });

  it('maps a touch on the bar to a distance and back', () => {
    expect(distanceAtBarPosition(150, 300, 2000)).toBe(1000);
    expect(distanceAtBarPosition(-20, 300, 2000)).toBe(0);
    expect(distanceAtBarPosition(999, 300, 2000)).toBe(2000);
    expect(distanceAtBarPosition(10, 0, 2000)).toBe(0);
    expect(handleFraction(500, 2000)).toBe(0.25);
    expect(handleFraction(5000, 2000)).toBe(1);
    expect(handleFraction(5, 0)).toBe(0);
  });
});
