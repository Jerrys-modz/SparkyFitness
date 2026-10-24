import {
  ROUTING_PROVIDER_TYPE,
  type RouteGenerateCapabilities,
} from '@workspace/shared';
import { log } from '../../config/logging.js';
import externalProviderRepository, {
  type RoutingProviderRow,
} from '../../models/externalProviderRepository.js';
import { describeError } from '../../utils/errors.js';
import { resolveProviderEndpoint } from '../providerEndpoint.js';
import { resolveStopsProvider } from '../routeStopsConfig.js';
import { isStopsEndpointBusy } from '../routeStopsService.js';
import type { RoutingProvider } from './routingProvider.js';
import { createValhallaProvider } from './valhallaProvider.js';

/** How long one call to the engine may take before it is abandoned. */
export const ROUTING_REQUEST_TIMEOUT_MS = 20_000;

/** Where a person's routing engine comes from. */
export type RoutingSource = NonNullable<RouteGenerateCapabilities['source']>;

export interface ResolvedRoutingProvider {
  provider: RoutingProvider;
  source: RoutingSource;
}

/** Builds the engine for a stored routing provider, or null when its URL is not allowed. */
async function buildProviderFromRow(
  row: RoutingProviderRow
): Promise<RoutingProvider | null> {
  const endpoint = await resolveProviderEndpoint(row, 'Routing provider');
  if (!endpoint) return null;
  return createValhallaProvider({
    baseUrl: endpoint.url,
    apiKey: row.app_key?.trim() || undefined,
    timeoutMs: ROUTING_REQUEST_TIMEOUT_MS,
    lookup: endpoint.lookup,
  });
}

/**
 * The routing engine this person should use, or null when route generation is
 * off for them: the routing provider they added, or one the admin made public
 * or a family member shared. A new or edited provider applies on the next
 * request; nothing is cached.
 */
export async function resolveRoutingProvider(
  userId: string
): Promise<ResolvedRoutingProvider | null> {
  try {
    const row = await externalProviderRepository.getActiveProviderWithKeyByType(
      userId,
      ROUTING_PROVIDER_TYPE
    );
    if (row) {
      const provider = await buildProviderFromRow(row);
      if (provider) return { provider, source: 'provider' };
    }
  } catch (error) {
    log(
      'warn',
      `Could not look up the routing provider: ${describeError(error)}`
    );
  }
  return null;
}

/**
 * What this person's routing engine and stops lookup support, as
 * `GET /generate/capabilities` reports it. The two are independent: stops
 * follow the Overpass provider, not the routing one.
 */
export async function getRouteGenerateCapabilities(
  userId: string
): Promise<RouteGenerateCapabilities> {
  const [resolved, resolvedStops] = await Promise.all([
    resolveRoutingProvider(userId),
    resolveStopsProvider(userId),
  ]);
  // An endpoint that asked us to slow down is left out for a moment, so the
  // screen simply offers no stops rather than failing.
  const stops =
    resolvedStops && !isStopsEndpointBusy(resolvedStops.url)
      ? resolvedStops
      : null;
  return {
    available: resolved !== null,
    maxAlternatives: resolved
      ? resolved.provider.capabilities.maxAlternatives
      : 1,
    style: resolved
      ? resolved.provider.capabilities.style
      : {
          surface: false,
          hilliness: false,
          avoidSteps: false,
          avoidBusyRoads: false,
        },
    stops: stops !== null,
    source: resolved ? resolved.source : null,
    stopsSource: stops ? stops.source : null,
  };
}
