import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { computeMacroTargets } from '@workspace/shared';
import MacroPerKgEditor, {
  type MacroPerKgValue,
} from '../../src/components/MacroPerKgEditor';

const off: MacroPerKgValue = {
  protein_per_kg: null,
  fat_per_kg: null,
  macro_per_kg_basis: 'body_weight',
};

const renderEditor = (
  value: MacroPerKgValue,
  weightKg: number | null,
  onChange = jest.fn()
) => {
  const preview = computeMacroTargets({
    calories: 2000,
    protein: 140,
    carbs: 200,
    fat: 70,
    proteinPerKg: value.protein_per_kg,
    fatPerKg: value.fat_per_kg,
    basis: value.macro_per_kg_basis,
    weightKg,
  });
  const utils = render(
    <MacroPerKgEditor
      value={value}
      drafts={{
        protein: value.protein_per_kg?.toString() ?? '',
        fat: value.fat_per_kg?.toString() ?? '',
      }}
      preview={preview}
      percentMode={false}
      onChange={onChange}
    />
  );
  return { ...utils, onChange };
};

describe('MacroPerKgEditor', () => {
  it('turns protein per kg on with a default value', () => {
    const { getByTestId, onChange } = renderEditor(off, 80);
    fireEvent(getByTestId('goal-per-kg-switch-protein'), 'valueChange', true);
    expect(onChange).toHaveBeenCalledWith(
      { ...off, protein_per_kg: 1.6 },
      { protein: '1.6', fat: '' }
    );
  });

  it('previews the grams for the latest weight', () => {
    const { getByTestId } = renderEditor({ ...off, protein_per_kg: 2 }, 80);
    expect(getByTestId('goal-per-kg-preview')).toHaveTextContent(
      "Today's grams from 80 kg: protein 160 g, carbs 200 g, fat 70 g."
    );
  });

  it('says when no weight is logged', () => {
    const { getByTestId, queryByTestId } = renderEditor(
      { ...off, protein_per_kg: 2 },
      null
    );
    expect(getByTestId('goal-per-kg-no-weight')).toHaveTextContent(
      /No weight logged yet/
    );
    expect(queryByTestId('goal-per-kg-preview')).toBeNull();
  });

  it('keeps the last valid value while a typed one is out of range', () => {
    const value = { ...off, protein_per_kg: 2 };
    const { getByTestId, onChange } = renderEditor(value, 80);
    fireEvent.changeText(getByTestId('goal-per-kg-input-protein'), '9');
    expect(onChange).toHaveBeenLastCalledWith(value, {
      protein: '9',
      fat: '',
    });
    fireEvent.changeText(getByTestId('goal-per-kg-input-protein'), '2,2');
    expect(onChange).toHaveBeenLastCalledWith(
      { ...value, protein_per_kg: 2.2 },
      { protein: '2,2', fat: '' }
    );
  });
});
