import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import i18n from 'i18next';
import type {
  CreateShoppingListItemBody,
  GetShoppingListResponse,
  UpdateShoppingListItemBody,
} from '@workspace/shared';
import {
  clearCheckedShoppingListItems,
  createShoppingListItem,
  deleteShoppingListItem,
  fetchShoppingList,
  updateShoppingListItem,
} from '@/api/ShoppingList/shoppingListService';
import { shoppingListKeys } from '@/api/keys/shoppingList';

/** The shopping list is owner-only; pass `enabled: false` while acting on behalf. */
export const useShoppingList = (enabled: boolean = true) =>
  useQuery({
    queryKey: shoppingListKeys.list(),
    queryFn: fetchShoppingList,
    enabled,
    select: (data) => data.items,
    meta: {
      errorMessage: i18n.t(
        'shoppingList.failedToLoad',
        'Failed to load your shopping list.'
      ),
    },
  });

export const useAddShoppingListItemMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateShoppingListItemBody) =>
      createShoppingListItem(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: shoppingListKeys.all });
    },
    meta: {
      errorMessage: i18n.t(
        'shoppingList.failedToAdd',
        'Failed to add the item.'
      ),
    },
  });
};

export const useUpdateShoppingListItemMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: UpdateShoppingListItemBody;
    }) => updateShoppingListItem(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: shoppingListKeys.all });
    },
    meta: {
      errorMessage: i18n.t(
        'shoppingList.failedToSave',
        'Failed to save the item.'
      ),
    },
  });
};

/** Ticks an item on or off immediately, rolling back if the server refuses. */
export const useToggleShoppingListItemMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isChecked }: { id: string; isChecked: boolean }) =>
      updateShoppingListItem(id, { is_checked: isChecked }),
    onMutate: async ({ id, isChecked }) => {
      await queryClient.cancelQueries({ queryKey: shoppingListKeys.list() });
      const previous = queryClient.getQueryData<GetShoppingListResponse>(
        shoppingListKeys.list()
      );
      if (previous) {
        const checkedAt = new Date().toISOString();
        queryClient.setQueryData<GetShoppingListResponse>(
          shoppingListKeys.list(),
          {
            items: previous.items.map((item) =>
              item.id === id
                ? {
                    ...item,
                    is_checked: isChecked,
                    checked_at: isChecked ? checkedAt : null,
                  }
                : item
            ),
          }
        );
      }
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(shoppingListKeys.list(), context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: shoppingListKeys.all });
    },
    meta: {
      errorMessage: i18n.t(
        'shoppingList.failedToSave',
        'Failed to save the item.'
      ),
    },
  });
};

export const useDeleteShoppingListItemMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteShoppingListItem(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: shoppingListKeys.all });
    },
    meta: {
      errorMessage: i18n.t(
        'shoppingList.failedToDelete',
        'Failed to remove the item.'
      ),
    },
  });
};

export const useClearCheckedShoppingListMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: clearCheckedShoppingListItems,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: shoppingListKeys.all });
    },
    meta: {
      errorMessage: i18n.t(
        'shoppingList.failedToClear',
        'Failed to clear the checked items.'
      ),
    },
  });
};
