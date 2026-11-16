import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { useProfileQuery } from '@/hooks/Settings/useProfile';
import { useSetTargetBodyFat } from '@/hooks/Onboarding/useOnboarding';
import {
  BODY_FAT_GOAL_MAX_PERCENT,
  BODY_FAT_GOAL_MIN_PERCENT,
  isValidBodyFatGoal,
  parseBodyFatGoal,
  roundBodyFatPercent,
} from '@workspace/shared';

/** Target body fat %, stored next to the goal weight on the same profile row. */
export const GoalBodyFat = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const userId = user?.id ?? '';
  const { data: profile } = useProfileQuery(userId);
  const { mutateAsync: saveTargetBodyFat, isPending: saving } =
    useSetTargetBodyFat(userId);

  const saved = parseBodyFatGoal(profile?.target_body_fat_percentage);
  const savedDisplay = saved === null ? '' : saved.toString();

  // `null` means the user has not edited; show what is saved.
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? savedDisplay;
  const parsed = Number(value);
  const isValid = value.trim() !== '' && isValidBodyFatGoal(parsed);

  const handleSave = async () => {
    if (!isValid) return;
    await saveTargetBodyFat(roundBodyFatPercent(parsed));
    setDraft(null);
  };

  const handleClear = async () => {
    await saveTargetBodyFat(null);
    setDraft(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t('goals.goalsSettings.bodyFatGoal', 'Body Fat Goal')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {t(
            'goals.goalsSettings.bodyFatGoalDescription',
            'Your target body fat percentage, for body recomposition. The Body Fat % chart in Reports draws it as a goal line, projects when you will reach it and estimates the weight it means at your current lean mass.'
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {t(
            'goals.goalsSettings.bodyFatGoalMethodNote',
            'Body fat readings vary a lot between methods (smart scales, calipers, tape formulas, DEXA) and even day to day on the same scale. Compare readings from one method, taken the same way.'
          )}
        </p>
        <div className="space-y-1.5 max-w-xs">
          <Label htmlFor="goal-body-fat" className="text-xs">
            {t(
              'goals.goalsSettings.bodyFatGoalInputLabel',
              'Body fat goal (%)'
            )}
          </Label>
          <Input
            id="goal-body-fat"
            type="number"
            min={BODY_FAT_GOAL_MIN_PERCENT}
            max={BODY_FAT_GOAL_MAX_PERCENT}
            step="0.1"
            inputMode="decimal"
            value={value}
            onChange={(e) => setDraft(e.target.value)}
          />
          {draft !== null && !isValid && draft.trim() !== '' && (
            <p className="text-xs text-destructive">
              {t('goals.goalsSettings.bodyFatGoalInvalid', {
                min: BODY_FAT_GOAL_MIN_PERCENT,
                max: BODY_FAT_GOAL_MAX_PERCENT,
                defaultValue:
                  'Enter a body fat goal from {{min}}% to {{max}}%.',
              })}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleSave}
            disabled={saving || draft === null || !isValid}
          >
            {t('goals.goalsSettings.bodyFatGoalSave', 'Save body fat goal')}
          </Button>
          {savedDisplay !== '' && (
            <Button variant="outline" onClick={handleClear} disabled={saving}>
              {t('goals.goalsSettings.bodyFatGoalClear', 'Clear')}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
