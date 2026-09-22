import { describe, expect, it } from 'vitest';
import {
  formatProgressionSettings,
  recommendProgression,
} from '../ai/tools/workoutProgressionRecommend.js';

const WORKING_8x3 = [
  { reps: 8, set_type: 'Working Set' },
  { reps: 8, set_type: 'Working Set' },
  { reps: 8, set_type: 'Working Set' },
];

describe('recommendProgression', () => {
  it('picks Fixed Target for barbell compounds', () => {
    expect(
      recommendProgression({
        name: 'Barbell Bench Press',
        equipment: ['Barbell'],
        workingSets: WORKING_8x3,
      })
    ).toMatchObject({
      progression_mode: 'fixed',
      rep_goal: 8,
      increment_type: 'weight',
      increment_value: 2.5,
    });
  });

  it('picks Fixed Target for an unnamed bench press (assumed barbell)', () => {
    expect(
      recommendProgression({
        name: 'Bench Press',
        workingSets: WORKING_8x3,
      }).progression_mode
    ).toBe('fixed');
  });

  it('picks Total Rep Goal for dumbbell bench press, not Fixed Target', () => {
    const rec = recommendProgression({
      name: 'Dumbbell Bench Press',
      equipment: ['Dumbbell'],
      workingSets: WORKING_8x3,
    });
    expect(rec.progression_mode).toBe('rep_goal');
    expect(rec.rep_goal).toBe(24);
    expect(rec.increment_value).toBe(2);
  });

  it('picks Total Rep Goal for machines, cables, and smith-machine compounds', () => {
    expect(
      recommendProgression({
        name: 'Cable Fly',
        equipment: ['Cable'],
        workingSets: [
          { reps: 12, set_type: 'Working Set' },
          { reps: 10, set_type: 'Working Set' },
          { reps: 8, set_type: 'Working Set' },
        ],
      })
    ).toMatchObject({
      progression_mode: 'rep_goal',
      rep_goal: 30,
      increment_type: 'weight',
      increment_value: 2.5,
    });

    expect(
      recommendProgression({
        name: 'Smith Machine Squat',
        equipment: ['Smith Machine'],
        workingSets: WORKING_8x3,
      }).progression_mode
    ).toBe('rep_goal');
  });

  it('picks Step-Load for bodyweight and calisthenics', () => {
    expect(
      recommendProgression({
        name: 'Pull-up',
        equipment: ['none'],
        workingSets: WORKING_8x3,
      })
    ).toMatchObject({
      progression_mode: 'step_load',
      rep_goal: 24,
      increment_type: 'reps',
      increment_value: 3,
    });
  });

  it('picks Manual for cardio and timed work', () => {
    expect(
      recommendProgression({
        name: 'Treadmill Run',
        modality: 'duration_distance',
      })
    ).toMatchObject({
      progression_mode: 'manual',
      rep_goal: null,
    });

    expect(
      recommendProgression({
        name: 'Rowing',
        category: 'Cardio',
      }).progression_mode
    ).toBe('manual');
  });

  it('ignores warmup sets when totaling reps', () => {
    const rec = recommendProgression({
      name: 'Lat Pulldown',
      equipment: ['Machine'],
      workingSets: [
        { reps: 12, set_type: 'Warmup' },
        { reps: 10, set_type: 'Working Set' },
        { reps: 10, set_type: 'Working Set' },
        { reps: 8, set_type: 'Working Set' },
      ],
    });
    expect(rec.rep_goal).toBe(28);
    expect(rec.reason).toContain('3 working sets aiming for 28 reps');
  });

  it('reads equipment from a JSON string or a comma list', () => {
    expect(
      recommendProgression({
        name: 'Press',
        equipment: '["Barbell"]',
        workingSets: WORKING_8x3,
      }).progression_mode
    ).toBe('fixed');

    expect(
      recommendProgression({
        name: 'Fly',
        equipment: 'Cable, Machine',
        workingSets: WORKING_8x3,
      }).progression_mode
    ).toBe('rep_goal');
  });
});

describe('formatProgressionSettings', () => {
  it('renders each mode the chatbot prints', () => {
    expect(
      formatProgressionSettings({
        progression_mode: 'rep_goal',
        rep_goal: 24,
        increment_type: 'weight',
        increment_value: 2.5,
      })
    ).toBe('Total Rep Goal · 24 total reps · +2.5 kg');

    expect(
      formatProgressionSettings({
        progression_mode: 'fixed',
        rep_goal: 8,
        increment_type: 'weight',
        increment_value: 2.5,
      })
    ).toBe('Fixed Target · 8 reps/set · +2.5 kg');

    expect(
      formatProgressionSettings({
        progression_mode: 'step_load',
        rep_goal: 40,
        increment_type: 'reps',
        increment_value: 3,
      })
    ).toBe('Step-Load (Reps Only) · 40 total reps · +3 reps');

    expect(
      formatProgressionSettings({
        progression_mode: 'manual',
        rep_goal: null,
      })
    ).toBe('Manual (No Overload) (manual)');
  });
});
