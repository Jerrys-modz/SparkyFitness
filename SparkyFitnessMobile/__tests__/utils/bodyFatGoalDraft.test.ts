import {
  bodyFatGoalSave,
  isBodyFatDraftInvalid,
} from '../../src/utils/bodyFatGoalDraft';

describe('bodyFatGoalSave', () => {
  it('leaves an untouched field alone', () => {
    expect(bodyFatGoalSave(null, 18)).toEqual({ kind: 'unchanged' });
    expect(bodyFatGoalSave(null, null)).toEqual({ kind: 'unchanged' });
  });

  it('saves a new value rounded to one decimal, accepting a comma', () => {
    expect(bodyFatGoalSave('15,26', 18)).toEqual({ kind: 'save', value: 15.3 });
    expect(bodyFatGoalSave(' 20 ', null)).toEqual({ kind: 'save', value: 20 });
  });

  it('does not resave the saved value', () => {
    expect(bodyFatGoalSave('18.0', 18)).toEqual({ kind: 'unchanged' });
  });

  it('clears a saved goal when the field is emptied', () => {
    expect(bodyFatGoalSave('', 18)).toEqual({ kind: 'save', value: null });
    expect(bodyFatGoalSave('  ', 18)).toEqual({ kind: 'save', value: null });
    expect(bodyFatGoalSave('', null)).toEqual({ kind: 'unchanged' });
  });

  it.each(['2', '61', 'abc', '-4'])('refuses %s', (draft) => {
    expect(bodyFatGoalSave(draft, 18)).toEqual({ kind: 'invalid' });
    expect(isBodyFatDraftInvalid(draft)).toBe(true);
  });

  it('shows no error for an untouched or empty field', () => {
    expect(isBodyFatDraftInvalid(null)).toBe(false);
    expect(isBodyFatDraftInvalid('')).toBe(false);
    expect(isBodyFatDraftInvalid('25')).toBe(false);
  });
});
