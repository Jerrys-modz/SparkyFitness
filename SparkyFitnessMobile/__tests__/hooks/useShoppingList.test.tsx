import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { GetShoppingListResponse } from '@workspace/shared';
import { useShoppingListMutations } from '../../src/hooks/useShoppingList';
import { shoppingListQueryKey } from '../../src/hooks/queryKeys';
import { updateShoppingListItem } from '../../src/services/api/shoppingListApi';

jest.mock('../../src/services/api/shoppingListApi');
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: { show: jest.fn() },
}));
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) =>
      options?.defaultValue ?? _key,
  }),
}));

const mockedUpdate = jest.mocked(updateShoppingListItem);

const baseItem = {
  quantity: null,
  unit: null,
  note: null,
  checked_at: null,
  created_at: '2026-10-25T00:00:00Z',
  updated_at: '2026-10-25T00:00:00Z',
};
const initial: GetShoppingListResponse = {
  items: [{ ...baseItem, id: 'a', name: 'Milk', is_checked: false }],
};

const setup = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClient.setQueryData([...shoppingListQueryKey], initial);
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return {
    queryClient,
    ...renderHook(() => useShoppingListMutations(), { wrapper }),
  };
};

beforeEach(() => jest.clearAllMocks());

describe('useShoppingListMutations toggle', () => {
  it('checks the item optimistically before the server answers', async () => {
    let resolve: (value: never) => void = () => {};
    mockedUpdate.mockReturnValue(
      new Promise<never>((r) => {
        resolve = r;
      })
    );
    const { queryClient, result } = setup();

    act(() => {
      result.current.toggleMutation.mutate({ id: 'a', isChecked: true });
    });

    await waitFor(() =>
      expect(
        queryClient.getQueryData<GetShoppingListResponse>([
          ...shoppingListQueryKey,
        ])?.items[0].is_checked
      ).toBe(true)
    );
    expect(mockedUpdate).toHaveBeenCalledWith('a', { is_checked: true });
    await act(async () => resolve(undefined as never));
    await waitFor(() =>
      expect(result.current.toggleMutation.isSuccess).toBe(true)
    );
  });

  it('rolls back when the update fails', async () => {
    mockedUpdate.mockRejectedValue(new Error('boom'));
    const { queryClient, result } = setup();

    await act(async () => {
      result.current.toggleMutation.mutate({ id: 'a', isChecked: true });
    });

    await waitFor(() =>
      expect(result.current.toggleMutation.isError).toBe(true)
    );
    expect(
      queryClient.getQueryData<GetShoppingListResponse>([
        ...shoppingListQueryKey,
      ])?.items[0].is_checked
    ).toBe(false);
  });
});
