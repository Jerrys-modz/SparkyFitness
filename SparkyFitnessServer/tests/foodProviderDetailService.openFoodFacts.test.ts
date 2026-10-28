import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../services/externalFoodSearchService.js', () => ({
  isValidProviderType: vi.fn(() => true),
  resolveOpenFoodFactsProviderId: vi.fn(async () => null),
  resolveProviderCredentials: vi.fn(async () => ({})),
}));
vi.mock(
  '../integrations/openfoodfacts/openFoodFactsService.js',
  async (importOriginal) => ({
    ...(await importOriginal<object>()),
    searchOpenFoodFactsByBarcodeFields: vi.fn(),
  })
);

import { searchOpenFoodFactsByBarcodeFields } from '../integrations/openfoodfacts/openFoodFactsService.js';
import { fetchProviderFoodDetails } from '../services/foodProviderDetailService.js';

// Product Opener can hold a product whose nutrients are missing; the mapper
// turns those into zeros.
const productWithoutNutrients = {
  code: '0071315040159',
  product_name: 'Bread',
  nutriments: {},
};

function fetchBread(requireNutrition?: boolean) {
  return fetchProviderFoodDetails({
    credentialUserId: 'user-1',
    dataUserId: 'user-1',
    providerType: 'openfoodfacts',
    externalId: '0071315040159',
    requireNutrition,
  });
}

describe('fetchProviderFoodDetails - openfoodfacts nutrition', () => {
  beforeEach(() => {
    vi.mocked(searchOpenFoodFactsByBarcodeFields).mockResolvedValue({
      status: 1,
      product: productWithoutNutrients,
    } as never);
  });

  it('returns null for a product without nutrients when nutrition is required', async () => {
    expect(await fetchBread(true)).toBeNull();
  });

  it('still returns the product when nutrition is not required', async () => {
    expect(await fetchBread()).toMatchObject({ name: 'Bread' });
  });
});
