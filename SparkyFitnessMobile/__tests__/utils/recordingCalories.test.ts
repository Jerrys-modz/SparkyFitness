import { estimateRecordingKcal } from '../../src/utils/recordingCalories';

describe('estimateRecordingKcal', () => {
  it('counts an outdoor run by distance', () => {
    expect(estimateRecordingKcal('run', 70, 5000, 1500, false)).toBeCloseTo(
      350
    );
  });

  it('counts an outdoor walk by distance at half the cost', () => {
    expect(estimateRecordingKcal('walk', 70, 5000, 3600, false)).toBeCloseTo(
      175
    );
  });

  it('counts an indoor run by active time', () => {
    expect(estimateRecordingKcal('run', 70, 0, 1800, true)).toBeCloseTo(343);
  });

  it('counts a ride by active time', () => {
    expect(estimateRecordingKcal('ride', 80, 20000, 3600, false)).toBeCloseTo(
      600
    );
  });

  it('is null without a body weight', () => {
    expect(estimateRecordingKcal('run', null, 5000, 1500, false)).toBeNull();
    expect(estimateRecordingKcal('run', 0, 5000, 1500, false)).toBeNull();
  });
});
