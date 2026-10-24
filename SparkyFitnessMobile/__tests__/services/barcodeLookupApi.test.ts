import { lookupBarcodeV2 } from '../../src/services/api/externalFoodSearchApi';
import { apiFetch } from '../../src/services/api/apiClient';

jest.mock('../../src/services/api/apiClient', () => ({ apiFetch: jest.fn() }));

const mockApiFetch = jest.mocked(apiFetch);

describe('barcode lookup metadata', () => {
  it('retains source identity even on no match', async () => {
    const response = {
      source: 'not_found',
      food: null,
      providerId: null,
      providerName: 'Open Food Facts',
    };
    mockApiFetch.mockResolvedValue(response);
    expect(await lookupBarcodeV2('1234567890123')).toEqual(response);
  });
});
