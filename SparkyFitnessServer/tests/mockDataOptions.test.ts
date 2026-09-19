import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../models/globalSettingsRepository.js', () => ({
  isMockDataEnabled: vi.fn(),
}));

import { isMockDataEnabled } from '../models/globalSettingsRepository.js';
import { resolveMockDataOptions } from '../utils/mockDataOptions.js';

const mockIsEnabled = vi.mocked(isMockDataEnabled);

describe('resolveMockDataOptions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('when the admin setting is off (the default)', () => {
    beforeEach(() => {
      mockIsEnabled.mockResolvedValue(false);
    });

    it('ignores a posted saveMockData, so nothing is written to disk', async () => {
      const options = await resolveMockDataOptions({ saveMockData: true });
      expect(options).toEqual({ dataSource: undefined, saveMockData: false });
    });

    it('ignores a posted dataSource, so the real provider is still called', async () => {
      const options = await resolveMockDataOptions({ dataSource: 'local' });
      expect(options.dataSource).toBeUndefined();
    });
  });

  describe('when an admin has turned it on', () => {
    beforeEach(() => {
      mockIsEnabled.mockResolvedValue(true);
    });

    it('honours both options', async () => {
      const options = await resolveMockDataOptions({
        dataSource: 'local',
        saveMockData: true,
      });
      expect(options).toEqual({ dataSource: 'local', saveMockData: true });
    });

    it('defaults to off for a body that asks for neither', async () => {
      const options = await resolveMockDataOptions({ startDate: '2026-01-01' });
      expect(options).toEqual({ dataSource: undefined, saveMockData: false });
    });

    it('only accepts a string dataSource and a literal true', async () => {
      const options = await resolveMockDataOptions({
        dataSource: 123,
        saveMockData: 'true',
      });
      expect(options).toEqual({ dataSource: undefined, saveMockData: false });
    });

    it('tolerates a missing or non-object body', async () => {
      await expect(resolveMockDataOptions(undefined)).resolves.toEqual({
        dataSource: undefined,
        saveMockData: false,
      });
      await expect(resolveMockDataOptions(null)).resolves.toEqual({
        dataSource: undefined,
        saveMockData: false,
      });
    });
  });
});
