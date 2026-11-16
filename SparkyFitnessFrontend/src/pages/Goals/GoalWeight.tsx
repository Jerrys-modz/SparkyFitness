import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useProfileQuery } from '@/hooks/Settings/useProfile';
import {
  useGoalWeightPlan,
  useSetTargetWeight,
} from '@/hooks/Onboarding/useOnboarding';
import { kgToLbs, lbsToKg } from '@/utils/unitConversions';
import { addDays, todayInZone } from '@workspace/shared';
import { GoalWeightPlanPanel } from './GoalWeightPlanPanel';

/** Largest goal the server accepts: the `numeric(5,2)` column's maximum. */
const MAX_GOAL_WEIGHT_KG = 999.99;

export const GoalWeight = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { weightUnit, timezone } = usePreferences();
  const userId = user?.id ?? '';
  const { data: profile } = useProfileQuery(userId);
  const { mutateAsync: saveTargetWeight, isPending: saving } =
    useSetTargetWeight(userId);

  // Stones and pounds users enter pounds; storage is always kilograms.
  const inputUnit = weightUnit === 'kg' ? 'kg' : 'lbs';
  const savedKg = Number(profile?.target_weight);
  const savedDisplay =
    Number.isFinite(savedKg) && savedKg > 0
      ? Number(
          (inputUnit === 'kg' ? savedKg : kgToLbs(savedKg)).toFixed(1)
        ).toString()
      : '';

  // `null` means the user has not edited; show what is saved. A draft keeps
  // the unit it was typed in, so changing the unit preference while it is
  // unsaved converts it instead of reading the same number in the new unit.
  const [draft, setDraft] = useState<{
    text: string;
    unit: 'kg' | 'lbs';
  } | null>(null);
  const draftNumber = draft == null ? NaN : Number(draft.text);
  const value =
    draft == null
      ? savedDisplay
      : draft.unit === inputUnit || !Number.isFinite(draftNumber)
        ? draft.text
        : Number(
            (inputUnit === 'kg'
              ? lbsToKg(draftNumber)
              : kgToLbs(draftNumber)
            ).toFixed(1)
          ).toString();
  const parsed = Number(value);
  const parsedKg = inputUnit === 'kg' ? parsed : lbsToKg(parsed);
  // The server stores NUMERIC(5,2), so anything above 999.99 kg is refused.
  const maxDisplay =
    inputUnit === 'kg'
      ? MAX_GOAL_WEIGHT_KG
      : Math.floor(kgToLbs(MAX_GOAL_WEIGHT_KG) * 10) / 10;
  const isValid =
    value.trim() !== '' &&
    Number.isFinite(parsed) &&
    Math.round(parsedKg * 100) / 100 > 0 &&
    parsedKg <= MAX_GOAL_WEIGHT_KG;

  // The day to reach the goal: `null` means not edited, '' means removed.
  const savedDate = profile?.target_weight_date ?? '';
  const [dateDraft, setDateDraft] = useState<string | null>(null);
  const dateValue = dateDraft ?? savedDate;
  const tomorrow = addDays(todayInZone(timezone || 'UTC'), 1);
  const hasSavedGoal = savedDisplay !== '';
  const { data: plan } = useGoalWeightPlan(hasSavedGoal);

  const dirty =
    draft !== null || (dateDraft !== null && dateDraft !== savedDate);

  const handleSave = async () => {
    if (!isValid) return;
    await saveTargetWeight({
      // An untouched weight is sent as saved, so changing only the date never
      // rounds the stored goal.
      targetWeightKg: draft === null ? savedKg : parsedKg,
      targetDate:
        dateDraft === null ? undefined : dateDraft === '' ? null : dateDraft,
    });
    setDraft(null);
    setDateDraft(null);
  };

  const handleClear = async () => {
    await saveTargetWeight({ targetWeightKg: null });
    setDraft(null);
    setDateDraft(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t('goals.goalsSettings.goalWeight', 'Goal Weight')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {t(
            'goals.goalsSettings.goalWeightDescription',
            'Your target weight. The weight trend chart uses it to project when you will reach it.'
          )}
        </p>
        <div className="space-y-1.5 max-w-xs">
          <Label htmlFor="goal-weight" className="text-xs">
            {t('goals.goalsSettings.goalWeightInputLabel', {
              unit: inputUnit,
              defaultValue: 'Goal weight ({{unit}})',
            })}
          </Label>
          <Input
            id="goal-weight"
            type="number"
            min={0}
            step="0.1"
            inputMode="decimal"
            value={value}
            onChange={(e) =>
              setDraft({ text: e.target.value, unit: inputUnit })
            }
          />
          {draft !== null && !isValid && draft.text.trim() !== '' && (
            <p className="text-xs text-destructive">
              {t('goals.goalsSettings.goalWeightInvalid', {
                max: maxDisplay,
                unit: inputUnit,
                defaultValue:
                  'Enter a weight above zero and up to {{max}} {{unit}}.',
              })}
            </p>
          )}
        </div>
        <div className="space-y-1.5 max-w-xs">
          <Label htmlFor="goal-weight-date" className="text-xs">
            {t(
              'goals.goalsSettings.goalWeightDateLabel',
              'Target date (optional)'
            )}
          </Label>
          <Input
            id="goal-weight-date"
            type="date"
            min={tomorrow}
            value={dateValue}
            onChange={(e) => setDateDraft(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            {t(
              'goals.goalsSettings.goalWeightDateHint',
              'Pick a day to see the weekly pace it needs. Your calorie goal only changes if you choose to use that pace.'
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={saving || !dirty || !isValid}>
            {t('goals.goalsSettings.goalWeightSave', 'Save goal weight')}
          </Button>
          {savedDisplay !== '' && (
            <Button variant="outline" onClick={handleClear} disabled={saving}>
              {t('goals.goalsSettings.goalWeightClear', 'Clear')}
            </Button>
          )}
        </div>
        {hasSavedGoal && plan && <GoalWeightPlanPanel data={plan} />}
      </CardContent>
    </Card>
  );
};
