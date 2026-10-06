import externalProviderRepository from '../models/externalProviderRepository.js';
import { log } from '../config/logging.js';

/**
 * Which provider row a sync runs on: the row itself for providers a user can
 * connect more than once, otherwise the user's row of that provider type.
 */
export type SyncClaimTarget =
  | { userId: string; providerId: string }
  | { userId: string; providerType: string };

export interface ProviderSyncClaim {
  ids: string[];
  claimedAt: Date;
}

// Long enough for a normal sync; a server that dies mid-sync frees the account
// after this.
export const SYNC_CLAIM_EXPIRY_MINUTES = 30;

export const SYNC_ALREADY_RUNNING_MESSAGE =
  'A sync is already running for this account. Try again in a few minutes.';

/**
 * Claims the account for one sync, or returns null when another sync holds it.
 * With no matching row the sync runs unclaimed and reports its own
 * "not connected" error, as it did before claims existed.
 */
export async function claimProviderSync(
  target: SyncClaimTarget
): Promise<ProviderSyncClaim | null> {
  const claimedAt = new Date();
  const { matched, claimedIds } =
    await externalProviderRepository.claimProviderSyncRows(
      target,
      claimedAt,
      SYNC_CLAIM_EXPIRY_MINUTES
    );
  if (claimedIds.length < matched) {
    await releaseProviderSync({ ids: claimedIds, claimedAt });
    return null;
  }
  return { ids: claimedIds, claimedAt };
}

export async function releaseProviderSync(
  claim: ProviderSyncClaim
): Promise<void> {
  try {
    await externalProviderRepository.releaseProviderSyncRows(
      claim.ids,
      claim.claimedAt
    );
  } catch (error) {
    // The claim expires on its own, so a failed release only delays the next
    // sync; it must not turn a finished sync into a failed one.
    log('warn', '[SYNC] Failed to release provider sync claim:', error);
  }
}

/**
 * Claims the account and starts `sync`, or returns null when another sync
 * holds it. The claim is released when the sync settles, so a caller that
 * replies before the sync finishes still keeps the account claimed until then.
 * `running` is wrapped because awaiting a returned promise would wait for it.
 */
export async function startProviderSync<T>(
  target: SyncClaimTarget,
  sync: () => Promise<T>
): Promise<{ running: Promise<T> } | null> {
  const claim = await claimProviderSync(target);
  if (!claim) return null;
  const running = (async () => {
    try {
      return await sync();
    } finally {
      await releaseProviderSync(claim);
    }
  })();
  return { running };
}
