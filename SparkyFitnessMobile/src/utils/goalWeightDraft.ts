import { weightToKg } from './unitConversions';

/** Largest goal the server accepts: its numeric(5,2) column's maximum. */
export const MAX_GOAL_WEIGHT_KG = 999.99;

/** What the Goals screen's Save does with the goal weight and its date. */
export type GoalWeightSave =
  | { kind: 'unchanged' }
  | { kind: 'invalid'; reason: 'weight' | 'date-without-weight' }
  | {
      kind: 'save';
      /** Null clears the goal (and its date, as the server does). */
      targetWeightKg: number | null;
      /** YYYY-MM-DD, null to remove the date, undefined to keep it. */
      targetDate: string | null | undefined;
    };

export interface GoalWeightDraftInput {
  /** The weight field's text; null while untouched. */
  text: string | null;
  /** The saved goal as shown in the field (so an edit back to it is no change). */
  savedText: string;
  /** The saved goal in kilograms, or null when none is saved. */
  savedKg: number | null;
  unit: 'kg' | 'lbs';
  /** The date draft: undefined untouched, null removed, or a YYYY-MM-DD day. */
  dateDraft: string | null | undefined;
  savedDate: string | null;
}

/** True when `text` is a weight the server would accept. */
export function isGoalWeightTextValid(
  text: string,
  unit: 'kg' | 'lbs'
): boolean {
  const parsed = Number(text.replace(',', '.'));
  const kg = weightToKg(parsed, unit);
  return (
    text.trim() !== '' &&
    Number.isFinite(parsed) &&
    Math.round(kg * 100) / 100 > 0 &&
    kg <= MAX_GOAL_WEIGHT_KG
  );
}

/**
 * Decides what saving does. An untouched or unchanged weight is sent as saved,
 * so changing only the date never rounds the stored goal; an emptied field
 * clears a saved goal.
 */
export function goalWeightSave({
  text,
  savedText,
  savedKg,
  unit,
  dateDraft,
  savedDate,
}: GoalWeightDraftInput): GoalWeightSave {
  const dateChanged = dateDraft !== undefined && dateDraft !== savedDate;
  const weightEdited = text !== null && text.trim() !== savedText.trim();

  if (text !== null && text.trim() === '') {
    // Emptied: clears a saved goal. A date has no goal to belong to.
    if (savedKg !== null) {
      return { kind: 'save', targetWeightKg: null, targetDate: undefined };
    }
    return dateChanged && dateDraft !== null
      ? { kind: 'invalid', reason: 'date-without-weight' }
      : { kind: 'unchanged' };
  }
  if (weightEdited && !isGoalWeightTextValid(text, unit)) {
    return { kind: 'invalid', reason: 'weight' };
  }
  if (!weightEdited && !dateChanged) return { kind: 'unchanged' };
  if (!weightEdited && savedKg === null) {
    return dateDraft === null
      ? { kind: 'unchanged' }
      : { kind: 'invalid', reason: 'date-without-weight' };
  }
  return {
    kind: 'save',
    targetWeightKg: weightEdited
      ? weightToKg(Number((text as string).replace(',', '.')), unit)
      : (savedKg as number),
    targetDate: dateChanged ? (dateDraft ?? null) : undefined,
  };
}
