import React, { useState } from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import type { FoodPortionDefinition } from '@workspace/shared';
import NamedFoodPortionsSection from '../../src/components/NamedFoodPortionsSection';

function Editor() {
  const [items, setItems] = useState<FoodPortionDefinition[]>([]);
  return (
    <NamedFoodPortionsSection
      items={items}
      onChange={setItems}
      servingUnit="g"
    />
  );
}

describe('named food portions', () => {
  it('stages a named gram portion and allows removing it before saving', () => {
    const screen = render(<Editor />);
    fireEvent.press(screen.getByText('+ Add portion'));
    fireEvent.changeText(screen.getByLabelText('Portion name'), 'packet');
    fireEvent.changeText(screen.getByLabelText('Portion amount'), '150');
    fireEvent.press(screen.getByText('Add portion'));

    expect(screen.getByText('1 packet = 150 g')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Remove portion packet'));
    expect(screen.queryByText('1 packet = 150 g')).toBeNull();
  });

  it('does not accept a portion without a positive weight', () => {
    const onChange = jest.fn();
    const screen = render(
      <NamedFoodPortionsSection
        items={[]}
        onChange={onChange}
        servingUnit="g"
      />
    );
    fireEvent.press(screen.getByText('+ Add portion'));
    fireEvent.changeText(screen.getByLabelText('Portion name'), 'packet');
    fireEvent.changeText(screen.getByLabelText('Portion amount'), '0');
    fireEvent.press(screen.getByText('Add portion'));
    expect(onChange).not.toHaveBeenCalled();
  });
});
