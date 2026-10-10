import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
} from '@tanstack/react-query';
import {
  WATER_PREFERENCES_SCOPE,
  refreshAfterWaterPreferenceWrite,
} from '../../src/screens/WaterContainersScreen';
import { preferencesQueryKey } from '../../src/hooks/queryKeys';

function deferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function preferenceRefetches(
  invalidate: jest.SpiedFunction<QueryClient['invalidateQueries']>
) {
  return invalidate.mock.calls.filter(
    (call) => call[0]?.queryKey === preferencesQueryKey
  );
}

describe('refreshAfterWaterPreferenceWrite', () => {
  test('refetches once, after the last queued write settles', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
    const first = deferred();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () =>
        useMutation({
          scope: { id: WATER_PREFERENCES_SCOPE },
          mutationFn: async (id: 'first' | 'second') => {
            if (id === 'first') await first.promise;
          },
          onSettled: () => {
            refreshAfterWaterPreferenceWrite(queryClient);
          },
        }),
      { wrapper }
    );

    act(() => {
      result.current.mutate('first');
      result.current.mutate('second');
    });

    expect(preferenceRefetches(invalidate)).toHaveLength(0);

    await act(async () => {
      first.resolve();
    });

    await waitFor(() => {
      expect(preferenceRefetches(invalidate)).toHaveLength(1);
    });
  });
});
