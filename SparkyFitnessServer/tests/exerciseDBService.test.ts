import { vi, beforeEach, describe, expect, it } from 'vitest';
import axios from 'axios';
import exerciseDBService, {
  mapEquipmentFilters,
  mapMuscleFilters,
} from '../integrations/exercisedb/ExerciseDBService.js';

vi.mock('axios');
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

const row = (id: string, name: string) => ({
  exerciseId: id,
  name,
  gifUrl: `https://static.exercisedb.dev/media/${id}.gif`,
  bodyParts: ['chest'],
  equipments: ['barbell'],
  targetMuscles: ['pectorals'],
  secondaryMuscles: ['triceps'],
  instructions: ['Step:1 Lie on the bench.', 'Step:2 Press the bar.'],
});

describe('ExerciseDBService filter mapping', () => {
  it('maps canonical muscle names onto ExerciseDB muscles', () => {
    expect(mapMuscleFilters(['chest'])).toEqual([
      'pectorals',
      'serratus anterior',
    ]);
    expect(mapMuscleFilters(['shoulders'])).toContain('deltoids');
  });

  it('accepts ExerciseDB spellings directly', () => {
    expect(mapMuscleFilters(['pectorals'])).toContain('pectorals');
  });

  it('maps canonical equipment onto ExerciseDB equipment', () => {
    expect(mapEquipmentFilters(['body only'])).toEqual(['bodyweight']);
    expect(mapEquipmentFilters(['barbell'])).toContain('barbell');
  });

  it('returns nothing for a name the catalogue does not have', () => {
    expect(mapMuscleFilters(['neck'])).toEqual([]);
  });
});

describe('ExerciseDBService.searchExercises', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends the query and mapped filters and strips the step prefixes', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: {
        success: true,
        meta: { total: 1, hasNextPage: false },
        data: [row('EIeI8Vf', 'barbell bench press')],
      },
    });

    const result = await exerciseDBService.searchExercises(
      ' bench ',
      ['barbell'],
      ['chest'],
      20,
      0
    );

    expect(axios.get).toHaveBeenCalledTimes(1);
    const [url, config] = vi.mocked(axios.get).mock.calls[0]!;
    expect(url).toBe('https://oss.exercisedb.dev/api/v1/exercises');
    expect(config?.params).toEqual({
      limit: '25',
      name: 'bench',
      targetMuscles: 'pectorals,serratus anterior',
      equipments: expect.stringContaining('barbell'),
    });
    expect(result.totalCount).toBe(1);
    expect(result.exercises[0]!.instructions).toEqual([
      'Lie on the bench.',
      'Press the bar.',
    ]);
  });

  it('walks the cursor to reach a deeper page and slices to the requested window', async () => {
    const first = Array.from({ length: 25 }, (_, i) =>
      row(`a${i}`, `ex a${i}`)
    );
    const second = Array.from({ length: 25 }, (_, i) =>
      row(`b${i}`, `ex b${i}`)
    );
    vi.mocked(axios.get)
      .mockResolvedValueOnce({
        data: {
          success: true,
          meta: { total: 50, hasNextPage: true, nextCursor: 'cur1' },
          data: first,
        },
      })
      .mockResolvedValueOnce({
        data: {
          success: true,
          meta: { total: 50, hasNextPage: false },
          data: second,
        },
      });

    const result = await exerciseDBService.searchExercises(
      'ex',
      [],
      [],
      10,
      20
    );

    expect(axios.get).toHaveBeenCalledTimes(2);
    expect(vi.mocked(axios.get).mock.calls[1]![1]?.params).toMatchObject({
      after: 'cur1',
    });
    expect(result.totalCount).toBe(50);
    expect(result.exercises.map((e) => e.exerciseId)).toEqual([
      'a20',
      'a21',
      'a22',
      'a23',
      'a24',
      'b0',
      'b1',
      'b2',
      'b3',
      'b4',
    ]);
  });

  it('does not call the API when a filter cannot match anything', async () => {
    const result = await exerciseDBService.searchExercises('', [], ['neck']);
    expect(axios.get).not.toHaveBeenCalled();
    expect(result).toEqual({ exercises: [], totalCount: 0 });
  });

  it('returns an empty result when the API call fails', async () => {
    vi.mocked(axios.get).mockRejectedValueOnce(new Error('timeout'));
    const result = await exerciseDBService.searchExercises('bench');
    expect(result).toEqual({ exercises: [], totalCount: 0 });
  });

  it('skips malformed rows', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: {
        success: true,
        meta: { total: 2, hasNextPage: false },
        data: [{ name: 'no id' }, null, row('x1', 'ok')],
      },
    });
    const result = await exerciseDBService.searchExercises('ok');
    expect(result.exercises.map((e) => e.exerciseId)).toEqual(['x1']);
  });
});

describe('ExerciseDBService.getExerciseById', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a normalized exercise', async () => {
    vi.mocked(axios.get).mockResolvedValueOnce({
      data: { success: true, data: row('EIeI8Vf', 'barbell bench press') },
    });
    const exercise = await exerciseDBService.getExerciseById('EIeI8Vf');
    expect(exercise?.gifUrl).toBe(
      'https://static.exercisedb.dev/media/EIeI8Vf.gif'
    );
    expect(vi.mocked(axios.get).mock.calls[0]![0]).toBe(
      'https://oss.exercisedb.dev/api/v1/exercises/EIeI8Vf'
    );
  });

  it('returns null when the lookup fails', async () => {
    vi.mocked(axios.get).mockRejectedValueOnce(new Error('404'));
    expect(await exerciseDBService.getExerciseById('nope')).toBeNull();
  });
});
