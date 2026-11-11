import AsyncStorage from '@react-native-async-storage/async-storage';
import { HEALTH_DATA_DELETIONS_MAX_IDS } from '@workspace/shared';
import { postHealthDataDeletions } from '../api/healthDataDeletionsApi';
import { ApiError } from '../api/errors';
import { addLog } from '../LogService';
import type { ServerConfig } from '../storage';

/** One read of a health store's deletion log. */
export interface DeletedSamplesRead {
  /** Ids of samples deleted since the anchor it was given. */
  ids: string[];
  /** Where the next read resumes. */
  newAnchor: string | undefined;
}

export type DeletedSamplesReader = (
  anchor: string | undefined
) => Promise<DeletedSamplesRead>;

const ANCHOR_KEY_PREFIX = '@HealthStoreDeletions:waterAnchor';

/**
 * The anchor is kept per server config: each server learns of a deletion only
 * once, and a phone pointed at two servers tells both. Another sign-in on the
 * same config keeps it; its ids match nothing there unless that account
 * imported the same samples, and then removing them is still right.
 */
const anchorKey = (config: ServerConfig): string =>
  `${ANCHOR_KEY_PREFIX}:${config.id}`;

export interface HydrationDeletionsResult {
  /** Ids read from the health store. */
  found: number;
  /** Rows the server removed. */
  deleted: number;
}

/**
 * Tells the server which imported water samples were deleted in the health
 * store since the last run (#3489), then saves the new anchor. The anchor is
 * saved only once the server has answered, so a failed request re-reads the
 * same deletions next time. A server that predates the endpoint (404) cannot
 * use them, so the anchor moves on rather than re-reading forever.
 *
 * Throws on a read or upload failure; callers run it best effort.
 */
export const syncHydrationDeletions = async (
  readDeleted: DeletedSamplesReader,
  config: ServerConfig,
  source: string,
  logTag: string
): Promise<HydrationDeletionsResult> => {
  const key = anchorKey(config);
  const stored = await AsyncStorage.getItem(key);
  const anchor = stored ?? undefined;
  const { ids, newAnchor } = await readDeleted(anchor);

  let deleted = 0;
  try {
    for (let i = 0; i < ids.length; i += HEALTH_DATA_DELETIONS_MAX_IDS) {
      const response = await postHealthDataDeletions(
        {
          type: 'water',
          source,
          source_ids: ids.slice(i, i + HEALTH_DATA_DELETIONS_MAX_IDS),
        },
        config
      );
      deleted += response?.deleted ?? 0;
    }
  } catch (error) {
    if (!(error instanceof ApiError && error.statusCode === 404)) throw error;
    addLog(
      `${logTag} Server does not support removing deleted samples; skipping ${ids.length} water deletion(s)`,
      'WARNING'
    );
  }

  if (newAnchor && newAnchor !== anchor) {
    await AsyncStorage.setItem(key, newAnchor);
  }
  if (ids.length > 0) {
    addLog(
      `${logTag} ${ids.length} water sample(s) deleted in the health store; server removed ${deleted}`,
      'INFO'
    );
  }
  return { found: ids.length, deleted };
};
