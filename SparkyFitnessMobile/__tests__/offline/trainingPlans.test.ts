import { getCacheRow } from '../../src/offline/cacheStore';
import {
  CACHE_COLLECTIONS,
  SINGLE_DOCUMENT_KEY,
} from '../../src/offline/collections';
import { __setOfflineDbForTests } from '../../src/offline/db';
import { setServerKnownUnreachable } from '../../src/offline/connection';
import { refreshTrainingPlans } from '../../src/offline/trainingPlans';
import { accountGeneration } from '../../src/offline/accountGeneration';
import {
  fetchRunProgram,
  fetchCustomRunPrograms,
} from '../../src/services/api/runProgramApi';
import { fetchRunGoals } from '../../src/services/api/runGoalsApi';
import { fetchFitnessTests } from '../../src/services/api/fitnessTestApi';
import { fetchRoutes } from '../../src/services/api/routeApi';
import { fetchShoes } from '../../src/services/api/shoesApi';
import { fetchTrainingCalendar } from '../../src/services/api/reportsApi';
import { apiFetch } from '../../src/services/api/apiClient';
import type { OfflineDb } from '../../src/offline/types';
import { createTestDb } from '../helpers/offlineTestDb';

jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/services/storage', () => ({
  getActiveServerConfigId: jest.fn(async () => 's1'),
  getActiveServerConfig: jest.fn(async () => ({
    id: 's1',
    url: 'https://one',
  })),
}));
jest.mock('../../src/services/api/apiClient', () => ({ apiFetch: jest.fn() }));

const mockFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

describe('training programs and calendar offline', () => {
  let db: OfflineDb & { close(): void };
  beforeEach(async () => {
    db = await createTestDb();
    __setOfflineDbForTests(db);
    setServerKnownUnreachable(false);
    mockFetch.mockReset();
  });
  afterEach(() => {
    setServerKnownUnreachable(false);
    __setOfflineDbForTests(null);
    db.close();
  });

  it('keeps the program, own programs and calendar months for the Library', async () => {
    mockFetch.mockImplementation(async ({ endpoint }) => {
      if (endpoint.includes('/custom')) return { programs: [{ id: 'c1' }] };
      if (endpoint.includes('run-program'))
        return { program: { program_id: 'p1' } };
      return { today: '2026-11-23', items: [] };
    });
    await refreshTrainingPlans(db, 's1', 1, accountGeneration());

    const program = await getCacheRow(
      db,
      's1',
      CACHE_COLLECTIONS.runProgram,
      SINGLE_DOCUMENT_KEY
    );
    expect(program?.payload).toEqual({ program: { program_id: 'p1' } });
    const custom = await getCacheRow(
      db,
      's1',
      CACHE_COLLECTIONS.customRunPrograms,
      SINGLE_DOCUMENT_KEY
    );
    expect(custom?.payload).toEqual({ programs: [{ id: 'c1' }] });
    const calls = mockFetch.mock.calls.filter(([o]) =>
      o.endpoint.includes('training-calendar')
    );
    expect(calls).toHaveLength(3);
  });

  it('answers all three reads from the phone when the server is away', async () => {
    mockFetch.mockImplementation(async ({ endpoint }) => {
      if (endpoint.includes('/custom')) return { programs: [{ id: 'c1' }] };
      if (endpoint.includes('run-program'))
        return { program: { program_id: 'p1' } };
      return { today: '2026-11-23', items: [] };
    });
    await fetchRunProgram();
    await fetchCustomRunPrograms();
    await fetchTrainingCalendar('2026-11-01', '2026-12-05');

    mockFetch.mockRejectedValue(new TypeError('Network request failed'));
    expect(await fetchRunProgram()).toEqual({ program: { program_id: 'p1' } });
    expect(await fetchCustomRunPrograms()).toEqual({
      programs: [{ id: 'c1' }],
    });
    expect(
      await fetchTrainingCalendar('2026-11-01', '2026-12-05')
    ).toMatchObject({
      today: '2026-11-23',
    });
  });

  it('keeps goals, fitness tests, routes and shoes and answers from them offline', async () => {
    mockFetch.mockImplementation(async ({ endpoint }) => {
      if (endpoint.includes('run-goals')) return { goals: { weekly: 20 } };
      if (endpoint.includes('fitness-tests')) return { tests: [{ id: 't1' }] };
      if (endpoint.includes('/routes')) return { routes: [{ id: 'r1' }] };
      if (endpoint.includes('shoes')) return [{ id: 'sh1' }];
      if (endpoint.includes('/custom')) return { programs: [] };
      if (endpoint.includes('run-program')) return { program: null };
      return { today: '2026-11-23', items: [] };
    });
    await refreshTrainingPlans(db, 's1', 0, accountGeneration());
    mockFetch.mockRejectedValue(new TypeError('Network request failed'));

    expect(await fetchRunGoals()).toEqual({ goals: { weekly: 20 } });
    expect(await fetchFitnessTests()).toEqual({ tests: [{ id: 't1' }] });
    expect(await fetchRoutes()).toEqual({ routes: [{ id: 'r1' }] });
    expect(await fetchShoes('active')).toEqual([{ id: 'sh1' }]);
    expect(await fetchShoes()).toEqual([{ id: 'sh1' }]);
  });

  it('does not invent a month the phone never kept', async () => {
    mockFetch.mockRejectedValue(new TypeError('Network request failed'));
    await expect(
      fetchTrainingCalendar('2030-01-01', '2030-02-05')
    ).rejects.toThrow();
  });
});
