import { describe, it, expect } from 'vitest';
import {
  classifyBloodPressure,
  averageBloodPressure,
  summarizeBloodPressure,
  homeBloodPressureAverage,
  bloodPressureCreateSchema,
  bloodPressureUpdateSchema,
  isBloodPressureInFuture,
  type TimedBloodPressureReading,
} from '@workspace/shared';

describe('classifyBloodPressure', () => {
  it.each([
    [{ systolic: 118, diastolic: 76 }, 'normal'],
    [{ systolic: 125, diastolic: 78 }, 'elevated'],
    [{ systolic: 125, diastolic: 80 }, 'stage1'],
    [{ systolic: 135, diastolic: 70 }, 'stage1'],
    [{ systolic: 128, diastolic: 82 }, 'stage1'],
    [{ systolic: 118, diastolic: 92 }, 'stage2'],
    [{ systolic: 140, diastolic: 85 }, 'stage2'],
    [{ systolic: 181, diastolic: 95 }, 'severe'],
    [{ systolic: 150, diastolic: 121 }, 'severe'],
    [{ systolic: 180, diastolic: 120 }, 'stage2'],
  ] as const)('classifies %j as %s', (reading, expected) => {
    expect(classifyBloodPressure(reading)).toBe(expected);
  });
});

const reading = (
  date: string,
  hour: number,
  systolic: number,
  diastolic: number
): TimedBloodPressureReading => ({ date, hour, systolic, diastolic });

describe('averages', () => {
  it('returns null for no readings', () => {
    expect(averageBloodPressure([])).toBeNull();
    expect(summarizeBloodPressure([]).overall).toBeNull();
  });

  it('splits morning and evening and finds extremes', () => {
    const summary = summarizeBloodPressure([
      reading('2026-11-20', 7, 130, 80),
      reading('2026-11-20', 13, 120, 70),
      reading('2026-11-20', 20, 140, 90),
    ]);
    expect(summary.overall).toEqual({ systolic: 130, diastolic: 80, count: 3 });
    expect(summary.morning).toEqual({ systolic: 130, diastolic: 80, count: 1 });
    expect(summary.evening).toEqual({ systolic: 140, diastolic: 90, count: 1 });
    expect(summary.highest).toEqual({ systolic: 140, diastolic: 90 });
    expect(summary.lowest).toEqual({ systolic: 120, diastolic: 70 });
  });
});

describe('homeBloodPressureAverage', () => {
  it('needs five distinct days', () => {
    const four = ['01', '02', '03', '04'].map((d) =>
      reading(`2026-11-${d}`, 8, 130, 80)
    );
    expect(homeBloodPressureAverage(four)).toBeNull();
  });

  it('drops the first day and flags the 135/85 threshold', () => {
    const readings = [
      reading('2026-11-01', 8, 200, 120), // first day, dropped
      ...['02', '03', '04', '05'].map((d) =>
        reading(`2026-11-${d}`, 8, 136, 80)
      ),
    ];
    const result = homeBloodPressureAverage(readings);
    expect(result?.average).toEqual({ systolic: 136, diastolic: 80, count: 4 });
    expect(result?.daysUsed).toBe(4);
    expect(result?.atOrAboveHomeThreshold).toBe(true);
  });
});

describe('request schemas', () => {
  it('accepts a minimal reading', () => {
    expect(
      bloodPressureCreateSchema.safeParse({
        systolic_mmhg: 120,
        diastolic_mmhg: 80,
      }).success
    ).toBe(true);
  });

  it('rejects systolic not above diastolic and out-of-range values', () => {
    expect(
      bloodPressureCreateSchema.safeParse({
        systolic_mmhg: 80,
        diastolic_mmhg: 80,
      }).success
    ).toBe(false);
    expect(
      bloodPressureCreateSchema.safeParse({
        systolic_mmhg: 400,
        diastolic_mmhg: 80,
      }).success
    ).toBe(false);
    expect(
      bloodPressureCreateSchema.safeParse({
        systolic_mmhg: 120,
        diastolic_mmhg: 80,
        arm: 'both',
      }).success
    ).toBe(false);
  });

  it('refuses an empty update', () => {
    expect(bloodPressureUpdateSchema.safeParse({}).success).toBe(false);
    expect(bloodPressureUpdateSchema.safeParse({ note: null }).success).toBe(
      true
    );
  });
});

describe('isBloodPressureInFuture', () => {
  const now = new Date('2026-11-24T12:00:00Z');
  it('allows now, the past and a few minutes of clock skew', () => {
    expect(isBloodPressureInFuture('2026-11-24T12:00:00Z', now)).toBe(false);
    expect(isBloodPressureInFuture('2026-11-20T08:00:00Z', now)).toBe(false);
    expect(isBloodPressureInFuture('2026-11-24T12:03:00Z', now)).toBe(false);
  });
  it('refuses a later time and ignores one that does not parse', () => {
    expect(isBloodPressureInFuture('2026-11-24T13:00:00Z', now)).toBe(true);
    expect(isBloodPressureInFuture('garbage', now)).toBe(false);
  });
});
