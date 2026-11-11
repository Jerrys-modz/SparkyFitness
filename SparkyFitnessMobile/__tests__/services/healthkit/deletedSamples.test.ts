import { queryQuantitySamplesWithAnchor } from '@kingstinct/react-native-healthkit';
import { readDeletedWaterSampleIds } from '../../../src/services/healthkit/deletedSamples';

const mockQuery = queryQuantitySamplesWithAnchor as jest.Mock;

const samples = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ uuid: `new-${i}` }));

describe('readDeletedWaterSampleIds', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('returns deleted ids and the new anchor from one page', async () => {
    mockQuery.mockResolvedValueOnce({
      samples: samples(1),
      deletedSamples: [{ uuid: 'gone-1' }, { uuid: 'gone-2' }],
      newAnchor: 'anchor-2',
    });

    const result = await readDeletedWaterSampleIds('anchor-1');

    expect(mockQuery).toHaveBeenCalledWith(
      'HKQuantityTypeIdentifierDietaryWater',
      { anchor: 'anchor-1', limit: 2000 }
    );
    expect(result).toEqual({
      ids: ['gone-1', 'gone-2'],
      newAnchor: 'anchor-2',
    });
  });

  it('pages through a full first read until a short page', async () => {
    mockQuery
      .mockResolvedValueOnce({
        samples: samples(1999),
        deletedSamples: [{ uuid: 'gone-1' }],
        newAnchor: 'p1',
      })
      .mockResolvedValueOnce({
        samples: samples(3),
        deletedSamples: [{ uuid: 'gone-1' }, { uuid: 'gone-2' }],
        newAnchor: 'p2',
      });

    const result = await readDeletedWaterSampleIds(undefined);

    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(mockQuery.mock.calls[1][1]).toEqual({ anchor: 'p1', limit: 2000 });
    expect(result).toEqual({ ids: ['gone-1', 'gone-2'], newAnchor: 'p2' });
  });

  it('stops when the anchor does not move', async () => {
    mockQuery.mockResolvedValue({
      samples: samples(2000),
      deletedSamples: [],
      newAnchor: 'same',
    });

    const result = await readDeletedWaterSampleIds('same');

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ids: [], newAnchor: 'same' });
  });
});
