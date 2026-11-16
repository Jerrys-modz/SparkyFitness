import {
  goalWeightSave,
  isGoalWeightTextValid,
  type GoalWeightDraftInput,
} from '../../src/utils/goalWeightDraft';

const base: GoalWeightDraftInput = {
  text: null,
  savedText: '70',
  savedKg: 70.04,
  unit: 'kg',
  dateDraft: undefined,
  savedDate: null,
};

describe('goalWeightSave', () => {
  it('leaves an untouched goal and date alone', () => {
    expect(goalWeightSave(base)).toEqual({ kind: 'unchanged' });
    expect(goalWeightSave({ ...base, text: '70' })).toEqual({
      kind: 'unchanged',
    });
  });

  it('saves a pounds entry as kilograms', () => {
    const result = goalWeightSave({ ...base, unit: 'lbs', text: '154.3' });
    expect(result.kind).toBe('save');
    if (result.kind === 'save') {
      expect(result.targetWeightKg).toBeCloseTo(69.99, 1);
      expect(result.targetDate).toBeUndefined();
    }
  });

  it('sends the saved kilograms when only the date changes, so it never rounds the goal', () => {
    expect(goalWeightSave({ ...base, dateDraft: '2099-03-01' })).toEqual({
      kind: 'save',
      targetWeightKg: 70.04,
      targetDate: '2099-03-01',
    });
  });

  it('removes a saved date', () => {
    expect(
      goalWeightSave({ ...base, savedDate: '2099-03-01', dateDraft: null })
    ).toEqual({ kind: 'save', targetWeightKg: 70.04, targetDate: null });
  });

  it('does not resave an unchanged date', () => {
    expect(
      goalWeightSave({
        ...base,
        savedDate: '2099-03-01',
        dateDraft: '2099-03-01',
      })
    ).toEqual({ kind: 'unchanged' });
  });

  it('saves a new weight together with a new date', () => {
    expect(
      goalWeightSave({ ...base, text: '68', dateDraft: '2099-03-01' })
    ).toEqual({ kind: 'save', targetWeightKg: 68, targetDate: '2099-03-01' });
  });

  it('clears a saved goal when the field is emptied', () => {
    expect(goalWeightSave({ ...base, text: '' })).toEqual({
      kind: 'save',
      targetWeightKg: null,
      targetDate: undefined,
    });
    expect(
      goalWeightSave({ ...base, text: '  ', dateDraft: '2099-03-01' })
    ).toEqual({ kind: 'save', targetWeightKg: null, targetDate: undefined });
  });

  it('has nothing to clear without a saved goal', () => {
    expect(
      goalWeightSave({ ...base, savedText: '', savedKg: null, text: '' })
    ).toEqual({ kind: 'unchanged' });
  });

  it.each(['0', '-3', 'abc', '1000'])('refuses the weight %s', (text) => {
    expect(goalWeightSave({ ...base, text })).toEqual({
      kind: 'invalid',
      reason: 'weight',
    });
  });

  it('refuses a date with no goal weight to belong to', () => {
    expect(
      goalWeightSave({
        ...base,
        savedText: '',
        savedKg: null,
        dateDraft: '2099-03-01',
      })
    ).toEqual({ kind: 'invalid', reason: 'date-without-weight' });
  });
});

describe('isGoalWeightTextValid', () => {
  it('reads a decimal comma and the unit', () => {
    expect(isGoalWeightTextValid('70,5', 'kg')).toBe(true);
    expect(isGoalWeightTextValid('2300', 'lbs')).toBe(false);
  });
});
