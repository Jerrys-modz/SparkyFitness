import { fetchCompare } from '../../src/services/api/compareApi';

const mockApiFetch = jest.fn();
jest.mock('../../src/services/api/apiClient', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

const okResponse = {
  a: { key: 'timeAsleep', values: { '2026-10-01': 420 } },
  b: { key: 'energy', values: { '2026-10-01': 3 } },
  through: '2026-10-21',
  deviations: { a: { '2026-10-01': 1 }, b: { '2026-10-01': 0.5 } },
  result: {
    status: 'not_enough',
    n: 1,
    needed: 14,
    reason: 'tooFew',
    checks: { ownNormal: true },
  },
};

const params = {
  a: 'timeAsleep',
  b: 'energy',
  mode: 'day',
  timing: 0,
  start: '2026-07-24',
  end: '2026-10-21',
} as const;

describe('fetchCompare', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GETs the compare endpoint with every parameter encoded', async () => {
    mockApiFetch.mockResolvedValueOnce(okResponse);
    await fetchCompare(params);
    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint:
          '/api/v2/reports/compare?a=timeAsleep&b=energy&mode=day&timing=0&start=2026-07-24&end=2026-10-21',
      })
    );
  });

  it('encodes a negative timing', async () => {
    mockApiFetch.mockResolvedValueOnce(okResponse);
    await fetchCompare({ ...params, timing: -1 });
    expect(mockApiFetch.mock.calls[0][0].endpoint).toContain('timing=-1');
  });

  it('returns the parsed response', async () => {
    mockApiFetch.mockResolvedValueOnce(okResponse);
    await expect(fetchCompare(params)).resolves.toEqual(okResponse);
  });

  it('rejects a response missing result', async () => {
    const { result: _result, ...noResult } = okResponse;
    mockApiFetch.mockResolvedValueOnce(noResult);
    await expect(fetchCompare(params)).rejects.toThrow();
  });
});
