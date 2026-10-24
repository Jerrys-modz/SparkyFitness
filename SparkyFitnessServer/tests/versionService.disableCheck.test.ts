import { vi, afterEach, beforeEach, describe, it, expect } from 'vitest';

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
  },
}));
vi.mock('https', () => ({
  default: {
    get: vi.fn(),
  },
}));

import axios from 'axios';
import https from 'https';
import {
  getAppVersion,
  getLatestGitHubRelease,
} from '../services/versionService.js';

const ENV_NAME = 'SPARKY_FITNESS_DISABLE_VERSION_CHECK';

describe('versionService - SPARKY_FITNESS_DISABLE_VERSION_CHECK', () => {
  const originalEnv = process.env[ENV_NAME];

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env[ENV_NAME];
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env[ENV_NAME];
    } else {
      process.env[ENV_NAME] = originalEnv;
    }
  });

  it('makes no request to GitHub and reports the local version when disabled', async () => {
    process.env[ENV_NAME] = 'true';

    const result = await getLatestGitHubRelease(true);

    expect(axios.get).not.toHaveBeenCalled();
    expect(https.get).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      version: `v${getAppVersion()}`,
      isNewVersionAvailable: false,
      releaseNotes: '',
      htmlUrl: '',
    });
  });

  it.each(['false', 'TRUE', '1', ''])(
    'still checks GitHub when the variable is %s',
    async (value) => {
      process.env[ENV_NAME] = value;
      vi.mocked(axios.get).mockResolvedValue({
        data: {
          tag_name: 'v999.0.0',
          body: 'notes',
          published_at: '2026-01-01T00:00:00.000Z',
          html_url:
            'https://github.com/CodeWithCJ/SparkyFitness/releases/tag/v999.0.0',
        },
      });

      const result = await getLatestGitHubRelease(true);

      expect(axios.get).toHaveBeenCalledTimes(1);
      expect(result.version).toBe('v999.0.0');
      expect(result.isNewVersionAvailable).toBe(true);
    }
  );
});
