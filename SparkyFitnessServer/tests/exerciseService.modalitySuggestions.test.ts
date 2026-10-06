import { vi, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import exerciseService from '../services/exerciseService.js';
import { getClient } from '../db/poolManager.js';
import {
  createMockDbClient,
  type MockDbClient,
} from './helpers/mockDbClient.js';

vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn(),
  getSystemClient: vi.fn(),
}));

vi.mock('../config/logging.js', () => ({
  log: vi.fn(),
}));

describe('exercise modality suggestions', () => {
  let mockClient: MockDbClient;

  beforeEach(() => {
    mockClient = createMockDbClient();
    vi.mocked(getClient).mockResolvedValue(mockClient);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('lists only exercises whose detected type differs from the stored one', async () => {
    const carryId = uuidv4();
    mockClient.query.mockResolvedValueOnce({
      rows: [
        {
          id: carryId,
          name: "Farmer's Carry",
          category: 'strength',
          equipment: '["dumbbell"]',
          modality: 'weight_reps',
        },
        {
          id: uuidv4(),
          name: 'Bench Press',
          category: 'strength',
          equipment: '["barbell"]',
          modality: 'weight_reps',
        },
        {
          id: uuidv4(),
          name: 'Plank',
          category: 'strength',
          equipment: null,
          modality: 'duration',
        },
      ],
    });

    const suggestions = await exerciseService.getModalitySuggestions(uuidv4());

    expect(suggestions).toEqual([
      {
        id: carryId,
        name: "Farmer's Carry",
        category: 'strength',
        currentModality: 'weight_reps',
        suggestedModality: 'weight_distance',
      },
    ]);
  });

  it('does not offer a category-only guess over a type that was set on purpose', async () => {
    mockClient.query.mockResolvedValueOnce({
      rows: [
        {
          id: uuidv4(),
          name: 'Ab Wheel',
          category: 'strength',
          equipment: null,
          modality: 'reps_only',
        },
        {
          id: uuidv4(),
          name: 'Band Pullaparts',
          category: 'strength',
          equipment: '["bands"]',
          modality: 'reps_only',
        },
        {
          id: uuidv4(),
          name: 'Battle Ropes',
          category: 'cardio',
          equipment: null,
          modality: 'duration',
        },
      ],
    });

    expect(await exerciseService.getModalitySuggestions(uuidv4())).toEqual([]);
  });

  it('applies each chosen change and reports how many rows updated', async () => {
    mockClient.query.mockResolvedValue({ rows: [{ id: uuidv4() }] });

    const updated = await exerciseService.applyModalitySuggestions(uuidv4(), [
      { id: uuidv4(), modality: 'weight_distance' },
      { id: uuidv4(), modality: 'duration' },
    ]);

    expect(updated).toBe(2);
  });
});
