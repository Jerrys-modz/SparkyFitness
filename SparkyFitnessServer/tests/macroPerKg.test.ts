import { describe, expect, it } from 'vitest';
import {
  computeMacroTargets,
  hasMacroPerKg,
  normalizeMacroPerKg,
  normalizeMacroReferenceWeight,
  resolveMacroBasisWeight,
} from '@workspace/shared';

describe('resolveMacroBasisWeight', () => {
  it('uses body weight', () => {
    expect(resolveMacroBasisWeight(80, 20, 'body_weight')).toEqual({
      basisKg: 80,
      basisUsed: 'body_weight',
      leanMassFallback: false,
    });
  });

  it('uses lean mass when a body-fat percentage is known', () => {
    const result = resolveMacroBasisWeight(80, 25, 'lean_mass');
    expect(result.basisKg).toBeCloseTo(60);
    expect(result.basisUsed).toBe('lean_mass');
    expect(result.leanMassFallback).toBe(false);
  });

  it('falls back to body weight, and says so, without body fat', () => {
    expect(resolveMacroBasisWeight(80, null, 'lean_mass')).toEqual({
      basisKg: 80,
      basisUsed: 'body_weight',
      leanMassFallback: true,
    });
    // An impossible reading is not used either.
    expect(resolveMacroBasisWeight(80, 95, 'lean_mass').leanMassFallback).toBe(
      true
    );
  });

  it('has no basis without a weight', () => {
    expect(resolveMacroBasisWeight(null, 20, 'body_weight')).toEqual({
      basisKg: null,
      basisUsed: null,
      leanMassFallback: false,
    });
    expect(resolveMacroBasisWeight(0, 20, 'lean_mass').basisKg).toBeNull();
  });
});

describe('normalizeMacroPerKg / hasMacroPerKg', () => {
  it('accepts values in range, including numeric strings from Postgres', () => {
    expect(normalizeMacroPerKg('protein', '1.80')).toBe(1.8);
    expect(normalizeMacroPerKg('fat', 0.8)).toBe(0.8);
  });

  it('rejects unset and out-of-range values', () => {
    expect(normalizeMacroPerKg('protein', null)).toBeNull();
    expect(normalizeMacroPerKg('protein', '')).toBeNull();
    expect(normalizeMacroPerKg('protein', 6)).toBeNull();
    expect(normalizeMacroPerKg('fat', 0)).toBeNull();
    expect(normalizeMacroPerKg('fat', 3.5)).toBeNull();
  });

  it('detects a per-kg goal', () => {
    expect(hasMacroPerKg({ protein_per_kg: 2 })).toBe(true);
    expect(hasMacroPerKg({ fat_per_kg: '0.9' })).toBe(true);
    expect(hasMacroPerKg({ protein_per_kg: null, fat_per_kg: null })).toBe(
      false
    );
  });
});

describe('computeMacroTargets', () => {
  const percentages = {
    proteinPercentage: 30,
    carbsPercentage: 40,
    fatPercentage: 30,
  };

  it('matches the existing percentage maths when nothing is per kg', () => {
    const result = computeMacroTargets({
      calories: 2000,
      dietaryFiber: 25,
      ...percentages,
    });
    // (2000 - 25 * 2) = 1950 kcal shared out.
    expect(result.protein).toBeCloseTo((1950 * 0.3) / 4);
    expect(result.carbs).toBeCloseTo((1950 * 0.4) / 4);
    expect(result.fat).toBeCloseTo((1950 * 0.3) / 9);
    expect(result.perKg).toBeNull();
  });

  it('locks protein per kg and splits the rest by the other percentages', () => {
    const result = computeMacroTargets({
      calories: 2000,
      ...percentages,
      proteinPerKg: 2,
      basis: 'body_weight',
      weightKg: 80,
    });
    expect(result.protein).toBe(160);
    // 2000 - 160 * 4 = 1360 kcal left, carbs 40/70, fat 30/70.
    expect(result.carbs).toBeCloseTo((1360 * (40 / 70)) / 4);
    expect(result.fat).toBeCloseTo((1360 * (30 / 70)) / 9);
    expect(result.perKg).toMatchObject({
      protein_per_kg: 2,
      fat_per_kg: null,
      basis_used: 'body_weight',
      basis_kg: 80,
      weight_kg: 80,
      missing_weight: false,
      lean_mass_fallback: false,
    });
  });

  it('gives carbs the whole remainder when protein and fat are per kg (#1955)', () => {
    const result = computeMacroTargets({
      calories: 2200,
      ...percentages,
      proteinPerKg: 2,
      fatPerKg: 0.8,
      basis: 'body_weight',
      weightKg: 75,
    });
    expect(result.protein).toBe(150);
    expect(result.fat).toBeCloseTo(60);
    // 2200 - 600 - 540 = 1060 kcal of carbs.
    expect(result.carbs).toBeCloseTo(1060 / 4);
  });

  it('follows the weight down', () => {
    const at = (weightKg: number) =>
      computeMacroTargets({
        calories: 2000,
        protein: 150,
        carbs: 200,
        fat: 60,
        proteinPerKg: 1.8,
        weightKg,
      });
    expect(at(90).protein).toBeCloseTo(162);
    expect(at(80).protein).toBeCloseTo(144);
    // Gram mode: the other macros keep their typed grams.
    expect(at(80).carbs).toBe(200);
    expect(at(80).fat).toBe(60);
  });

  it('uses lean mass when asked and body fat is known', () => {
    const result = computeMacroTargets({
      calories: 2000,
      protein: 0,
      carbs: 0,
      fat: 0,
      proteinPerKg: 2.5,
      basis: 'lean_mass',
      weightKg: 80,
      bodyFatPercentage: 20,
    });
    expect(result.protein).toBeCloseTo(160);
    expect(result.perKg?.basis_used).toBe('lean_mass');
    expect(result.perKg?.basis_kg).toBeCloseTo(64);
  });

  it('keeps the saved grams when no weight is logged', () => {
    const result = computeMacroTargets({
      calories: 2000,
      protein: 140,
      ...percentages,
      proteinPerKg: 2,
      weightKg: null,
    });
    expect(result.protein).toBe(140);
    expect(result.carbs).toBeCloseTo(((2000 - 560) * (40 / 70)) / 4);
    expect(result.perKg?.missing_weight).toBe(true);
    expect(result.perKg?.weight_kg).toBeNull();
  });

  it('never gives a macro negative grams when the locked macros use every calorie', () => {
    const result = computeMacroTargets({
      calories: 1000,
      ...percentages,
      proteinPerKg: 3,
      fatPerKg: 1.5,
      weightKg: 100,
    });
    expect(result.carbs).toBe(0);
    expect(result.protein).toBe(300);
    expect(result.fat).toBe(150);
  });
});

