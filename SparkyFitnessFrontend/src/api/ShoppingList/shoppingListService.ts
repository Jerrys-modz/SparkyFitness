import { apiCall } from '@/api/api';
import type {
  ClearCheckedShoppingListResponse,
  CreateShoppingListItemBody,
  GetShoppingListResponse,
  ShoppingListItem,
  UpdateShoppingListItemBody,
} from '@workspace/shared';

export const fetchShoppingList = async (): Promise<GetShoppingListResponse> =>
  apiCall('/v2/shopping-list', { method: 'GET' });

export const createShoppingListItem = async (
  body: CreateShoppingListItemBody
): Promise<ShoppingListItem> =>
  apiCall('/v2/shopping-list', {
    method: 'POST',
    body: JSON.stringify(body),
  });

export const updateShoppingListItem = async (
  id: string,
  body: UpdateShoppingListItemBody
): Promise<ShoppingListItem> =>
  apiCall(`/v2/shopping-list/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

export const deleteShoppingListItem = async (id: string): Promise<void> => {
  await apiCall(`/v2/shopping-list/${id}`, { method: 'DELETE' });
};

export const clearCheckedShoppingListItems =
  async (): Promise<ClearCheckedShoppingListResponse> =>
    apiCall('/v2/shopping-list/checked', { method: 'DELETE' });
