import { vi, beforeEach, afterEach, describe, expect, it } from 'vitest';

const { getById, createExercise, getBySource, downloadImage } = vi.hoisted(
  () => ({
    getById: vi.fn(),
    createExercise: vi.fn(),
    getBySource: vi.fn(),
    downloadImage: vi.fn(),
  })
);

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../integrations/exercisedb/ExerciseDBService.js', () => ({
  default: { getById, search: vi.fn() },
  EXERCISEDB_OSS_PROVIDER_TYPE: 'exercisedb-oss',
}));
vi.mock('../utils/imageDownloader.js', () => ({ downloadImage }));
vi.mock('../models/exercise.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const base = (actual.default ?? {}) as Record<string, unknown>;
  return {
    ...actual,
    default: {
      ...base,
      getExerciseBySourceAndSourceId: getBySource,
      createExercise,
    },
  };
});

import exerciseService from '../services/exerciseService.js';

const details = {
  id: 'abc123',
  name: 'Farmers Walk',
  category: 'strength',
  level: null,
  equipment: ['dumbbell'],
  primary_muscles: ['quadriceps'],
  secondary_muscles: [],
  instructions: ['Walk.'],
  description: 'Walk.',
  mediaUrl: 'https://static.exercisedb.dev/media/abc123.gif',
};

describe('ExerciseDB import media handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBySource.mockResolvedValue(null);
    getById.mockResolvedValue(details);
    createExercise.mockImplementation(async (row: unknown) => row);
    downloadImage.mockResolvedValue(
      '/uploads/exercises/exercisedb_abc123/x.gif'
    );
  });

  afterEach(() => {});

  it('links to the provider media and never downloads it', async () => {
    const row = await exerciseService.addExerciseDBExerciseToUserExercises(
      'user-1',
      'abc123'
    );
    expect(downloadImage).not.toHaveBeenCalled();
    expect(row.images).toEqual([
      'https://static.exercisedb.dev/media/abc123.gif',
    ]);
  });
});
