import { fetchImmunizations } from '../../src/services/api/immunizationsApi';
import { apiFetch } from '../../src/services/api/apiClient';
import { ApiError } from '../../src/services/api/errors';
import { setServerKnownUnreachable } from '../../src/offline/connection';
import { __setOfflineDbForTests } from '../../src/offline/db';
import type { OfflineDb } from '../../src/offline/types';
import { createTestDb } from '../helpers/offlineTestDb';

jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/services/api/apiClient', () => ({ apiFetch: jest.fn() }));
jest.mock('../../src/services/storage', () => ({
  getActiveServerConfigId: jest.fn(async () => 's1'),
  getActiveServerConfig: jest.fn(async () => ({
    id: 's1',
    url: 'https://one',
  })),
}));

const records = [
  {
    id: 'i1',
    user_id: 'u1',
    vaccine_name: 'Influenza',
    vaccine_code: null,
    administered_on: '2026-10-01',
    dose_number: null,
    lot_number: null,
    administered_by: null,
    site: null,
    next_due_on: '2027-10-01',
    notes: null,
    source: 'manual',
    created_at: '2026-10-01T10:00:00.000Z',
    updated_at: '2026-10-01T10:00:00.000Z',
  },
];

describe('fetchImmunizations', () => {
  let db: OfflineDb & { close(): void };

  beforeEach(async () => {
    jest.clearAllMocks();
    db = await createTestDb();
    __setOfflineDbForTests(db);
    setServerKnownUnreachable(false);
  });

  afterEach(() => {
    setServerKnownUnreachable(false);
    __setOfflineDbForTests(null);
    db.close();
  });

  it('answers from the phone with the last list the server gave when it cannot be reached', async () => {
    jest.mocked(apiFetch).mockResolvedValueOnce(records);
    expect(await fetchImmunizations()).toEqual(records);

    jest.mocked(apiFetch).mockRejectedValueOnce(new ApiError('down', 503));
    expect(await fetchImmunizations()).toEqual(records);
  });

  it('does not hide a real answer from the server behind the saved list', async () => {
    jest.mocked(apiFetch).mockResolvedValueOnce(records);
    await fetchImmunizations();
    jest.mocked(apiFetch).mockRejectedValueOnce(new ApiError('no access', 403));
    await expect(fetchImmunizations()).rejects.toThrow();
  });

  it('fails as before when there is no saved list yet', async () => {
    jest.mocked(apiFetch).mockRejectedValueOnce(new ApiError('down', 503));
    await expect(fetchImmunizations()).rejects.toThrow();
  });
});
