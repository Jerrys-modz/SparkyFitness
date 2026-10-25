export const shoppingListKeys = {
  all: ['shoppingList'] as const,
  lists: () => [...shoppingListKeys.all, 'list'] as const,
  list: () => [...shoppingListKeys.lists()] as const,
};
