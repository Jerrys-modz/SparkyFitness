import { describe, it, expect } from 'vitest';
import { findGuideMatch } from '../integrations/hevy/exerciseGuideMatcher.js';

const db = [
  { name: 'Barbell Bench Press - Medium Grip', equipment: 'barbell' },
  { name: 'Barbell Incline Bench Press - Medium Grip', equipment: 'barbell' },
  { name: 'Dumbbell Bench Press', equipment: 'dumbbell' },
  { name: 'Dumbbell Bicep Curl', equipment: 'dumbbell' },
  { name: 'Barbell Curl', equipment: 'barbell' },
  { name: 'Romanian Deadlift', equipment: 'barbell' },
  { name: 'Pullups', equipment: 'body only' },
  { name: 'Ab Roller', equipment: 'other' },
];

describe('findGuideMatch', () => {
  it('matches Hevy titles to the right entry, equipment included', () => {
    expect(findGuideMatch('Bench Press (Barbell)', db)?.name).toBe(
      'Barbell Bench Press - Medium Grip'
    );
    expect(findGuideMatch('Bench Press (Dumbbell)', db)?.name).toBe(
      'Dumbbell Bench Press'
    );
    expect(findGuideMatch('Bicep Curl (Dumbbell)', db)?.name).toBe(
      'Dumbbell Bicep Curl'
    );
    expect(findGuideMatch('Curl (Barbell)', db)?.name).toBe('Barbell Curl');
    expect(findGuideMatch('Romanian Deadlift (Barbell)', db)?.name).toBe(
      'Romanian Deadlift'
    );
  });

  it('prefers the plain entry over a variant with extra words', () => {
    expect(findGuideMatch('Bench Press (Barbell)', db)?.name).not.toMatch(
      /Incline/
    );
  });

  it('returns null rather than a wrong guide', () => {
    expect(findGuideMatch('Bench Press (Cable)', db)).toBeNull();
    expect(findGuideMatch('Sled Push', db)).toBeNull();
    expect(findGuideMatch('Ab Wheel', db)).toBeNull();
  });
});
