import { isValidBodyFatGoal, roundBodyFatPercent } from '@workspace/shared';

/** What the Goals screen's Save does with the body fat goal field. */
export type BodyFatGoalSave =
  | { kind: 'unchanged' }
  | { kind: 'invalid' }
  | { kind: 'save'; value: number | null };

const parse = (text: string): number => Number(text.replace(',', '.'));

/**
 * `draft` is null while the field is untouched. An emptied field clears a saved
 * goal; a value equal to the saved goal is left alone.
 */
export function bodyFatGoalSave(
  draft: string | null,
  saved: number | null
): BodyFatGoalSave {
  if (draft === null) return { kind: 'unchanged' };
  const text = draft.trim();
  if (text === '') {
    return saved === null
      ? { kind: 'unchanged' }
      : { kind: 'save', value: null };
  }
  const value = parse(text);
  if (!isValidBodyFatGoal(value)) return { kind: 'invalid' };
  const rounded = roundBodyFatPercent(value);
  return rounded === saved
    ? { kind: 'unchanged' }
    : { kind: 'save', value: rounded };
}

/** True when the typed text should show the range message. */
export function isBodyFatDraftInvalid(draft: string | null): boolean {
  return bodyFatGoalSave(draft, null).kind === 'invalid';
}
