import { useTranslation } from 'react-i18next';
import type { WeeklyCalorieBudgetDay } from '@workspace/shared';
import { usePreferences } from '@/contexts/PreferencesContext';

interface WeeklyCalorieBudgetSummaryProps {
  budget: WeeklyCalorieBudgetDay;
  /** Calories logged on the selected day so far, kcal. */
  eatenToday: number;
}

/**
 * Used / remaining / the day's adjusted target for the weekly calorie budget,
 * all from the server's `summary.weeklyCalorieBudget`; nothing is recomputed.
 */
export function WeeklyCalorieBudgetSummary({
  budget,
  eatenToday,
}: WeeklyCalorieBudgetSummaryProps) {
  const { t } = useTranslation();
  const { convertEnergy, energyUnit, getEnergyUnitString } = usePreferences();
  const unit = getEnergyUnitString(energyUnit);
  const show = (kcal: number) =>
    Math.round(convertEnergy(kcal, 'kcal', energyUnit)).toLocaleString();

  const used = budget.eatenSoFar + Math.max(0, eatenToday);
  const remaining = budget.weekBudget - used;
  const absShift = show(Math.abs(budget.shift));

  let reason: string;
  if (budget.countedDays === 0) {
    reason = t(
      'diary.weeklyBudget.reasonNoDays',
      'No finished days counted yet this week, so today keeps its own target.'
    );
  } else if (budget.shift === 0 && budget.carryover === 0) {
    reason = t(
      'diary.weeklyBudget.reasonOnTrack',
      'You are on track for the week, so today keeps its own target.'
    );
  } else if (budget.carryover > 0) {
    reason = t(
      'diary.weeklyBudget.reasonUnder',
      '{{amount}} {{unit}} under so far, spread over {{days}} days left: +{{shift}} {{unit}} today.',
      {
        amount: show(budget.carryover),
        days: budget.daysLeft,
        shift: absShift,
        unit,
      }
    );
  } else {
    reason = t(
      'diary.weeklyBudget.reasonOver',
      '{{amount}} {{unit}} over so far, spread over {{days}} days left: −{{shift}} {{unit}} today.',
      {
        amount: show(-budget.carryover),
        days: budget.daysLeft,
        shift: absShift,
        unit,
      }
    );
  }

  return (
    <div
      className="rounded-lg border border-border p-3 space-y-2"
      data-testid="weekly-calorie-budget-summary"
    >
      <div className="text-sm font-medium">
        {t('diary.weeklyBudget.title', 'Weekly budget')}
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div
            className="text-base font-semibold tabular-nums"
            data-testid="weekly-budget-used"
          >
            {show(used)}
          </div>
          <div className="text-xs text-muted-foreground">
            {t('diary.weeklyBudget.used', 'Used of {{total}}', {
              total: show(budget.weekBudget),
            })}
          </div>
        </div>
        <div>
          <div
            className="text-base font-semibold tabular-nums"
            data-testid="weekly-budget-remaining"
          >
            {show(remaining)}
          </div>
          <div className="text-xs text-muted-foreground">
            {t('diary.weeklyBudget.remaining', 'Remaining')}
          </div>
        </div>
        <div>
          <div
            className="text-base font-semibold tabular-nums"
            data-testid="weekly-budget-target"
          >
            {show(budget.target)}
          </div>
          <div className="text-xs text-muted-foreground">
            {t('diary.weeklyBudget.todayTarget', "Today's target")}
          </div>
        </div>
      </div>
      <p
        className="text-xs text-muted-foreground"
        data-testid="weekly-budget-reason"
      >
        {reason}
        {budget.limitedBy === 'cap' &&
          ` ${t(
            'diary.weeklyBudget.limitedByCap',
            'Limited to ±{{percent}}% of your daily target.',
            { percent: budget.maxShiftPercent }
          )}`}
        {budget.limitedBy === 'floor' &&
          ` ${t(
            'diary.weeklyBudget.limitedByFloor',
            'Held at your safety floor.'
          )}`}
        {budget.unloggedDays > 0 &&
          ` ${t(
            'diary.weeklyBudget.unloggedDays',
            '{{count}} day(s) with nothing logged count as on target.',
            { count: budget.unloggedDays }
          )}`}
      </p>
      <p className="text-xs text-muted-foreground">
        {t(
          'diary.weeklyBudget.estimateNote',
          'The week total is an estimate: the days left use today’s base target ({{base}} {{unit}}).',
          { base: show(budget.baseTarget), unit }
        )}
      </p>
    </div>
  );
}
