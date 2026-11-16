import { describe, expect, it, vi } from 'vitest';
import { getClinicalCalorieMinimum } from '@workspace/shared';
import bmrService from '../services/bmrService.js';
import { resolveEffectiveCalorieSafetyFloor } from '../services/calorieSafetyFloorService.js';

vi.mock('../models/measurementRepository.js');
vi.mock('../models/preferenceRepository.js');
vi.mock('../models/userRepository.js');

const DAY = '2027-01-01';
// A heavy, tall man: his RMR sits well above the 1,500 clinical minimum.
const man = { gender: 'male', date_of_birth: '1987-01-01' };
const measurements = {
  entry_date: '2026-12-30',
  weight: 110,
  height: 180,
  body_fat_percentage: null,
};
const rmr = bmrService.calculateBmr(
  'Mifflin-St Jeor',
  110,
  180,
  40,
  'male',
  undefined
);

describe('resolveEffectiveCalorieSafetyFloor', () => {
  it('has an RMR above the clinical minimum for this person', () => {
    expect(rmr).toBeGreaterThan(getClinicalCalorieMinimum('male'));
  });

  it('Standard: the RMR when it is above the clinical minimum', () => {
    const floor = resolveEffectiveCalorieSafetyFloor(
      { calorie_safety_floor_mode: 'standard' },
      man,
      measurements,
      DAY
    );
    expect(floor.mode).toBe('standard');
    expect(floor.enforcedKcal).toBe(Math.round(rmr));
    expect(floor.standardKcal).toBe(Math.round(rmr));
    expect(floor.enforcedKcal).toBeGreaterThan(1500);
  });

  it('Standard: the clinical minimum when the RMR is below it', () => {
    const floor = resolveEffectiveCalorieSafetyFloor(
      { calorie_safety_floor_mode: 'standard' },
      { gender: 'female', date_of_birth: '1987-01-01' },
      { weight: 45, height: 150 },
      DAY
    );
    expect(floor.enforcedKcal).toBe(1200);
  });

  it('treats an unset mode as Standard', () => {
    const floor = resolveEffectiveCalorieSafetyFloor(
      {},
      man,
      measurements,
      DAY
    );
    expect(floor.mode).toBe('standard');
    expect(floor.enforcedKcal).toBe(Math.round(rmr));
  });

  it("Custom: the person's value, even below the RMR", () => {
    const floor = resolveEffectiveCalorieSafetyFloor(
      {
        calorie_safety_floor_mode: 'custom',
        calorie_safety_floor_value: 1600,
      },
      man,
      measurements,
      DAY
    );
    expect(floor.mode).toBe('custom');
    expect(floor.enforcedKcal).toBe(1600);
    expect(floor.standardKcal).toBe(Math.round(rmr));
  });

  it('Custom with an unusable value falls back to the standard floor, like the engine', () => {
    const floor = resolveEffectiveCalorieSafetyFloor(
      { calorie_safety_floor_mode: 'custom', calorie_safety_floor_value: 5 },
      man,
      measurements,
      DAY
    );
    expect(floor.enforcedKcal).toBe(Math.round(rmr));
  });

  it('Disabled: nothing is enforced, the standard floor stays as advice', () => {
    const floor = resolveEffectiveCalorieSafetyFloor(
      { calorie_safety_floor_mode: 'disabled' },
      man,
      measurements,
      DAY
    );
    expect(floor.mode).toBe('disabled');
    expect(floor.enforcedKcal).toBeNull();
    expect(floor.standardKcal).toBe(Math.round(rmr));
  });

  it('uses a measured BMR only on the day it was recorded', () => {
    const prefs = {
      calorie_safety_floor_mode: 'standard',
      use_external_bmr: true,
    };
    const sameDay = resolveEffectiveCalorieSafetyFloor(
      prefs,
      man,
      { ...measurements, entry_date: DAY, bmr: 2300 },
      DAY
    );
    expect(sameDay.enforcedKcal).toBe(2300);
    const staleDay = resolveEffectiveCalorieSafetyFloor(
      prefs,
      man,
      { ...measurements, entry_date: '2026-12-30', bmr: 2300 },
      DAY
    );
    expect(staleDay.enforcedKcal).toBe(Math.round(rmr));
  });

  it('falls back to the clinical minimum without a profile', () => {
    const floor = resolveEffectiveCalorieSafetyFloor(
      { calorie_safety_floor_mode: 'standard' },
      null,
      null,
      DAY
    );
    expect(floor.enforcedKcal).toBe(1500);
  });
});
