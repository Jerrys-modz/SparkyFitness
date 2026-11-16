import { useCallback, useState } from 'react';
import { useProfile } from './useProfile';
import { usePreferences } from './usePreferences';
import { resolveWeightGoal } from '../utils/healthTrendGoals';
import {
  goalWeightSave,
  isGoalWeightTextValid,
  type GoalWeightSave,
} from '../utils/goalWeightDraft';
import { formatLocalizedNumber } from '../localization/i18n';

/**
 * The goal weight and target date as the Goals screen edits them. Nothing is
 * sent from here: the screen's Save reads `buildSave()` with the other goals.
 */
export function useGoalWeightDraft() {
  const { profile } = useProfile();
  const { preferences, isLoading: isPreferencesLoading } = usePreferences();
  const unit: 'kg' | 'lbs' =
    (preferences?.default_weight_unit ?? 'kg') === 'kg' ? 'kg' : 'lbs';

  const saved = resolveWeightGoal(profile?.target_weight, unit);
  const savedKgNumber = Number(profile?.target_weight);
  const savedKg =
    saved === undefined || !Number.isFinite(savedKgNumber)
      ? null
      : savedKgNumber;
  const savedText =
    saved === undefined
      ? ''
      : formatLocalizedNumber(saved, {
          maximumFractionDigits: 1,
          useGrouping: false,
        });
  const savedDate = profile?.target_weight_date ?? null;

  // null means "not edited": show what is saved.
  const [draft, setDraft] = useState<string | null>(null);
  // undefined: not edited; null: removed.
  const [dateDraft, setDateDraft] = useState<string | null | undefined>(
    undefined
  );
  const text = draft ?? savedText;
  const date = dateDraft === undefined ? savedDate : dateDraft;
  const invalid =
    draft !== null &&
    draft.trim() !== '' &&
    draft.trim() !== savedText.trim() &&
    !isGoalWeightTextValid(draft, unit);

  const buildSave = useCallback(
    (): GoalWeightSave =>
      goalWeightSave({
        text: draft,
        savedText,
        savedKg,
        unit,
        dateDraft,
        savedDate,
      }),
    [draft, savedText, savedKg, unit, dateDraft, savedDate]
  );

  return {
    unit,
    isPreferencesLoading,
    /** A goal weight is saved (drives the plan card). */
    hasSaved: saved !== undefined,
    text,
    setText: setDraft,
    /** Stages clearing the goal: the field is emptied, saved with Save. */
    clear: () => setDraft(''),
    date,
    setDate: setDateDraft,
    invalid,
    buildSave,
  };
}

export type GoalWeightDraft = ReturnType<typeof useGoalWeightDraft>;
