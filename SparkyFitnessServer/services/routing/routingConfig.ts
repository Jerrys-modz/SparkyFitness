import type { RouteGenerateCapabilities } from '@workspace/shared';
import { log } from '../../config/logging.js';
import { isRouteStopsAvailable } from '../routeStopsConfig.js';
import type { RoutingProvider } from './routingProvider.js';
import { createValhallaProvider } from './valhallaProvider.js';

/** How long one call to the engine may take before it is abandoned. */
export const ROUTING_REQUEST_TIMEOUT_MS = 20_000;

const SUPPORTED_PROVIDERS = ['valhalla'] as const;

let warnedUnknownProvider = false;

/**
 * The configured routing engine, or null when route generation is switched
 * off. Read from the environment on every call so the admin only has to set
 * variables (and `SPARKY_FITNESS_ROUTING_API_KEY_FILE` is resolved at boot by
 * `utils/secretLoader.ts`).
 */
export function getRoutingProvider(): RoutingProvider | null {
  const baseUrl = process.env.SPARKY_FITNESS_ROUTING_URL?.trim();
  if (!baseUrl) return null;

  const kind = (
    process.env.SPARKY_FITNESS_ROUTING_PROVIDER?.trim() || 'valhalla'
  ).toLowerCase();
  if (!(SUPPORTED_PROVIDERS as readonly string[]).includes(kind)) {
    if (!warnedUnknownProvider) {
      warnedUnknownProvider = true;
      log(
        'warn',
        `SPARKY_FITNESS_ROUTING_PROVIDER "${kind}" is not supported (supported: ${SUPPORTED_PROVIDERS.join(', ')}); route generation is unavailable.`
      );
    }
    return null;
  }

  try {
    // Reject anything that is not an http(s) URL up front.
    const url = new URL(baseUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  } catch {
    return null;
  }

  return createValhallaProvider({
    baseUrl,
    apiKey: process.env.SPARKY_FITNESS_ROUTING_API_KEY?.trim() || undefined,
    timeoutMs: ROUTING_REQUEST_TIMEOUT_MS,
  });
}

/** What the configured engine supports, as `GET /generate/capabilities` reports it. */
export function getRouteGenerateCapabilities(): RouteGenerateCapabilities {
  const provider = getRoutingProvider();
  const stops = isRouteStopsAvailable();
  if (!provider) {
    return {
      available: false,
      maxAlternatives: 1,
      style: {
        surface: false,
        hilliness: false,
        avoidSteps: false,
        avoidBusyRoads: false,
      },
      stops,
    };
  }
  return {
    available: true,
    maxAlternatives: provider.capabilities.maxAlternatives,
    style: provider.capabilities.style,
    stops,
  };
}

export function isRouteGenerationAvailable(): boolean {
  return getRoutingProvider() !== null;
}
