import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getBarcodeAlternatives } from '../services/barcodeLookupService.js';
const mocks = vi.hoisted(() => ({
  providers: vi.fn(),
  preferences: vi.fn(),
  local: vi.fn(),
  lookup: vi.fn(),
}));
vi.mock('../services/externalProviderService.js', () => ({
  default: { getExternalDataProviders: mocks.providers },
}));
vi.mock('../services/preferenceService.js', () => ({
  default: { getUserPreferences: mocks.preferences },
}));
vi.mock('../models/foodRepository.js', () => ({
  default: { findFoodByBarcode: mocks.local },
}));
vi.mock('../services/foodCoreService.js', () => ({
  default: { lookupBarcode: mocks.lookup },
}));
vi.mock('../services/foodProviderDetailService.js', () => ({
  normalizeFoodForResponse: (food: unknown) => food,
}));
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const barcode = '1234567890123';
const food = (externalId = 'product-b') => ({
  name: 'Selected product',
  brand: null,
  is_custom: false,
  barcode,
  provider_external_id: externalId,
  provider_type: 'usda',
  default_variant: {
    serving_size: 100,
    serving_unit: 'g',
    calories: 120,
    protein: 3,
    carbs: 20,
    fat: 2,
    is_default: true,
  },
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.providers.mockResolvedValue([
    {
      id: A,
      provider_name: 'First',
      provider_type: 'usda',
      is_active: true,
      supports_barcode: true,
      sort_order: 0,
    },
    {
      id: B,
      provider_name: 'Second',
      provider_type: 'usda',
      is_active: true,
      supports_barcode: true,
      sort_order: 1,
    },
    {
      id: C,
      provider_name: 'Third',
      provider_type: 'fatsecret',
      is_active: true,
      supports_barcode: true,
      sort_order: 2,
    },
  ]);
  mocks.preferences.mockResolvedValue({
    barcode_fallback_open_food_facts: false,
  });
  mocks.local.mockResolvedValue(null);
  mocks.lookup.mockResolvedValue({ source: 'not_found', food: null });
});
describe('barcode alternatives', () => {
  it('includes local and every source, preserves successful matches on another source error', async () => {
    mocks.local.mockResolvedValue({ ...food('local'), id: 'local-id' });
    mocks.lookup.mockImplementation(
      async (_b: string, _u: string, id: string) => {
        if (id === A) throw new Error('provider credentials must not appear');
        return {
          source: id === B ? 'usda' : 'not_found',
          food: id === B ? food() : null,
        };
      }
    );
    const result = await getBarcodeAlternatives(barcode, 'target', 'actor');
    expect(
      result.results.map((candidate) => [
        candidate.providerId,
        candidate.status,
      ])
    ).toEqual([
      ['local', 'found'],
      [A, 'error'],
      [B, 'found'],
      [C, 'not_found'],
    ]);
    expect(JSON.stringify(result)).not.toContain('credentials');
  });
  it('does not include the anonymous fallback when it is disabled', async () => {
    const result = await getBarcodeAlternatives(barcode, 'target', 'actor');
    expect(result.results).toHaveLength(3);
  });
  it.each([true, false])(
    'uses the active profile language, scaling and fallback setting (%s) with actor credentials',
    async (fallbackEnabled) => {
      const actorPreferences = {
        language: 'en',
        auto_scale_open_food_facts_imports: true,
        barcode_fallback_open_food_facts: !fallbackEnabled,
      };
      const profilePreferences = {
        language: 'de',
        auto_scale_open_food_facts_imports: false,
        barcode_fallback_open_food_facts: fallbackEnabled,
      };
      mocks.preferences.mockImplementation(
        async (_actorId: string, targetId: string) =>
          targetId === 'target' ? profilePreferences : actorPreferences
      );
      mocks.providers.mockResolvedValue([
        {
          id: A,
          provider_name: 'Actor USDA',
          provider_type: 'usda',
          is_active: true,
          supports_barcode: true,
        },
      ]);

      const result = await getBarcodeAlternatives(barcode, 'target', 'actor');

      expect(mocks.providers).toHaveBeenCalledWith('actor', 'actor');
      expect(mocks.preferences).toHaveBeenCalledWith('actor', 'target');
      expect(result.results.map((candidate) => candidate.providerId)).toEqual(
        fallbackEnabled ? [A, 'openfoodfacts-fallback'] : [A]
      );
      expect(mocks.lookup).toHaveBeenCalledTimes(fallbackEnabled ? 2 : 1);
      expect(mocks.lookup).toHaveBeenCalledWith(
        barcode,
        'target',
        A,
        'actor',
        expect.objectContaining({ preferences: profilePreferences })
      );
      if (fallbackEnabled) {
        expect(mocks.lookup).toHaveBeenCalledWith(
          barcode,
          'target',
          undefined,
          'actor',
          expect.objectContaining({
            preferences: profilePreferences,
            skipFallback: false,
            ignoreDefaultProvider: true,
          })
        );
      }
    }
  );
  it('uses only actor-accessible active barcode providers and profile-visible local foods', async () => {
    mocks.providers.mockResolvedValue([
      {
        id: A,
        provider_name: 'Disabled',
        provider_type: 'usda',
        is_active: false,
      },
      {
        id: B,
        provider_name: 'Unsupported',
        provider_type: 'mealie',
        is_active: true,
      },
      {
        id: C,
        provider_name: 'Available',
        provider_type: 'fatsecret',
        is_active: true,
      },
    ]);
    const result = await getBarcodeAlternatives(barcode, 'target', 'actor');
    expect(result.results.map((candidate) => candidate.providerId)).toEqual([
      C,
    ]);
    expect(mocks.providers).toHaveBeenCalledWith('actor', 'actor');
    expect(mocks.local).toHaveBeenCalledWith(barcode, 'target');
    expect(mocks.lookup).toHaveBeenCalledWith(
      barcode,
      'target',
      C,
      'actor',
      expect.objectContaining({
        skipLocal: true,
        skipFallback: true,
        ignoreDefaultProvider: true,
        surfaceErrors: true,
      })
    );
  });
  it('offers the enabled anonymous fallback without repeating a configured OFF provider', async () => {
    mocks.preferences.mockResolvedValue({
      barcode_fallback_open_food_facts: true,
    });
    const anonymous = await getBarcodeAlternatives(barcode, 'target', 'actor');
    expect(anonymous.results.at(-1)?.providerId).toBe('openfoodfacts-fallback');
    mocks.providers.mockResolvedValue([
      {
        id: A,
        provider_name: 'OFF',
        provider_type: 'openfoodfacts',
        is_active: true,
      },
    ]);
    const configured = await getBarcodeAlternatives(barcode, 'target', 'actor');
    expect(configured.results.map((candidate) => candidate.providerId)).toEqual(
      [A]
    );
  });
  it('bounds slow source lookups without losing a successful result', async () => {
    vi.useFakeTimers();
    try {
      mocks.lookup.mockImplementation(
        async (_barcode: string, _userId: string, id: string) => {
          if (id === A) return new Promise(() => {});
          return { source: 'usda', food: food() };
        }
      );
      const lookup = getBarcodeAlternatives(barcode, 'target', 'actor');
      await vi.advanceTimersByTimeAsync(12000);
      const result = await lookup;
      expect(result.results.map((candidate) => candidate.status)).toEqual([
        'error',
        'found',
        'found',
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
});
