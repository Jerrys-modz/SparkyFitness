import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import GoalWeightSection from '../../src/components/GoalWeightSection';
import { useGoalWeightDraft } from '../../src/hooks/useGoalWeightDraft';
import { useGoalWeightPlan, useProfile } from '../../src/hooks/useProfile';
import { usePreferences } from '../../src/hooks/usePreferences';

jest.mock('../../src/hooks/useProfile');
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: jest.fn(),
}));

// The screen owns the draft and its Save; the section only edits it.
const Harness: React.FC<{ onSave?: (value: unknown) => void }> = ({
  onSave,
}) => {
  const draft = useGoalWeightDraft();
  return (
    <>
      <GoalWeightSection draft={draft} />
      {onSave ? <SaveProbe onSave={() => onSave(draft.buildSave())} /> : null}
    </>
  );
};
const { Pressable } =
  jest.requireActual<typeof import('react-native')>('react-native');
const SaveProbe: React.FC<{ onSave: () => void }> = ({ onSave }) => (
  <Pressable testID="screen-save" onPress={onSave} />
);

beforeEach(() => {
  (useProfile as jest.Mock).mockReturnValue({
    profile: { target_weight: null },
  });
  (useGoalWeightPlan as jest.Mock).mockReturnValue({ plan: undefined });
  (usePreferences as jest.Mock).mockReturnValue({
    preferences: { default_weight_unit: 'lbs' },
  });
});

describe('GoalWeightSection', () => {
  it('has no save button of its own', () => {
    render(<Harness />);
    expect(screen.queryByTestId('goal-weight-save')).toBeNull();
    expect(
      screen.getByText('Changes are saved with Save at the top.')
    ).toBeTruthy();
  });

  it("hands a pounds entry to the screen's Save as kilograms", () => {
    const onSave = jest.fn();
    render(<Harness onSave={onSave} />);
    fireEvent.changeText(screen.getByTestId('goal-weight-input'), '154.3');
    fireEvent.press(screen.getByTestId('screen-save'));
    const result = onSave.mock.calls[0][0];
    expect(result.kind).toBe('save');
    expect(result.targetWeightKg).toBeCloseTo(69.99, 1);
  });

  it('stages Clear: the field empties and Save would clear the goal', () => {
    (useProfile as jest.Mock).mockReturnValue({
      profile: { target_weight: '70.00' },
    });
    const onSave = jest.fn();
    render(<Harness onSave={onSave} />);
    fireEvent.press(screen.getByTestId('goal-weight-clear'));
    expect(screen.getByTestId('goal-weight-input').props.value).toBe('');
    fireEvent.press(screen.getByTestId('screen-save'));
    expect(onSave).toHaveBeenCalledWith({
      kind: 'save',
      targetWeightKg: null,
      targetDate: undefined,
    });
  });

  it('shows the range message for an invalid weight', () => {
    render(<Harness />);
    fireEvent.changeText(screen.getByTestId('goal-weight-input'), '0');
    expect(screen.getByTestId('goal-weight-error')).toBeTruthy();
  });

  it('does not accept input until preferences have loaded', () => {
    (usePreferences as jest.Mock).mockReturnValue({
      preferences: undefined,
      isLoading: true,
    });
    render(<Harness />);
    expect(screen.getByTestId('goal-weight-input').props.editable).toBe(false);
  });
});

describe('GoalWeightSection target date', () => {
  beforeEach(() => {
    (useProfile as jest.Mock).mockReturnValue({
      profile: { target_weight: '70.04', target_weight_date: '2099-03-01' },
    });
  });

  it('stages Remove date without rounding the saved weight', () => {
    const onSave = jest.fn();
    render(<Harness onSave={onSave} />);
    fireEvent.press(screen.getByTestId('goal-weight-date-clear'));
    fireEvent.press(screen.getByTestId('screen-save'));
    expect(onSave).toHaveBeenCalledWith({
      kind: 'save',
      targetWeightKg: 70.04,
      targetDate: null,
    });
  });

  it('has nothing to save until the weight or date changes', () => {
    const onSave = jest.fn();
    render(<Harness onSave={onSave} />);
    fireEvent.press(screen.getByTestId('screen-save'));
    expect(onSave).toHaveBeenCalledWith({ kind: 'unchanged' });
  });
});
