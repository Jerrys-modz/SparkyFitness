import { vi, beforeEach, describe, it, expect } from 'vitest';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn().mockResolvedValue({ query, release: vi.fn() }),
  getSystemClient: vi.fn(),
}));
vi.mock('../models/exercise.js', () => ({
  default: { updateExercise: vi.fn().mockResolvedValue({ id: 'x' }) },
}));
vi.mock('../integrations/freeexercisedb/FreeExerciseDBService.js', () => ({
  default: {
    getAllExercises: vi.fn().mockResolvedValue([
      {
        name: 'Barbell Bench Press - Medium Grip',
        equipment: 'barbell',
        level: 'beginner',
        force: 'push',
        mechanic: 'compound',
        primaryMuscles: ['chest'],
        secondaryMuscles: ['triceps', 'shoulders'],
        instructions: ['Lie on the bench.', 'Press the bar up.'],
        images: ['Barbell_Bench_Press/0.jpg'],
      },
    ]),
    getExerciseImageUrl: (p: string) => `https://example.com/${p}`,
  },
}));
vi.mock('../utils/imageDownloader.js', () => ({
  downloadImage: vi
    .fn()
    .mockResolvedValue('/uploads/exercises/Barbell_Bench_Press/0_ab.jpg'),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../utils/diagnosticLogger.js', () => ({
  logRawResponse: vi.fn(),
  loadRawBundle: vi.fn(),
}));

import { fillExerciseGuides } from '../integrations/hevy/hevyService.js';
import exerciseRepository from '../models/exercise.js';

describe('fillExerciseGuides', () => {
  beforeEach(() => {
    vi.mocked(exerciseRepository.updateExercise).mockClear();
  });

  it('fills only the empty fields of a matched exercise', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 'e1',
          name: 'Bench Press (Barbell)',
          images: '["hevy_1/thumb.png"]',
          instructions: null,
          level: null,
          force: null,
          mechanic: null,
          equipment: '["other"]',
          primary_muscles: '["chest"]',
          secondary_muscles: null,
        },
        {
          id: 'e2',
          name: 'Sled Push',
          images: null,
          instructions: null,
          level: null,
          force: null,
          mechanic: null,
          equipment: null,
          primary_muscles: null,
          secondary_muscles: null,
        },
      ],
    });

    const result = await fillExerciseGuides('u1');

    expect(result).toEqual({ guidesAdded: 1, noMatch: 1, skipped: false });
    expect(exerciseRepository.updateExercise).toHaveBeenCalledTimes(1);
    expect(exerciseRepository.updateExercise).toHaveBeenCalledWith('e1', 'u1', {
      instructions: ['Lie on the bench.', 'Press the bar up.'],
      level: 'beginner',
      force: 'push',
      mechanic: 'compound',
      secondary_muscles: ['triceps', 'shoulders'],
      equipment: 'barbell',
    });
  });
});