describe('computeMacroTargets with carbs and a fixed reference weight (#3617)', () => {
  const percentages = {
    proteinPercentage: 30,
    carbsPercentage: 40,
    fatPercentage: 30,
  };

  it('uses the fixed reference weight instead of the logged weight', () => {
    const result = computeMacroTargets({
      calories: 2000,
      ...percentages,
      proteinPerKg: 2,
      referenceWeightKg: 80,
      weightKg: 76,
    });
    expect(result.protein).toBe(160);
    expect(result.perKg).toMatchObject({
      reference: 'fixed',
      basis_kg: 80,
      weight_kg: 80,
      missing_weight: false,
    });
  });

  it('works without any logged weight when the reference is fixed', () => {
    const result = computeMacroTargets({
      calories: 2000,
      protein: 100,
      proteinPerKg: 2,
      referenceWeightKg: 70,
      weightKg: null,
    });
    expect(result.protein).toBe(140);
    expect(result.perKg?.missing_weight).toBe(false);
  });

  it('treats a fixed reference weight as the lean mass for the lean-mass basis', () => {
    const result = computeMacroTargets({
      calories: 2000,
      proteinPerKg: 2.5,
      basis: 'lean_mass',
      referenceWeightKg: 60,
      weightKg: 80,
      bodyFatPercentage: 20,
    });
    expect(result.protein).toBe(150);
    expect(result.perKg).toMatchObject({
      basis_used: 'lean_mass',
      lean_mass_fallback: false,
    });
  });

  it('locks carbs per kg and splits the rest between protein and fat', () => {
    const result = computeMacroTargets({
      calories: 2400,
      ...percentages,
      carbsPerKg: 4,
      weightKg: 70,
    });
    expect(result.carbs).toBe(280);
    // 2400 - 1120 = 1280 kcal, protein and fat 30:30.
    expect(result.protein).toBeCloseTo(640 / 4);
    expect(result.fat).toBeCloseTo(640 / 9);
    expect(result.perKg?.carbs_per_kg).toBe(4);
  });

  it('reports the calories of the per-kg macros against the target', () => {
    const result = computeMacroTargets({
      calories: 2000,
      ...percentages,
      proteinPerKg: 2,
      carbsPerKg: 4,
      fatPerKg: 1,
      weightKg: 80,
    });
    expect(result.protein).toBe(160);
    expect(result.carbs).toBe(320);
    expect(result.fat).toBe(80);
    // 640 + 1280 + 720 kcal, more than the 2000 kcal target.
    expect(result.perKg?.locked_kcal).toBe(2640);
    expect(result.perKg?.available_kcal).toBe(2000);
  });

  it('checks the carbs and reference weight limits', () => {
    expect(normalizeMacroPerKg('carbs', 0.4)).toBeNull();
    expect(normalizeMacroPerKg('carbs', 12)).toBe(12);
    expect(normalizeMacroReferenceWeight(19)).toBeNull();
    expect(normalizeMacroReferenceWeight('80.50')).toBe(80.5);
    expect(hasMacroPerKg({ carbs_per_kg: '5' })).toBe(true);
  });
});
