import { apiFetch } from '../../../src/services/api/apiClient';
import {
  clearCheckedShoppingListItems,
  createShoppingListItem,
  deleteShoppingListItem,
  fetchShoppingList,
  updateShoppingListItem,
} from '../../../src/services/api/shoppingListApi';

jest.mock('../../../src/services/api/apiClient');

const mockedApiFetch = jest.mocked(apiFetch);

beforeEach(() => {
  jest.clearAllMocks();
  mockedApiFetch.mockResolvedValue(undefined as never);
});

describe('shoppingListApi', () => {
  it('fetches the list', async () => {
    await fetchShoppingList();
    expect(mockedApiFetch).toHaveBeenLastCalledWith(
      expect.objectContaining({ endpoint: '/api/v2/shopping-list' })
    );
  });

  it('creates an item', async () => {
    await createShoppingListItem({ name: 'Milk', quantity: 2, unit: 'L' });
    expect(mockedApiFetch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        endpoint: '/api/v2/shopping-list',
        method: 'POST',
        body: { name: 'Milk', quantity: 2, unit: 'L' },
      })
    );
  });

  it('patches an item with an encoded id', async () => {
    await updateShoppingListItem('i 1', { is_checked: true });
    expect(mockedApiFetch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        endpoint: '/api/v2/shopping-list/i%201',
        method: 'PATCH',
        body: { is_checked: true },
      })
    );
  });

  it('deletes one item and clears the checked ones', async () => {
    await deleteShoppingListItem('i1');
    expect(mockedApiFetch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        endpoint: '/api/v2/shopping-list/i1',
        method: 'DELETE',
      })
    );
    await clearCheckedShoppingListItems();
    expect(mockedApiFetch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        endpoint: '/api/v2/shopping-list/checked',
        method: 'DELETE',
      })
    );
  });
});
