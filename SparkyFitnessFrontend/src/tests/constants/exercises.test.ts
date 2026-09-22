import {
  heatLevel,
  setsForMuscleKey,
  unmappedMuscleSets,
} from '@/constants/exercises';

describe('muscle heatmap matching', () => {
  it('matches HealthKit title case onto SVG schema names', () => {
    expect(setsForMuscleKey('biceps', { Biceps: 8, biceps: 2 })).toBe(10);
    expect(setsForMuscleKey('abdominals', { Abs: 4, Abdominals: 1 })).toBe(5);
    expect(setsForMuscleKey('quadriceps', { Quads: 3 })).toBe(3);
  });

  it('lists muscles the male SVG cannot tint', () => {
    expect(unmappedMuscleSets({ Biceps: 4, Lats: 6, Chest: 2 })).toEqual([
      { muscle: 'Lats', sets: 6 },
    ]);
  });

  it('buckets set counts into four heat levels', () => {
    expect(heatLevel(0, 12)).toBe(0);
    expect(heatLevel(3, 12)).toBe(1);
    expect(heatLevel(6, 12)).toBe(2);
    expect(heatLevel(9, 12)).toBe(3);
    expect(heatLevel(12, 12)).toBe(4);
  });
});
