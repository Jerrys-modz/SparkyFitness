const mockSetConfig = jest.fn();
jest.mock('../../modules/background-water', () => ({
  __esModule: true,
  default: { setConfig: (json: string | null) => mockSetConfig(json) },
}));
const mockGetActiveServerConfig = jest.fn();
jest.mock('../../src/services/storage', () => ({
  getActiveServerConfig: () => mockGetActiveServerConfig(),
  proxyHeadersToRecord: (headers?: { name: string; value: string }[]) =>
    Object.fromEntries((headers ?? []).map((h) => [h.name, h.value])),
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));

import {
  buildBackgroundWaterConfig,
  clearBackgroundWater,
  syncBackgroundWater,
} from '../../src/services/backgroundWater';

const container = { id: 3, name: 'Bottle', volume: 500, unit: 'ml' };
const server = {
  id: 's1',
  url: 'https://sparky.example.com/',
  apiKey: 'key-123',
  authType: 'apiKey' as const,
  proxyHeaders: [{ name: 'X-Proxy', value: 'abc' }],
};

describe('background water', () => {
  beforeEach(() => {
    mockSetConfig.mockReset();
    mockGetActiveServerConfig.mockReset();
  });

  it('builds the config the native shortcut posts with', () => {
    expect(buildBackgroundWaterConfig(server, container)).toEqual({
      baseUrl: 'https://sparky.example.com',
      headers: {
        'X-Proxy': 'abc',
        Authorization: 'Bearer key-123',
        'X-Meal-Model-Version': '2',
      },
      containerId: 3,
      containerName: 'Bottle',
      volumeLabel: '500 ml',
    });
  });

  it('has no config without a signed-in server', () => {
    expect(buildBackgroundWaterConfig(null, container)).toBeNull();
  });

  it('stores the config only while the setting is on', async () => {
    mockGetActiveServerConfig.mockResolvedValue(server);
    await syncBackgroundWater(true, container);
    expect(JSON.parse(mockSetConfig.mock.calls[0][0]).containerId).toBe(3);

    mockSetConfig.mockClear();
    await syncBackgroundWater(false, container);
    expect(mockSetConfig).toHaveBeenCalledWith(null);
  });

  it('erases the copy without a container or on request', async () => {
    mockGetActiveServerConfig.mockResolvedValue(server);
    await syncBackgroundWater(true, undefined);
    expect(mockSetConfig).toHaveBeenLastCalledWith(null);
    await clearBackgroundWater();
    expect(mockSetConfig).toHaveBeenLastCalledWith(null);
  });
});
