import React, { createRef } from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import FuelFoodSheet, {
  type FuelFoodSheetRef,
} from '../../src/components/FuelFoodSheet';
import { useFoodsLibrary } from '../../src/hooks/useFoodsLibrary';

jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  const { View, FlatList, TextInput } = require('react-native');
  return {
    BottomSheetModal: React.forwardRef(({ children }: any, ref: any) => {
      React.useImperativeHandle(ref, () => ({
        present: jest.fn(),
        dismiss: jest.fn(),
      }));
      return React.createElement(View, null, children);
    }),
    BottomSheetFlatList: FlatList,
    BottomSheetTextInput: TextInput,
    BottomSheetBackdrop: () => null,
  };
});

jest.mock('../../src/hooks/useFoodsLibrary', () => ({
  useFoodsLibrary: jest.fn(),
}));

const mockUseFoods = useFoodsLibrary as jest.Mock;

const food = (
  id: string,
  name: string,
  brand: string | null,
  carbs: number
) => ({
  id,
  name,
  brand,
  is_custom: true,
  default_variant: {
    id: `v-${id}`,
    carbs,
    serving_size: 1,
    serving_unit: 'serving',
    calories: carbs * 4,
    protein: 0,
    fat: 0,
  },
});

const state = (overrides: Record<string, unknown> = {}) => ({
  foods: [
    food('a', 'SIS gel', 'Science in Sport', 22),
    food('b', 'Chews', null, 18),
  ],
  isLoading: false,
  isError: false,
  isSearching: false,
  isFetchNextPageError: false,
  hasNextPage: false,
  isFetchingNextPage: false,
  loadMore: jest.fn(),
  refetch: jest.fn(),
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockUseFoods.mockReturnValue(state());
});

describe('FuelFoodSheet', () => {
  it('lists foods with their carbs per serving', () => {
    const ref = createRef<FuelFoodSheetRef>();
    const { getByText } = render(
      <FuelFoodSheet ref={ref} onSelect={jest.fn()} />
    );
    act(() => ref.current?.present());

    expect(getByText('SIS gel')).toBeTruthy();
    expect(
      getByText('Science in Sport · 22 g carbs per 1 serving')
    ).toBeTruthy();
    expect(getByText('18 g carbs per 1 serving')).toBeTruthy();
  });

  it('only loads foods once it has been opened', () => {
    const ref = createRef<FuelFoodSheetRef>();
    render(<FuelFoodSheet ref={ref} onSelect={jest.fn()} />);
    expect(mockUseFoods).toHaveBeenLastCalledWith('', { enabled: false });
    act(() => ref.current?.present());
    expect(mockUseFoods).toHaveBeenLastCalledWith('', { enabled: true });
  });

  it('searches as the person types', () => {
    const ref = createRef<FuelFoodSheetRef>();
    const { getByTestId } = render(
      <FuelFoodSheet ref={ref} onSelect={jest.fn()} />
    );
    act(() => ref.current?.present());
    fireEvent.changeText(getByTestId('fuel-food-search'), 'gel');
    expect(mockUseFoods).toHaveBeenLastCalledWith('gel', { enabled: true });
  });

  it('hands back the chosen food', () => {
    const ref = createRef<FuelFoodSheetRef>();
    const onSelect = jest.fn();
    const { getByTestId } = render(
      <FuelFoodSheet ref={ref} onSelect={onSelect} />
    );
    act(() => ref.current?.present());
    fireEvent.press(getByTestId('fuel-food-b'));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'b', name: 'Chews' })
    );
  });

  it('says when nothing matches or loading failed', () => {
    const ref = createRef<FuelFoodSheetRef>();
    mockUseFoods.mockReturnValue(state({ foods: [] }));
    const view = render(<FuelFoodSheet ref={ref} onSelect={jest.fn()} />);
    expect(view.getByText('No foods found.')).toBeTruthy();

    mockUseFoods.mockReturnValue(state({ foods: [], isError: true }));
    view.rerender(<FuelFoodSheet ref={ref} onSelect={jest.fn()} />);
    expect(view.getByText('Could not load your foods.')).toBeTruthy();
  });
});
