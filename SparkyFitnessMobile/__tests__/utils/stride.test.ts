import {
  activeShare,
  blendStride,
  DEFAULT_STRIDE_METERS,
  estimateDistanceMeters,
  isStepActivity,
  calibrateFromKnownDistance,
  isPlausibleStride,
  strideFromDisplay,
  strideFromSample,
  strideToDisplay,
} from '../../src/utils/stride';

describe('isStepActivity', () => {
  it('counts walks and runs but not rides', () => {
    expect(isStepActivity('walk')).toBe(true);
    expect(isStepActivity('run')).toBe(true);
    expect(isStepActivity('ride')).toBe(false);
  });
});

describe('strideFromSample', () => {
  it('gives metres per step for a known distance', () => {
    // 3 km in 4,000 steps.
    expect(strideFromSample(4000, 3000)).toBeCloseTo(0.75);
  });

  it('ignores a sample too short to say anything', () => {
    expect(strideFromSample(100, 80)).toBeNull();
    expect(strideFromSample(400, 60)).toBeNull();
  });

  it('ignores a stride no person has', () => {
    // A stalled counter: 5 km in 200 steps.
    expect(strideFromSample(200, 5000)).toBeNull();
    // A step counter running away: 200 m in 5,000 steps.
    expect(strideFromSample(5000, 200)).toBeNull();
  });

  it('ignores values that are not numbers', () => {
    expect(strideFromSample(Number.NaN, 1000)).toBeNull();
    expect(strideFromSample(1000, Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('blendStride', () => {
  it('starts from the first sample', () => {
    expect(blendStride(undefined, 0.8)).toEqual({ meters: 0.8, samples: 1 });
  });

  it('averages the early samples equally', () => {
    const second = blendStride({ meters: 0.8, samples: 1 }, 0.9);
    expect(second.meters).toBeCloseTo(0.85);
    expect(second.samples).toBe(2);
    expect(blendStride(second, 0.7).meters).toBeCloseTo(0.8);
  });

  it('never gives a new sample less than a quarter of the weight', () => {
    const settled = { meters: 1, samples: 50 };
    expect(blendStride(settled, 2).meters).toBeCloseTo(1.25);
    expect(blendStride(settled, 2).samples).toBe(51);
  });
});

describe('estimateDistanceMeters', () => {
  it('multiplies steps by stride', () => {
    expect(estimateDistanceMeters(4000, DEFAULT_STRIDE_METERS.walk)).toBe(3000);
  });

  it('never goes negative', () => {
    expect(estimateDistanceMeters(-5, 0.75)).toBe(0);
  });
});

describe('activeShare', () => {
  it('is the moving share of the window', () => {
    expect(activeShare(1500, 1800)).toBeCloseTo(0.8333, 3);
  });

  it('stays between none and all of it', () => {
    expect(activeShare(2000, 1800)).toBe(1);
    expect(activeShare(-5, 1800)).toBe(0);
    expect(activeShare(100, 0)).toBe(0);
  });
});

describe('blendStride with a hand-set stride', () => {
  it('counts a hand-set stride like a few learned ones', () => {
    // Weight is a quarter, not a half, for the first real distance.
    const next = blendStride({ meters: 1, samples: 0, manual: true }, 1.4);
    expect(next.meters).toBeCloseTo(1.1);
    expect(next.samples).toBe(1);
    expect(next.manual).toBeUndefined();
  });

  it('still starts fresh when there is nothing', () => {
    expect(blendStride({ meters: 1, samples: 0 }, 1.4)).toEqual({
      meters: 1.4,
      samples: 1,
    });
  });
});

describe('stride display units', () => {
  it('keeps metres for km and shows feet for miles', () => {
    expect(strideToDisplay(0.75, 'km')).toBe(0.75);
    expect(strideToDisplay(0.75, 'miles')).toBeCloseTo(2.46, 2);
  });

  it('round-trips through the display unit', () => {
    expect(
      strideFromDisplay(strideToDisplay(0.9, 'miles'), 'miles')
    ).toBeCloseTo(0.9);
  });
});

describe('isPlausibleStride', () => {
  it('accepts a person’s step and rejects the rest', () => {
    expect(isPlausibleStride(0.8)).toBe(true);
    expect(isPlausibleStride(0.1)).toBe(false);
    expect(isPlausibleStride(3)).toBe(false);
    expect(isPlausibleStride(NaN)).toBe(false);
  });
});

describe('calibrateFromKnownDistance', () => {
  it('gives the stride and how far the treadmill read', () => {
    // 5 km in 5,000 steps; the treadmill showed 5.2 km.
    const result = calibrateFromKnownDistance(5000, 5000, 5200);
    expect(result?.strideMeters).toBeCloseTo(1);
    expect(result?.treadmillPercent).toBe(4);
  });

  it('works without a treadmill figure', () => {
    expect(calibrateFromKnownDistance(5000, 5000, null)).toEqual({
      strideMeters: 1,
      treadmillPercent: null,
    });
  });

  it('refuses a sample too short or implausible to learn from', () => {
    expect(calibrateFromKnownDistance(100, 5000, null)).toBeNull();
    expect(calibrateFromKnownDistance(5000, 50, null)).toBeNull();
  });
});
