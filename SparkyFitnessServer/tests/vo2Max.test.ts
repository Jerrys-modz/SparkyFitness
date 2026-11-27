import { describe, expect, it } from 'vitest';
import { rateVo2Max, typicalVo2Max, vo2MaxFitnessAge } from '@workspace/shared';

describe('rateVo2Max', () => {
  it('rates at each threshold for a man in his thirties', () => {
    expect(rateVo2Max(54, 35, 'male')).toBe('superior');
    expect(rateVo2Max(53.9, 35, 'male')).toBe('excellent');
    expect(rateVo2Max(44, 35, 'male')).toBe('good');
    expect(rateVo2Max(40.5, 35, 'male')).toBe('fair');
    expect(rateVo2Max(40.4, 35, 'male')).toBe('poor');
  });

  it('uses the female table', () => {
    expect(rateVo2Max(43.9, 25, 'female')).toBe('excellent');
    expect(rateVo2Max(43.9, 25, 'male')).toBe('fair');
  });

  it('moves to the next band on the tenth birthday', () => {
    expect(rateVo2Max(39, 39, 'male')).toBe('poor');
    expect(rateVo2Max(39, 40, 'male')).toBe('fair');
    expect(rateVo2Max(38.4, 40, 'male')).toBe('poor');
  });

  it('is null outside the norms or for a bad value', () => {
    expect(rateVo2Max(50, 19, 'male')).toBeNull();
    expect(rateVo2Max(50, 80, 'female')).toBeNull();
    expect(rateVo2Max(0, 30, 'male')).toBeNull();
    expect(rateVo2Max(Number.NaN, 30, 'male')).toBeNull();
    expect(rateVo2Max(40, Number.NaN, 'male')).toBeNull();
  });
});

describe('typicalVo2Max', () => {
  it('falls with age and is null outside the norms', () => {
    const at25 = typicalVo2Max(25, 'male');
    const at45 = typicalVo2Max(45, 'male');
    const at65 = typicalVo2Max(65, 'male');
    expect(at25).not.toBeNull();
    expect(at25!).toBeGreaterThan(at45!);
    expect(at45!).toBeGreaterThan(at65!);
    expect(typicalVo2Max(19, 'male')).toBeNull();
    expect(typicalVo2Max(80, 'female')).toBeNull();
  });
});

describe('vo2MaxFitnessAge', () => {
  it('matches the age whose typical value it is given', () => {
    const typical = typicalVo2Max(45, 'female')!;
    expect(vo2MaxFitnessAge(typical, 'female')).toEqual({
      age: 45,
      limit: null,
    });
  });

  it('is younger for a higher value', () => {
    const typical = typicalVo2Max(50, 'male')!;
    const better = vo2MaxFitnessAge(typical + 4, 'male')!;
    expect(better.age).toBeLessThan(50);
  });

  it('stops at the limits of the norms', () => {
    expect(vo2MaxFitnessAge(80, 'male')).toEqual({
      age: 20,
      limit: 'younger',
    });
    expect(vo2MaxFitnessAge(10, 'female')).toEqual({
      age: 79,
      limit: 'older',
    });
  });

  it('is null for a value that is not positive', () => {
    expect(vo2MaxFitnessAge(0, 'male')).toBeNull();
    expect(vo2MaxFitnessAge(Number.NaN, 'male')).toBeNull();
  });
});
