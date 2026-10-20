import {
  ROUTING_PROVIDER_DEFAULT_BASE_URL,
  ROUTING_PROVIDER_TYPE,
  routeGenerateCapabilitiesSchema,
} from '@workspace/shared';

describe('routing provider constants', () => {
  it('names the provider type seeded by the migration and the suggested URL', () => {
    expect(ROUTING_PROVIDER_TYPE).toBe('valhalla');
    expect(ROUTING_PROVIDER_DEFAULT_BASE_URL).toBe(
      'https://valhalla1.openstreetmap.de'
    );
    expect(() => new URL(ROUTING_PROVIDER_DEFAULT_BASE_URL)).not.toThrow();
  });
});

describe('route generate capabilities', () => {
  it('reads an unavailable answer with the single-route defaults', () => {
    expect(routeGenerateCapabilitiesSchema.parse({ available: false })).toEqual(
      {
        available: false,
        maxAlternatives: 1,
        style: {
          surface: false,
          hilliness: false,
          avoidSteps: false,
          avoidBusyRoads: false,
        },
        stops: false,
        source: null,
      }
    );
  });

  it('reads the provider source', () => {
    const parsed = routeGenerateCapabilitiesSchema.parse({
      available: true,
      source: 'provider',
    });
    expect(parsed.available).toBe(true);
    expect(parsed.source).toBe('provider');
  });

  it('rejects an unknown source rather than guessing', () => {
    expect(
      routeGenerateCapabilitiesSchema.safeParse({
        available: true,
        source: 'somewhere',
      }).success
    ).toBe(false);
  });
});
