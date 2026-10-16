import { apiFetch } from '../../../src/services/api/apiClient';
import {
  assignBikeToExerciseEntry,
  createBikeComponent,
  deleteBikeComponent,
  fetchBike,
  fetchBikes,
  replaceBikeComponent,
  retireBikeComponent,
  updateBikeComponent,
} from '../../../src/services/api/bikesApi';

jest.mock('../../../src/services/api/apiClient');

const mockedApiFetch = jest.mocked(apiFetch);

beforeEach(() => {
  jest.clearAllMocks();
  mockedApiFetch.mockResolvedValue(undefined as never);
});

const lastCall = () => mockedApiFetch.mock.calls.at(-1)?.[0];

describe('bikesApi', () => {
  it('lists every bike, or only one status', async () => {
    await fetchBikes();
    expect(lastCall()).toEqual(
      expect.objectContaining({ endpoint: '/api/v2/bikes' })
    );
    await fetchBikes('retired');
    expect(lastCall()).toEqual(
      expect.objectContaining({ endpoint: '/api/v2/bikes?status=retired' })
    );
  });

  it('fetches one bike with its components', async () => {
    await fetchBike('b 1');
    expect(lastCall()).toEqual(
      expect.objectContaining({ endpoint: '/api/v2/bikes/b%201' })
    );
  });

  it('manages components under their bike', async () => {
    await createBikeComponent('b1', {
      component_type: 'chain',
      name: 'Chain',
      installed_on: '2026-03-01',
    });
    expect(lastCall()).toEqual(
      expect.objectContaining({
        endpoint: '/api/v2/bikes/b1/components',
        method: 'POST',
      })
    );
    await updateBikeComponent('b1', 'c1', { name: 'X' });
    expect(lastCall()).toEqual(
      expect.objectContaining({
        endpoint: '/api/v2/bikes/b1/components/c1',
        method: 'PUT',
      })
    );
    await retireBikeComponent('b1', 'c1', { retired_on: '2026-05-01' });
    expect(lastCall()).toEqual(
      expect.objectContaining({
        endpoint: '/api/v2/bikes/b1/components/c1/retire',
        method: 'POST',
        body: { retired_on: '2026-05-01' },
      })
    );
    await replaceBikeComponent('b1', 'c1', { replaced_on: '2026-05-01' });
    expect(lastCall()).toEqual(
      expect.objectContaining({
        endpoint: '/api/v2/bikes/b1/components/c1/replace',
        method: 'POST',
      })
    );
    await deleteBikeComponent('b1', 'c1');
    expect(lastCall()).toEqual(
      expect.objectContaining({
        endpoint: '/api/v2/bikes/b1/components/c1',
        method: 'DELETE',
      })
    );
  });

  it('links and clears a bike on a diary entry', async () => {
    await assignBikeToExerciseEntry('e1', 'b1');
    expect(lastCall()).toEqual(
      expect.objectContaining({
        endpoint: '/api/v2/bikes/assignments/e1',
        method: 'PUT',
        body: { bike_id: 'b1' },
      })
    );
    await assignBikeToExerciseEntry('e1', null);
    expect(lastCall()).toEqual(
      expect.objectContaining({ body: { bike_id: null } })
    );
  });
});
