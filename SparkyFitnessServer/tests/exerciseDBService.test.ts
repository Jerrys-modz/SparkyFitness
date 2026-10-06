import { vi, beforeEach, describe, expect, it } from 'vitest';

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

vi.mock('../utils/outboundUrlPolicy.js', () => ({
  createGuardedFetch: () => fetchMock,
  PUBLIC_ONLY_AI_NETWORK_POLICY: { allowPrivateNetwork: false },
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

import exerciseDBService, {
  mapExerciseDBExercise,
} from '../integrations/exercisedb/ExerciseDBService.js';

const jsonResponse = (body: unknown, ok = true, status = 200) => ({
  ok,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

/** A page of `count` mirror exercises numbered from `from`. */
const page = (
  from: number,
  count: number,
  meta: Record<string, unknown> = {}
) => ({
  success: true,
  meta: { total: 60, ...meta },
  data: Array.from({ length: count }, (_, i) => ({
    exerciseId: `id${from + i}`,
    name: `exercise ${from + i}`,
  })),
});

describe('mapExerciseDBExercise', () => {
  it('maps the mirror shape onto the library shape', () => {
    const mapped = mapExerciseDBExercise({
      exerciseId: 'abc123',
      name: 'weighted front plank',
      gifUrl: 'https://static.exercisedb.dev/media/abc123.gif',
      bodyParts: ['waist'],
      equipments: ['body weight', 'leverage machine', 'assisted'],
      targetMuscles: ['abdominals', 'pectorals'],
      secondaryMuscles: ['deltoids', 'obscure muscle'],
      instructions: ['Step:1 Get into position.', 'Step:2 Hold.'],
    });
    expect(mapped).toMatchObject({
      id: 'abc123',
      name: 'Weighted Front Plank',
      category: 'strength',
      equipment: ['body only', 'machine', 'assisted'],
      primary_muscles: ['abdominals', 'chest'],
      secondary_muscles: ['shoulders', 'obscure muscle'],
      instructions: ['Get into position.', 'Hold.'],
      description: 'Get into position.',
      mediaUrl: 'https://static.exercisedb.dev/media/abc123.gif',
    });
  });

  it('flags cardio body parts', () => {
    expect(
      mapExerciseDBExercise({
        exerciseId: '1',
        name: 'run',
        bodyParts: ['cardio'],
      })?.category
    ).toBe('cardio');
  });

  it('drops records without an id or name', () => {
    expect(mapExerciseDBExercise({ name: 'x' })).toBeNull();
    expect(mapExerciseDBExercise({ exerciseId: '1' })).toBeNull();
  });
});

describe('ExerciseDBService', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it('searches the mirror by name, 25 at a time', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(page(0, 3, { total: 3, hasNextPage: false }))
    );
    const result = await exerciseDBService.search('plank', 20, 0);
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'https://oss.exercisedb.dev/api/v1/exercises?limit=25&name=plank'
    );
    expect(result).toMatchObject({ totalCount: 3, hasMore: false });
    expect(result.exercises.map((e) => e.id)).toEqual(['id0', 'id1', 'id2']);
  });

  it('pages by cursor, not offset, and remembers cursors', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(page(0, 25, { hasNextPage: true, nextCursor: 'c1' }))
      )
      .mockResolvedValueOnce(
        jsonResponse(page(25, 25, { hasNextPage: true, nextCursor: 'c2' }))
      );
    // Items 20..40 span the first two mirror pages.
    const result = await exerciseDBService.search('cursorq', 20, 20);
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls[0]).not.toContain('after=');
    expect(urls[0]).not.toContain('offset');
    expect(urls[1]).toContain('after=c1');
    expect(result.exercises.map((e) => e.id)).toEqual(
      Array.from({ length: 20 }, (_, i) => `id${20 + i}`)
    );
    expect(result.hasMore).toBe(true);

    // The next page starts from the remembered cursor, not from page one.
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(page(50, 10, { hasNextPage: false }))
    );
    const later = await exerciseDBService.search('cursorq', 20, 50);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('after=c2');
    expect(later).toMatchObject({ totalCount: 60, hasMore: false });
  });

  it('fetches one exercise by id', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ data: { exerciseId: 'a/b', name: 'plank' } })
    );
    const exercise = await exerciseDBService.getById('a/b');
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'https://oss.exercisedb.dev/api/v1/exercises/a%2Fb'
    );
    expect(exercise?.name).toBe('Plank');
  });

  it('surfaces upstream failures', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'no' }, false, 503));
    await expect(exerciseDBService.search('x', 10, 0)).rejects.toThrow(
      'status 503'
    );
  });
});
