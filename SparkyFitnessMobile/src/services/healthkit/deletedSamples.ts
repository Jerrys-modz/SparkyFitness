import { queryQuantitySamplesWithAnchor } from '@kingstinct/react-native-healthkit';
import type { DeletedSamplesRead } from '../shared/healthStoreDeletions';

const DIETARY_WATER = 'HKQuantityTypeIdentifierDietaryWater' as const;

/** Results per anchored query. HealthKit counts new and deleted objects together. */
const PAGE_SIZE = 2_000;
/**
 * Pages per run. A first run (no anchor) walks every water sample ever saved
 * to reach the current anchor; past this cap it stops and the next sync
 * carries on from the anchor it reached.
 */
const MAX_PAGES = 25;

/**
 * Ids of DietaryWater samples deleted from Apple Health since `anchor`, and
 * the anchor to resume from next time (#3489). New samples are counted only
 * to page through; they reach the server through the normal sync.
 *
 * Without an anchor HealthKit returns the whole history, so the first run
 * mostly establishes the anchor; deletions from before it are not reported.
 */
export const readDeletedWaterSampleIds = async (
  anchor: string | undefined
): Promise<DeletedSamplesRead> => {
  const ids = new Set<string>();
  let current = anchor;
  for (let page = 0; page < MAX_PAGES; page++) {
    const response = await queryQuantitySamplesWithAnchor(DIETARY_WATER, {
      anchor: current,
      limit: PAGE_SIZE,
    });
    for (const deleted of response.deletedSamples) {
      if (deleted.uuid) ids.add(deleted.uuid);
    }
    const received = response.samples.length + response.deletedSamples.length;
    const advanced = response.newAnchor !== current;
    current = response.newAnchor;
    if (received < PAGE_SIZE || !advanced) break;
  }
  return { ids: [...ids], newAnchor: current };
};
