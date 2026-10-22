import { renderHook, waitFor } from '@testing-library/react-native';
import { useCompare } from '../../src/hooks/useCompare';
import { fetchCompare } from '../../src/services/api/compareApi';
import { queryClient as appQueryClient } from '../../src/hooks/queryClient';
import { ApiError } from '../../src/services/api/errors';
import { createTestQueryClient, createQueryWrapper } from './queryTestUtils';

jest.mock('../../src/services/api/compareApi', () => ({
  ...jest.requireActual('../../src/services/api/compareApi'),
  fetchCompare: jest.fn(),
}));

const mockRefetchOnFocus = jest.fn();
jest.mock('../../src/hooks/useRefetchOnFocus', () => ({
  useRefetchOnFocus: (...args: unknown[]) => mockRefetchOnFocus(...args),
}));

const mockFetch = fetchCompare as jest.MockedFunction<typeof fetchCompare>;

const response = {
  a: { key: 'timeAsleep', values: {} },
  b: { key: 'energy', values: {} },
  through: '2026-10-21',
  deviations: { a: {}, b: {} },
  result: {
    status: 'not_enough',
    n: 0,
    needed: 14,
    checks: { ownNormal: true },
  },
} as unknown as Awaited<ReturnType<typeof fetchCompare>>;

const window90 = { startDate: '2026-07-24', endDate: '2026-10-21' };
const question = { a: 'timeAsleep', b: 'energy', choice: 'sameDay' } as const;

// Same retry policy the app uses, so "no retry on 404" is tested for real.
const appLikeClient = () =>
  createTestQueryClient({
    queries: {
      retry: appQueryClient.getDefaultOptions().queries?.retry,
      retryDelay: 1,
      staleTime: 0,
    },
  });

describe('useCompare', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fetches with the question mapped to mode, timing and window', async () => {
    mockFetch.mockResolvedValue(response);
    const { result } = renderHook(() => useCompare(question, window90), {
      wrapper: createQueryWrapper(createTestQueryClient()),
    });
    await waitFor(() => expect(result.current.data).toBe(response));
    expect(mockFetch).toHaveBeenCalledWith({
      a: 'timeAsleep',
      b: 'energy',
      mode: 'day',
      timing: 0,
      start: '2026-07-24',
      end: '2026-10-21',
    });
  });

  it('does not fetch a question that is not askable', () => {
    const { result } = renderHook(
      () => useCompare({ a: 'mood', b: 'mood', choice: 'sameDay' }, window90),
      { wrapper: createQueryWrapper(createTestQueryClient()) }
    );
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
  });

  it('reports a 404 as serverTooOld, not an error, after one call', async () => {
    mockFetch.mockRejectedValue(new ApiError('nope', 404));
    const { result } = renderHook(() => useCompare(question, window90), {
      wrapper: createQueryWrapper(appLikeClient()),
    });
    await waitFor(() => expect(result.current.serverTooOld).toBe(true));
    expect(result.current.isError).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('reports a 500 as an error', async () => {
    mockFetch.mockRejectedValue(new ApiError('boom', 500));
    const { result } = renderHook(() => useCompare(question, window90), {
      wrapper: createQueryWrapper(createTestQueryClient()),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.serverTooOld).toBe(false);
  });

  it('asks again when the window changes', async () => {
    mockFetch.mockResolvedValue(response);
    const wrapper = createQueryWrapper(createTestQueryClient());
    const { result, rerender } = renderHook(
      (w: { startDate: string; endDate: string }) => useCompare(question, w),
      { wrapper, initialProps: window90 }
    );
    await waitFor(() => expect(result.current.data).toBe(response));
    rerender({ startDate: '2026-08-24', endDate: '2026-10-21' });
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
    expect(mockFetch).toHaveBeenLastCalledWith(
      expect.objectContaining({ start: '2026-08-24' })
    );
  });

  it('refetches on focus only while the question is askable', () => {
    mockFetch.mockResolvedValue(response);
    renderHook(() => useCompare({ a: 'mood' }, window90), {
      wrapper: createQueryWrapper(createTestQueryClient()),
    });
    expect(mockRefetchOnFocus).toHaveBeenCalledWith(
      expect.any(Function),
      false
    );
  });
});
