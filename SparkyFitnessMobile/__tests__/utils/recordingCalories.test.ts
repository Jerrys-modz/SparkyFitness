import { estimateRecordingKcal } from '../../src/utils/recordingCalories';

describe('estimateRecordingKcal', () => {
  it('is the exercise rate over the active time', () => {
    expect(estimateRecordingKcal(600, 1800)).toBeCloseTo(300);
    expect(estimateRecordingKcal(450, 3600)).toBeCloseTo(450);
  });

  it('is zero at the start', () => {
    expect(estimateRecordingKcal(600, 0)).toBe(0);
  });

  it('is null without a rate', () => {
    expect(estimateRecordingKcal(null, 1800)).toBeNull();
    expect(estimateRecordingKcal(0, 1800)).toBeNull();
  });
});
