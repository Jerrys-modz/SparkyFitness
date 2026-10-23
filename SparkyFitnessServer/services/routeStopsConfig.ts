import { STOPS_PROVIDER_TYPE } from '@workspace/shared';
import { log } from '../config/logging.js';
import externalProviderRepository from '../models/externalProviderRepository.js';
import { describeError } from '../utils/errors.js';
import {
  resolveProviderEndpoint,
  type ProviderEndpoint,
} from './providerEndpoint.js';

/** Where a person's stops lookup comes from. */
export type StopsSource = 'provider';

export interface ResolvedStopsProvider extends ProviderEndpoint {
  source: StopsSource;
}

/**
 * The Overpass endpoint this person should use for stops, or null when the
 * lookup is off for them: the provider they added, or one the admin made
 * public or a family member shared. A new or edited provider applies on the
 * next request; nothing about the provider is cached.
 */
export async function resolveStopsProvider(
  userId: string
): Promise<ResolvedStopsProvider | null> {
  try {
    const row = await externalProviderRepository.getActiveProviderWithKeyByType(
      userId,
      STOPS_PROVIDER_TYPE
    );
    if (!row) return null;
    const endpoint = await resolveProviderEndpoint(row, 'Stops provider');
    return endpoint ? { ...endpoint, source: 'provider' } : null;
  } catch (error) {
    log(
      'warn',
      `Could not look up the stops provider: ${describeError(error)}`
    );
    return null;
  }
}
