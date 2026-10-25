import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { presetInventory, type PlateInventoryConfig } from '@workspace/shared';
import PlateCalculatorSheet from '../../src/components/PlateCalculatorSheet';
import { usePlateInventory } from '../../src/hooks/usePlateInventory';
import { initializeI18n } from '../../src/localization/i18n';

jest.mock('../../src/hooks/usePlateInventory', () => ({
  usePlateInventory: jest.fn(),
}));

const mockInventory = (inventory: PlateInventoryConfig) =>
  jest.mocked(usePlateInventory).mockReturnValue({
    inventory,
    hasSaved: true,
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof usePlateInventory>);

const renderSheet = (
  props: Partial<React.ComponentProps<typeof PlateCalculatorSheet>> = {}
) =>
  render(
    <PlateCalculatorSheet
      visible
      onClose={jest.fn()}
      targetWeight={100}
      weightUnit="kg"
      equipment={['barbell']}
      {...props}
    />
  );

beforeAll(async () => {
  await initializeI18n();
});
beforeEach(() => {
  mockInventory(presetInventory('kg'));
});

describe('PlateCalculatorSheet', () => {
  it('shows the plates for each side of the bar', () => {
    renderSheet();
    expect(screen.getByText('Target 100 kg')).toBeTruthy();
    expect(screen.getByText('1 × 25 kg')).toBeTruthy();
    expect(screen.getByText('1 × 15 kg')).toBeTruthy();
    expect(screen.getByText('40 kg per side · 100 kg total')).toBeTruthy();
  });

  it('names the nearest loadable weights instead of rounding', () => {
    mockInventory({
      ...presetInventory('kg'),
      plates: [{ weight: 20, pairs: 1 }],
    });
    renderSheet({ targetWeight: 70 });
    expect(
      screen.getByText('Your plates cannot make exactly 70 kg.')
    ).toBeTruthy();
    expect(screen.getByText('Nearest below: 60 kg')).toBeTruthy();
    expect(screen.getByText('10 kg short of the target')).toBeTruthy();
    expect(
      screen.getByText('The target is heavier than your plates can load.')
    ).toBeTruthy();
  });

  it('switches bars', () => {
    renderSheet({ targetWeight: 95 });
    // 20 kg bar: 37.5 per side is 25 + 10 + 2.5.
    expect(screen.getByText('1 × 10 kg')).toBeTruthy();
    expect(screen.getByText('1 × 2.5 kg')).toBeTruthy();
    // Women's 15 kg bar: 40 per side is 25 + 15.
    fireEvent.press(screen.getByText(/Women's bar/));
    expect(screen.getByText('1 × 15 kg')).toBeTruthy();
    expect(screen.queryByText('1 × 2.5 kg')).toBeNull();
  });

  it('asks for a weight when the set has none', () => {
    renderSheet({ targetWeight: null });
    expect(screen.getByText('Enter a weight for the set first.')).toBeTruthy();
    expect(screen.queryByText(/per side/)).toBeNull();
  });

  it('works in pounds', () => {
    mockInventory(presetInventory('lbs'));
    renderSheet({ targetWeight: 225, weightUnit: 'lbs' });
    expect(screen.getByText('2 × 45 lbs')).toBeTruthy();
  });

  it('closes', () => {
    const onClose = jest.fn();
    renderSheet({ onClose });
    fireEvent.press(screen.getByText('Close'));
    expect(onClose).toHaveBeenCalled();
  });
});
