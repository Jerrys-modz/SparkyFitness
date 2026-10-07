import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useProfileQuery } from '@/hooks/Settings/useProfile';
import { useSetTargetWeight } from '@/hooks/Onboarding/useOnboarding';
import { kgToLbs, lbsToKg } from '@/utils/unitConversions';

export const GoalWeight = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { weightUnit } = usePreferences();
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

  // `null` means the user has not edited; show what is saved.
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? savedDisplay;
  const parsed = Number(value);
  const isValid = value.trim() !== '' && Number.isFinite(parsed) && parsed > 0;

  const handleSave = async () => {
    if (!isValid) return;
    await saveTargetWeight(inputUnit === 'kg' ? parsed : lbsToKg(parsed));
    setDraft(null);
  };

  const handleClear = async () => {
    await saveTargetWeight(null);
    setDraft(null);
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
            onChange={(e) => setDraft(e.target.value)}
          />
          {draft !== null && !isValid && draft.trim() !== '' && (
            <p className="text-xs text-destructive">
              {t(
                'goals.goalsSettings.goalWeightInvalid',
                'Enter a weight greater than zero.'
              )}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={saving || !isValid}>
            {t('goals.goalsSettings.goalWeightSave', 'Save goal weight')}
          </Button>
          {savedDisplay !== '' && (
            <Button variant="outline" onClick={handleClear} disabled={saving}>
              {t('goals.goalsSettings.goalWeightClear', 'Clear')}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
