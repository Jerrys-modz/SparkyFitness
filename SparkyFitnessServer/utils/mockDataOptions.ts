import { isMockDataEnabled } from '../models/globalSettingsRepository.js';

export interface MockDataOptions {
  /** Provider slug, or 'local' to replay a previously captured bundle. */
  dataSource?: string;
  /** Whether to write this sync's raw provider responses to mock_data/. */
  saveMockData: boolean;
}

const DISABLED: MockDataOptions = {
  dataSource: undefined,
  saveMockData: false,
};

/**
 * Resolves the per-sync mock-data options from a request body.
 *
 * Both options are developer/support tooling: one makes the server write raw
 * provider responses to disk, the other replays them instead of calling the
 * provider. They are only honoured while an admin has turned on the
 * `mock_data_enabled` global setting, which is off by default — so on a normal
 * instance a user cannot reach either capability, whatever they post.
 */
export async function resolveMockDataOptions(
  body: unknown
): Promise<MockDataOptions> {
  if (!(await isMockDataEnabled())) {
    return DISABLED;
  }
  const source = body as
    { dataSource?: unknown; saveMockData?: unknown } | null | undefined;
  return {
    dataSource:
      typeof source?.dataSource === 'string' ? source.dataSource : undefined,
    saveMockData: source?.saveMockData === true,
  };
}
