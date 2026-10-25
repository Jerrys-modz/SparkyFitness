import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ShoppingListItem } from '@workspace/shared';
import ShoppingListScreen from '../../src/screens/ShoppingListScreen';
import {
  useShoppingList,
  useShoppingListMutations,
} from '../../src/hooks/useShoppingList';
import { initializeI18n } from '../../src/localization/i18n';
import type { RootStackScreenProps } from '../../src/types/navigation';

jest.mock('../../src/hooks/useShoppingList', () => ({
  useShoppingList: jest.fn(),
  useShoppingListMutations: jest.fn(),
}));
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));
jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSHeadersActive: () => false,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: () => 0,
}));

const mockAdd = jest.fn();
const mockToggle = jest.fn();
const mockDelete = jest.fn();
const mockClear = jest.fn();

const item = (overrides: Partial<ShoppingListItem>): ShoppingListItem => ({
  id: 'item-1',
  name: 'Milk',
  quantity: null,
  unit: null,
  note: null,
  is_checked: false,
  checked_at: null,
  created_at: '2026-10-25T00:00:00Z',
  updated_at: '2026-10-25T00:00:00Z',
  ...overrides,
});

const mockList = (items: ShoppingListItem[]) =>
  (useShoppingList as jest.Mock).mockReturnValue({
    items,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  });

const renderScreen = () =>
  render(
    <ShoppingListScreen
      {...({
        navigation: { navigate: jest.fn() },
      } as unknown as RootStackScreenProps<'ShoppingList'>)}
    />
  );

beforeAll(async () => {
  await initializeI18n();
});
beforeEach(() => {
  jest.clearAllMocks();
  (useShoppingListMutations as jest.Mock).mockReturnValue({
    addMutation: { mutate: mockAdd, isPending: false },
    toggleMutation: { mutate: mockToggle },
    deleteMutation: { mutate: mockDelete },
    clearCheckedMutation: { mutate: mockClear, isPending: false },
  });
});

describe('ShoppingListScreen', () => {
  it('shows the empty state', () => {
    mockList([]);
    renderScreen();
    expect(screen.getByText('Your list is empty')).toBeTruthy();
  });

  it('adds an item with quantity and unit', () => {
    mockList([]);
    renderScreen();

    fireEvent.changeText(screen.getByLabelText('Item'), '  Flour ');
    fireEvent.changeText(screen.getByLabelText('Quantity'), '1,5');
    fireEvent.changeText(screen.getByLabelText('Unit'), 'kg');
    fireEvent.press(screen.getByLabelText('Add'));

    expect(mockAdd).toHaveBeenCalledWith(
      { name: 'Flour', quantity: 1.5, unit: 'kg' },
      expect.any(Object)
    );
  });

  it('does not add a blank name or an invalid quantity', () => {
    mockList([]);
    renderScreen();

    fireEvent.press(screen.getByLabelText('Add'));
    fireEvent.changeText(screen.getByLabelText('Item'), 'Eggs');
    fireEvent.changeText(screen.getByLabelText('Quantity'), '0');
    fireEvent.press(screen.getByLabelText('Add'));

    expect(mockAdd).not.toHaveBeenCalled();
    expect(screen.getByText(/greater than 0/i)).toBeTruthy();
  });

  it('toggles and deletes items', () => {
    mockList([
      item({ quantity: 2, unit: 'L' }),
      item({ id: 'item-2', name: 'Bread', is_checked: true }),
    ]);
    renderScreen();

    expect(screen.getByText('2 L')).toBeTruthy();
    expect(screen.getByText('Checked (1)')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Milk'));
    expect(mockToggle).toHaveBeenCalledWith({
      id: 'item-1',
      isChecked: true,
    });
    fireEvent.press(screen.getByLabelText('Bread'));
    expect(mockToggle).toHaveBeenCalledWith({
      id: 'item-2',
      isChecked: false,
    });

    fireEvent.press(screen.getByLabelText('Delete Milk'));
    expect(mockDelete).toHaveBeenCalledWith('item-1');
  });

  it('clears checked items after confirmation', () => {
    mockList([item({ is_checked: true })]);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    renderScreen();

    fireEvent.press(screen.getByLabelText('Clear'));
    const buttons = alertSpy.mock.calls[0][2] ?? [];
    buttons.find((b) => b.style === 'destructive')?.onPress?.();

    expect(mockClear).toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});
