import { estimateMaxHeartRate } from '../../src/utils/heartRateZones';

describe('estimateMaxHeartRate', () => {
  const now = new Date(2026, 9, 3);

  it('uses 211 - 0.64 * age', () => {
    expect(estimateMaxHeartRate('1996-01-01', now)).toBe(
      Math.round(211 - 0.64 * 30)
    );
  });

  it('does not count a birthday that has not happened yet', () => {
    expect(estimateMaxHeartRate('1996-12-31', now)).toBe(
      Math.round(211 - 0.64 * 29)
    );
  });

  it('falls back to 190 without a usable date of birth', () => {
    expect(estimateMaxHeartRate(null, now)).toBe(190);
    expect(estimateMaxHeartRate('nonsense', now)).toBe(190);
    expect(estimateMaxHeartRate('2026-01-01', now)).toBe(190);
  });
});
