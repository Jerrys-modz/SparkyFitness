import { apiFetch } from './apiClient';
import type {
  ClearCheckedShoppingListResponse,
  CreateShoppingListItemBody,
  GetShoppingListResponse,
  ShoppingListItem,
  UpdateShoppingListItemBody,
} from '@workspace/shared';

const SERVICE = 'Shopping List API';
const ENDPOINT = '/api/v2/shopping-list';

export const fetchShoppingList = (): Promise<GetShoppingListResponse> =>
  apiFetch<GetShoppingListResponse>({
    endpoint: ENDPOINT,
    serviceName: SERVICE,
    operation: 'fetch shopping list',
  });

export const createShoppingListItem = (
  data: CreateShoppingListItemBody
): Promise<ShoppingListItem> =>
  apiFetch<ShoppingListItem>({
    endpoint: ENDPOINT,
    method: 'POST',
    body: data,
    serviceName: SERVICE,
    operation: 'add shopping list item',
  });

export const updateShoppingListItem = (
  id: string,
  data: UpdateShoppingListItemBody
): Promise<ShoppingListItem> =>
  apiFetch<ShoppingListItem>({
    endpoint: `${ENDPOINT}/${encodeURIComponent(id)}`,
    method: 'PATCH',
    body: data,
    serviceName: SERVICE,
    operation: 'update shopping list item',
  });

export const deleteShoppingListItem = (id: string): Promise<void> =>
  apiFetch<void>({
    endpoint: `${ENDPOINT}/${encodeURIComponent(id)}`,
    method: 'DELETE',
    serviceName: SERVICE,
    operation: 'delete shopping list item',
  });

export const clearCheckedShoppingListItems =
  (): Promise<ClearCheckedShoppingListResponse> =>
    apiFetch<ClearCheckedShoppingListResponse>({
      endpoint: `${ENDPOINT}/checked`,
      method: 'DELETE',
      serviceName: SERVICE,
      operation: 'clear checked shopping list items',
    });
