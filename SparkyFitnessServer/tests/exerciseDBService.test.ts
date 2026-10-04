import { vi, beforeEach, afterEach, describe, expect, it } from 'vitest';

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

vi.mock('../utils/outboundUrlPolicy.js', () => ({
  createGuardedFetch: () => fetchMock,
  PUBLIC_ONLY_AI_NETWORK_POLICY: { allowPrivateNetwork: false },
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../models/externalProviderRepository.js', () => ({
  default: {
    getExternalDataProviderById: vi.fn(),
    checkExternalDataProviderAccess: vi.fn(),
  },
}));

import exerciseDBService, {
  mapExerciseDBExercise,
} from '../integrations/exercisedb/ExerciseDBService.js';
import externalProviderRepository from '../models/externalProviderRepository.js';

const jsonResponse = (body: unknown, ok = true, status = 200) => ({
  ok,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
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

  it('maps the RapidAPI shape and flags cardio body parts', () => {
    const mapped = mapExerciseDBExercise({
      id: '0001',
      name: 'run',
      bodyPart: 'cardio',
      equipment: 'body weight',
      target: 'cardiovascular system',
      gifUrl: 'https://v2.exercisedb.io/image/x',
    });
    expect(mapped).toMatchObject({
      id: '0001',
      category: 'cardio',
      equipment: ['body only'],
      primary_muscles: ['cardiovascular system'],
    });
  });

  it('drops records without an id or name', () => {
    expect(mapExerciseDBExercise({ name: 'x' })).toBeNull();
    expect(mapExerciseDBExercise({ exerciseId: '1' })).toBeNull();
  });
});

describe('ExerciseDBService', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    delete process.env.EXERCISEDB_OSS_URL;
  });

  afterEach(() => {
    delete process.env.EXERCISEDB_OSS_URL;
  });

  it('searches the mirror by name with offset paging', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        success: true,
        meta: { total: 17 },
        data: [{ exerciseId: 'a', name: 'plank' }],
      })
    );
    const result = await exerciseDBService.search(
      'user-1',
      'exercisedb-oss',
      '',
      'plank',
      10,
      0
    );
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toBe(
      'https://oss.exercisedb.dev/api/v1/exercises?limit=10&offset=0&name=plank'
    );
    expect(result).toMatchObject({ totalCount: 17, hasMore: true });
    expect(result.exercises[0].name).toBe('Plank');
  });

  it('uses EXERCISEDB_OSS_URL for a self-hosted mirror', async () => {
    process.env.EXERCISEDB_OSS_URL = 'http://exercisedb.local:3000/';
    fetchMock.mockResolvedValue(
      jsonResponse({ data: { exerciseId: 'a', name: 'plank' } })
    );
    await exerciseDBService.getById('user-1', 'exercisedb-oss', '', 'a');
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'http://exercisedb.local:3000/api/v1/exercises/a'
    );
  });

  it('sends the stored RapidAPI key and refuses providers the user cannot use', async () => {
    vi.mocked(
      externalProviderRepository.checkExternalDataProviderAccess
    ).mockResolvedValue(true);
    vi.mocked(
      externalProviderRepository.getExternalDataProviderById
    ).mockResolvedValue({
      provider_type: 'exercisedb',
      app_key: 'secret-key',
    });
    fetchMock.mockResolvedValue(
      jsonResponse([{ id: '1', name: 'run', bodyPart: 'cardio' }])
    );
    const result = await exerciseDBService.search(
      'user-1',
      'exercisedb',
      'prov-1',
      'Run',
      1,
      0
    );
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/exercises/name/run?');
    expect(init.headers['X-RapidAPI-Key']).toBe('secret-key');
    // A full page implies there may be more; RapidAPI gives no total.
    expect(result.hasMore).toBe(true);

    vi.mocked(
      externalProviderRepository.checkExternalDataProviderAccess
    ).mockResolvedValue(false);
    await expect(
      exerciseDBService.search('user-2', 'exercisedb', 'prov-1', 'Run', 1, 0)
    ).rejects.toThrow('ExerciseDB provider not found.');
  });

  it('surfaces upstream failures', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'no' }, false, 503));
    await expect(
      exerciseDBService.search('u', 'exercisedb-oss', '', 'x', 10, 0)
    ).rejects.toThrow('status 503');
  });
});
