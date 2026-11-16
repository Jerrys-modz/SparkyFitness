import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { computeMacroTargets } from '@workspace/shared';
import MacroPerKgEditor, {
  type MacroPerKgDrafts,
  type MacroPerKgValue,
} from '../../src/components/MacroPerKgEditor';

const off: MacroPerKgValue = {
  protein_per_kg: null,
  carbs_per_kg: null,
  fat_per_kg: null,
  macro_per_kg_basis: 'body_weight',
  macro_reference_weight_kg: null,
};

const draftsFor = (value: MacroPerKgValue): MacroPerKgDrafts => ({
  protein: value.protein_per_kg?.toString() ?? '',
  carbs: value.carbs_per_kg?.toString() ?? '',
  fat: value.fat_per_kg?.toString() ?? '',
  reference: value.macro_reference_weight_kg?.toString() ?? '',
});

const renderEditor = (
  value: MacroPerKgValue,
  weightKg: number | null,
  {
    onChange = jest.fn(),
    weightUnit = 'kg' as const,
    calories = 2000,
  }: {
    onChange?: jest.Mock;
    weightUnit?: 'kg' | 'lbs';
    calories?: number;
  } = {}
) => {
  const preview = computeMacroTargets({
    calories,
    protein: 140,
    carbs: 200,
    fat: 70,
    proteinPerKg: value.protein_per_kg,
    carbsPerKg: value.carbs_per_kg,
    fatPerKg: value.fat_per_kg,
    basis: value.macro_per_kg_basis,
    referenceWeightKg: value.macro_reference_weight_kg,
    weightKg,
  });
  const utils = render(
    <MacroPerKgEditor
      value={value}
      drafts={draftsFor(value)}
      preview={preview}
      latestBasisKg={weightKg}
      weightUnit={weightUnit}
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
      { protein: '1.6', carbs: '', fat: '', reference: '' }
    );
  });

  it('turns carbs per kg on', () => {
    const { getByTestId, onChange } = renderEditor(off, 80);
    fireEvent(getByTestId('goal-per-kg-switch-carbs'), 'valueChange', true);
    expect(onChange).toHaveBeenCalledWith(
      { ...off, carbs_per_kg: 4 },
      expect.objectContaining({ carbs: '4' })
    );
  });

  it('previews the grams for the latest weight', () => {
    const { getByTestId } = renderEditor({ ...off, protein_per_kg: 2 }, 80);
    expect(getByTestId('goal-per-kg-preview')).toHaveTextContent(
      "Today's grams from your latest logged weight of 80 kg: protein 160 g, carbs 200 g, fat 70 g."
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

  it('switches to a fixed reference weight prefilled from the latest weight', () => {
    const value = { ...off, protein_per_kg: 2 };
    const { getByText, onChange } = renderEditor(value, 81.24);
    fireEvent.press(getByText('Fixed weight'));
    expect(onChange).toHaveBeenLastCalledWith(
      { ...value, macro_reference_weight_kg: 81.2 },
      expect.objectContaining({ reference: '81.2' })
    );
  });

  it('previews from a fixed reference weight and reads it in pounds', () => {
    const value = {
      ...off,
      protein_per_kg: 2,
      macro_reference_weight_kg: 75,
    };
    const { getByTestId, onChange } = renderEditor(value, 90, {
      weightUnit: 'lbs',
    });
    expect(getByTestId('goal-per-kg-preview')).toHaveTextContent(
      /Grams from your reference weight of 75 kg: protein 150 g/
    );
    fireEvent.changeText(getByTestId('goal-per-kg-reference'), '176.37');
    const [next] = onChange.mock.calls.at(-1) as [MacroPerKgValue];
    expect(next.macro_reference_weight_kg).toBeCloseTo(80, 1);
  });

  it('notes when the per-kg macros exceed the calorie target', () => {
    const { getByTestId } = renderEditor(
      { ...off, protein_per_kg: 2, carbs_per_kg: 4, fat_per_kg: 1 },
      80
    );
    expect(getByTestId('goal-per-kg-calorie-mismatch')).toHaveTextContent(
      'The per-kg macros add up to 2640 kcal, but the calorie target leaves 2000 kcal for macros.'
    );
  });

  it('keeps the last valid value while a typed one is out of range', () => {
    const value = { ...off, protein_per_kg: 2 };
    const { getByTestId, onChange } = renderEditor(value, 80);
    fireEvent.changeText(getByTestId('goal-per-kg-input-protein'), '9');
    expect(onChange).toHaveBeenLastCalledWith(
      value,
      expect.objectContaining({ protein: '9' })
    );
    fireEvent.changeText(getByTestId('goal-per-kg-input-protein'), '2,2');
    expect(onChange).toHaveBeenLastCalledWith(
      { ...value, protein_per_kg: 2.2 },
      expect.objectContaining({ protein: '2,2' })
    );
  });
});
