import {
  ROUTING_PROVIDER_DEFAULT_BASE_URL,
  ROUTING_PROVIDER_TYPE,
  resolveRouteGenerateCapabilities,
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

describe('route generate capabilities source', () => {
  const style = {
    surface: true,
    hilliness: true,
    avoidSteps: true,
    avoidBusyRoads: true,
  };

  it.each(['provider', 'env'] as const)('reads source %s', (source) => {
    const caps = resolveRouteGenerateCapabilities({
      available: true,
      maxAlternatives: 3,
      style,
      stops: false,
      source,
    });
    expect(caps.available).toBe(true);
    expect(caps.source).toBe(source);
  });

  it('reads a missing source (an older server) as null', () => {
    expect(resolveRouteGenerateCapabilities({ available: true }).source).toBe(
      null
    );
  });

  it('reads an unknown source as unavailable rather than guessing', () => {
    expect(
      routeGenerateCapabilitiesSchema.safeParse({
        available: true,
        source: 'somewhere',
      }).success
    ).toBe(false);
    expect(
      resolveRouteGenerateCapabilities({ available: true, source: 'somewhere' })
        .available
    ).toBe(false);
  });
});
