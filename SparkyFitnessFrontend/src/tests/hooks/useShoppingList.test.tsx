import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ShoppingListItem } from '@workspace/shared';
import { shoppingListKeys } from '@/api/keys/shoppingList';
import {
  useClearCheckedShoppingListMutation,
  useShoppingList,
  useToggleShoppingListItemMutation,
} from '@/hooks/ShoppingList/useShoppingList';
import {
  clearCheckedShoppingListItems,
  fetchShoppingList,
  updateShoppingListItem,
} from '@/api/ShoppingList/shoppingListService';

jest.mock('@/api/ShoppingList/shoppingListService', () => ({
  fetchShoppingList: jest.fn(),
  createShoppingListItem: jest.fn(),
  updateShoppingListItem: jest.fn(),
  deleteShoppingListItem: jest.fn(),
  clearCheckedShoppingListItems: jest.fn(),
}));

const mockFetch = fetchShoppingList as jest.MockedFunction<
  typeof fetchShoppingList
>;
const mockUpdate = updateShoppingListItem as jest.MockedFunction<
  typeof updateShoppingListItem
>;
const mockClear = clearCheckedShoppingListItems as jest.MockedFunction<
  typeof clearCheckedShoppingListItems
>;

const makeItem = (overrides: Partial<ShoppingListItem>): ShoppingListItem => ({
  id: 'item-1',
  name: 'Milk',
  quantity: null,
  unit: null,
  note: null,
  is_checked: false,
  checked_at: null,
  created_at: '2026-10-25T10:00:00.000Z',
  updated_at: '2026-10-25T10:00:00.000Z',
  ...overrides,
});

const setup = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, invalidate, Wrapper };
};

describe('useShoppingList', () => {
  beforeEach(() => jest.resetAllMocks());

  it('returns the items from the response', async () => {
    mockFetch.mockResolvedValue({ items: [makeItem({})] });
    const { Wrapper } = setup();
    const { result } = renderHook(() => useShoppingList(), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(result.current.data?.[0]?.name).toBe('Milk');
  });

  it('does not fetch while disabled', () => {
    const { Wrapper } = setup();
    renderHook(() => useShoppingList(false), { wrapper: Wrapper });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('ticks an item optimistically and rolls back on failure', async () => {
    const { queryClient, Wrapper } = setup();
    queryClient.setQueryData(shoppingListKeys.list(), {
      items: [makeItem({})],
    });
    let rejectUpdate: (reason: Error) => void = () => undefined;
    mockUpdate.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectUpdate = reject;
      })
    );
    const { result } = renderHook(() => useToggleShoppingListItemMutation(), {
      wrapper: Wrapper,
    });

    act(() => {
      result.current.mutate({ id: 'item-1', isChecked: true });
    });
    await waitFor(() =>
      expect(
        queryClient.getQueryData<{ items: ShoppingListItem[] }>(
          shoppingListKeys.list()
        )?.items[0]?.is_checked
      ).toBe(true)
    );
    expect(mockUpdate).toHaveBeenCalledWith('item-1', { is_checked: true });

    await act(async () => {
      rejectUpdate(new Error('nope'));
    });
    await waitFor(() =>
      expect(
        queryClient.getQueryData<{ items: ShoppingListItem[] }>(
          shoppingListKeys.list()
        )?.items[0]?.is_checked
      ).toBe(false)
    );
  });

  it('refreshes the whole shopping list family after clearing checked items', async () => {
    mockClear.mockResolvedValue({ deleted: 2 });
    const { invalidate, Wrapper } = setup();
    const { result } = renderHook(() => useClearCheckedShoppingListMutation(), {
      wrapper: Wrapper,
    });
    await act(async () => {
      await result.current.mutateAsync();
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: shoppingListKeys.all,
    });
  });
});
