import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { CompareQuery } from '@workspace/shared';
import { getCompare } from '@/api/Reports/compareApi';
import { useCompare, useCompareTimings } from '@/hooks/Reports/useCompare';

jest.mock('@/api/Reports/compareApi');
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { activeUserId: 'u1' } }),
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));

const mockedGetCompare = getCompare as jest.MockedFunction<typeof getCompare>;

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

const base: CompareQuery = {
  a: 'timeAsleep',
  b: 'mood',
  mode: 'day',
  timing: 0,
  start: '2026-07-24',
  end: '2026-10-21',
};

describe('useCompare', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetCompare.mockResolvedValue({} as never);
  });

  it('stays idle without a query', () => {
    renderHook(() => useCompare(null), { wrapper });
    expect(mockedGetCompare).not.toHaveBeenCalled();
  });

  it('fetches the query when given one', async () => {
    renderHook(() => useCompare(base), { wrapper });
    await waitFor(() => expect(mockedGetCompare).toHaveBeenCalledWith(base));
  });
});

describe('useCompareTimings asks only the other timings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetCompare.mockResolvedValue({} as never);
  });

  const askedTimings = () =>
    mockedGetCompare.mock.calls.map(([q]) => q.timing).sort();

  it('by day, skips the base timing', async () => {
    const { result } = renderHook(() => useCompareTimings(base), { wrapper });
    expect(result.current.map((r) => r.timing)).toEqual([-1, 1]);
    await waitFor(() => expect(mockedGetCompare).toHaveBeenCalledTimes(2));
    expect(askedTimings()).toEqual([-1, 1]);
  });

  it('by week, asks only timing 1', async () => {
    const week = { ...base, mode: 'week', timing: 0 } as const;
    const { result } = renderHook(() => useCompareTimings(week), { wrapper });
    expect(result.current.map((r) => r.timing)).toEqual([1]);
    await waitFor(() => expect(mockedGetCompare).toHaveBeenCalledTimes(1));
  });

  it('asks nothing without a base', () => {
    const { result } = renderHook(() => useCompareTimings(null), { wrapper });
    expect(result.current.map((r) => r.timing)).toEqual([-1, 0, 1]);
    expect(mockedGetCompare).not.toHaveBeenCalled();
  });
});
