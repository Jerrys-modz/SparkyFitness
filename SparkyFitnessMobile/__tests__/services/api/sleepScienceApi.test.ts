import {
  fetchChronotype,
  fetchEnergyCurve,
  fetchSleepBaselineStats,
  fetchSleepDataSufficiency,
  fetchSleepDebt,
  recalculateSleepBaseline,
} from '../../../src/services/api/sleepScienceApi';
import { getActiveServerConfig } from '../../../src/services/storage';

jest.mock('../../../src/services/storage', () => ({
  getActiveServerConfig: jest.fn(),
  proxyHeadersToRecord: jest.requireActual('../../../src/services/storage')
    .proxyHeadersToRecord,
}));

jest.mock('../../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

describe('sleepScienceApi', () => {
  const mockFetch = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();
    global.fetch = mockFetch;
    (getActiveServerConfig as jest.Mock).mockResolvedValue({
      id: 'test-id',
      url: 'https://example.com',
      apiKey: 'key',
    });
    mockFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
  });

  it.each([
    [fetchSleepDebt, 'sleep-debt'],
    [fetchChronotype, 'chronotype'],
    [fetchEnergyCurve, 'energy-curve'],
    [fetchSleepBaselineStats, 'mctq-stats'],
    [fetchSleepDataSufficiency, 'data-sufficiency'],
  ])('GETs the matching sleep science endpoint', async (fetcher, path) => {
    await fetcher();
    expect(mockFetch.mock.calls[0][0]).toBe(
      `https://example.com/api/sleep-science/${path}`
    );
    expect((mockFetch.mock.calls[0][1] as RequestInit).method).toBe('GET');
  });

  it('recalculates the baseline over 90 days', async () => {
    await recalculateSleepBaseline();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://example.com/api/sleep-science/calculate-baseline'
    );
    expect(options.method).toBe('POST');
    expect(JSON.parse(String(options.body))).toEqual({ windowDays: 90 });
  });
});
