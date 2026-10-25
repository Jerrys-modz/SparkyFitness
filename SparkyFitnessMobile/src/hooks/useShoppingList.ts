import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import type {
  CreateShoppingListItemBody,
  GetShoppingListResponse,
} from '@workspace/shared';
import {
  clearCheckedShoppingListItems,
  createShoppingListItem,
  deleteShoppingListItem,
  fetchShoppingList,
  updateShoppingListItem,
} from '../services/api/shoppingListApi';
import { addLog } from '../services/LogService';
import { shoppingListQueryKey } from './queryKeys';
import { useRefetchOnFocus } from './useRefetchOnFocus';

export function useShoppingList() {
  const query = useQuery({
    queryKey: [...shoppingListQueryKey],
    queryFn: fetchShoppingList,
  });

  useRefetchOnFocus(query.refetch);

  return {
    items: query.data?.items ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function useShoppingListMutations() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: [...shoppingListQueryKey] });

  const showError = (message: string, error: unknown) => {
    addLog(message, 'ERROR', [String(error)]);
    Toast.show({
      type: 'error',
      text1: message,
      text2: t('common.tryAgain', { defaultValue: 'Please try again.' }),
    });
  };

  const addMutation = useMutation({
    mutationFn: (data: CreateShoppingListItemBody) =>
      createShoppingListItem(data),
    onSuccess: refresh,
    onError: (error) =>
      showError(
        t('shoppingList.addFailed', { defaultValue: 'Failed to add item' }),
        error
      ),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isChecked }: { id: string; isChecked: boolean }) =>
      updateShoppingListItem(id, { is_checked: isChecked }),
    onMutate: async ({ id, isChecked }) => {
      await queryClient.cancelQueries({ queryKey: [...shoppingListQueryKey] });
      const previous = queryClient.getQueryData<GetShoppingListResponse>([
        ...shoppingListQueryKey,
      ]);
      if (previous) {
        queryClient.setQueryData<GetShoppingListResponse>(
          [...shoppingListQueryKey],
          {
            items: previous.items.map((item) =>
              item.id === id ? { ...item, is_checked: isChecked } : item
            ),
          }
        );
      }
      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData([...shoppingListQueryKey], context.previous);
      }
      showError(
        t('shoppingList.updateFailed', {
          defaultValue: 'Failed to update item',
        }),
        error
      );
    },
    onSettled: refresh,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteShoppingListItem(id),
    onSuccess: refresh,
    onError: (error) =>
      showError(
        t('shoppingList.deleteFailed', {
          defaultValue: 'Failed to delete item',
        }),
        error
      ),
  });

  const clearCheckedMutation = useMutation({
    mutationFn: clearCheckedShoppingListItems,
    onSuccess: refresh,
    onError: (error) =>
      showError(
        t('shoppingList.clearFailed', {
          defaultValue: 'Failed to clear checked items',
        }),
        error
      ),
  });

  return { addMutation, toggleMutation, deleteMutation, clearCheckedMutation };
}
