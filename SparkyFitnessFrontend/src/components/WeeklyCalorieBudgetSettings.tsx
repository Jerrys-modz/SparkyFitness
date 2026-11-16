import { useTranslation } from 'react-i18next';
import {
  WEEKLY_CALORIE_BUDGET_MAX_SHIFT_PERCENT,
  WEEKLY_CALORIE_BUDGET_MIN_SHIFT_PERCENT,
} from '@workspace/shared';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';

interface WeeklyCalorieBudgetSettingsProps {
  enabled: boolean;
  maxShiftPercent: number;
  onChange: (value: { enabled: boolean; maxShiftPercent: number }) => void;
}

/**
 * The weekly calorie budget switch and its daily cap. The maths is the shared
 * `weeklyBudgetDayTarget`; the server applies it to each day's goal.
 */
export function WeeklyCalorieBudgetSettings({
  enabled,
  maxShiftPercent,
  onChange,
}: WeeklyCalorieBudgetSettingsProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4" data-testid="weekly-calorie-budget-settings">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Label
            htmlFor="weekly-calorie-budget-enabled"
            className="text-base font-semibold"
          >
            {t('settings.weeklyCalorieBudget.title', 'Weekly calorie budget')}
          </Label>
          <p className="text-sm text-muted-foreground">
            {t(
              'settings.weeklyCalorieBudget.description',
              "Carry what you ate above or below your targets earlier in the week over the days left. Your week's budget is the sum of its daily targets."
            )}
          </p>
        </div>
        <Switch
          id="weekly-calorie-budget-enabled"
          checked={enabled}
          onCheckedChange={(checked) =>
            onChange({ enabled: checked, maxShiftPercent })
          }
        />
      </div>

      {enabled && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label htmlFor="weekly-calorie-budget-cap">
              {t(
                'settings.weeklyCalorieBudget.maxShift',
                'Largest daily change'
              )}
            </Label>
            <span
              className="text-sm font-medium tabular-nums"
              data-testid="weekly-calorie-budget-cap-value"
            >
              ±{maxShiftPercent}%
            </span>
          </div>
          <Slider
            id="weekly-calorie-budget-cap"
            min={WEEKLY_CALORIE_BUDGET_MIN_SHIFT_PERCENT}
            max={WEEKLY_CALORIE_BUDGET_MAX_SHIFT_PERCENT}
            step={1}
            value={[maxShiftPercent]}
            onValueChange={([value]) =>
              onChange({ enabled, maxShiftPercent: value ?? maxShiftPercent })
            }
            aria-label={t(
              'settings.weeklyCalorieBudget.maxShift',
              'Largest daily change'
            )}
          />
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>
              {t(
                'settings.weeklyCalorieBudget.ruleCap',
                "A day's target never moves by more than this share of its own target, and never goes below your safety floor."
              )}
            </li>
            <li>
              {t(
                'settings.weeklyCalorieBudget.ruleWeekStart',
                'The week starts on your first day of the week (Preferences). Nothing carries into the next week.'
              )}
            </li>
            <li>
              {t(
                'settings.weeklyCalorieBudget.ruleCompleted',
                "Only finished days count. A day with nothing logged counts as on target, and today's eating moves tomorrow, not today."
              )}
            </li>
            <li>
              {t(
                'settings.weeklyCalorieBudget.ruleStartsToday',
                'Turning it on starts from today: earlier days of this week are not counted.'
              )}
            </li>
            <li>
              {t(
                'settings.weeklyCalorieBudget.ruleExercise',
                'Exercise calories your adjustment mode adds back count on the day you logged them, so a workout is never counted twice.'
              )}
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}
