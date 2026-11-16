import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  MAX_GOAL_MODE_WEEKLY_CHANGE_KG,
  type GoalWeightPlanResponse,
} from '@workspace/shared';
import { Button } from '@/components/ui/button';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useRefreshGoalWeightPlan } from '@/hooks/Onboarding/useOnboarding';
import { getGoalModeLabel } from '@/utils/calculationLabels';
import { kgToLbs } from '@/utils/unitConversions';

/** A weekly pace the weekly goal mode can store: within its bound, to the gram. */
const storableWeeklyChangeKg = (kgPerWeek: number): number =>
  Math.round(
    Math.max(
      -MAX_GOAL_MODE_WEEKLY_CHANGE_KG,
      Math.min(MAX_GOAL_MODE_WEEKLY_CHANGE_KG, kgPerWeek)
    ) * 1000
  ) / 1000;

interface GoalWeightPlanPanelProps {
  data: GoalWeightPlanResponse;
}

/**
 * What the goal weight's target date needs, next to what the calorie goal
 * gives. Offers a pace with one tap; never changes calories by itself.
 */
export const GoalWeightPlanPanel = ({ data }: GoalWeightPlanPanelProps) => {
  const { t } = useTranslation();
  const refreshPlan = useRefreshGoalWeightPlan();
  const {
    weightUnit,
    energyUnit,
    convertEnergy,
    getEnergyUnitString,
    formatDate,
    saveAllPreferences,
  } = usePreferences();
  const [applying, setApplying] = useState(false);
  const plan = data.plan;
  if (!plan || data.goalKg === null || !data.targetDate) return null;

  const unit = weightUnit === 'kg' ? 'kg' : 'lbs';
  const weight = (kg: number) =>
    Number((unit === 'kg' ? kg : kgToLbs(kg)).toFixed(1)).toString();
  const pace = (kgPerWeek: number) =>
    Number(
      (unit === 'kg'
        ? Math.abs(kgPerWeek)
        : kgToLbs(Math.abs(kgPerWeek))
      ).toFixed(2)
    ).toString();
  const goal = `${weight(data.goalKg)} ${unit}`;
  const targetDate = formatDate(data.targetDate);
  const modeLabel = data.goalMode
    ? getGoalModeLabel(t, data.goalMode)
    : t('goals.goalsSettings.goalWeightPlan.calorieGoal', 'calorie goal');

  const apply = async (
    prefs: Parameters<typeof saveAllPreferences>[0]
  ): Promise<void> => {
    setApplying(true);
    try {
      await saveAllPreferences(prefs);
      await refreshPlan();
    } finally {
      setApplying(false);
    }
  };

  const lines: string[] = [];
  if (plan.status === 'reached') {
    lines.push(
      t('goals.goalsSettings.goalWeightPlan.reached', {
        goal,
        defaultValue: 'You have reached {{goal}}.',
      })
    );
  } else if (plan.status === 'date_passed') {
    lines.push(
      t('goals.goalsSettings.goalWeightPlan.datePassed', {
        date: targetDate,
        defaultValue:
          'Your target date ({{date}}) has passed. Pick a new date to see the pace it needs.',
      })
    );
  } else if (plan.requiredKgPerWeek !== null) {
    const required = plan.requiredKgPerWeek;
    lines.push(
      t(
        required < 0
          ? 'goals.goalsSettings.goalWeightPlan.requiredLoss'
          : 'goals.goalsSettings.goalWeightPlan.requiredGain',
        {
          goal,
          date: targetDate,
          pace: pace(required),
          unit,
          energy: Math.round(
            convertEnergy(
              Math.abs(plan.requiredDailyKcal ?? 0),
              'kcal',
              energyUnit
            )
          ),
          energyUnit: getEnergyUnitString(energyUnit),
          defaultValue:
            required < 0
              ? 'To reach {{goal}} by {{date}}: lose {{pace}} {{unit}} a week (about {{energy}} {{energyUnit}} a day under maintenance).'
              : 'To reach {{goal}} by {{date}}: gain {{pace}} {{unit}} a week (about {{energy}} {{energyUnit}} a day over maintenance).',
        }
      )
    );
    if (plan.settingKgPerWeek !== null) {
      lines.push(
        plan.settingReachDate
          ? t('goals.goalsSettings.goalWeightPlan.setting', {
              mode: modeLabel,
              pace: pace(plan.settingKgPerWeek),
              unit,
              goal,
              date: formatDate(plan.settingReachDate),
              defaultValue:
                'Your {{mode}} setting: about {{pace}} {{unit}} a week, reaching {{goal}} around {{date}}.',
            })
          : t('goals.goalsSettings.goalWeightPlan.settingNoReach', {
              mode: modeLabel,
              defaultValue:
                'Your {{mode}} setting does not move you toward this goal.',
            })
      );
    } else {
      lines.push(
        t('goals.goalsSettings.goalWeightPlan.noSetting', {
          defaultValue:
            'Once there is a maintenance estimate and a calorie goal, this compares them with your date.',
        })
      );
    }
    if (plan.status === 'on_course') {
      lines.push(
        t('goals.goalsSettings.goalWeightPlan.onCourse', {
          defaultValue: 'Your calorie goal is on course for this date.',
        })
      );
    }
  }

  const schedule = plan.schedule;
  const showPaceActions =
    plan.requiredKgPerWeek !== null &&
    (plan.status === 'needs_faster' ||
      plan.status === 'needs_slower' ||
      plan.status === 'wrong_direction');
  const suggested =
    plan.requiredKgPerWeek === null
      ? null
      : storableWeeklyChangeKg(plan.requiredKgPerWeek);

  return (
    <div
      className="space-y-2 rounded-md border p-3 text-sm"
      data-testid="goal-weight-plan"
    >
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
      {schedule &&
        plan.status !== 'reached' &&
        plan.status !== 'date_passed' && (
          <p className="text-muted-foreground">
            {schedule.daysAhead === 0
              ? t('goals.goalsSettings.goalWeightPlan.onPath', {
                  defaultValue: 'You are on the planned path.',
                })
              : schedule.daysAhead > 0
                ? t('goals.goalsSettings.goalWeightPlan.ahead', {
                    count: schedule.daysAhead,
                    defaultValue: '{{count}} days ahead of the planned path.',
                  })
                : t('goals.goalsSettings.goalWeightPlan.behind', {
                    count: -schedule.daysAhead,
                    defaultValue: '{{count}} days behind the planned path.',
                  })}
          </p>
        )}
      {plan.status === 'wrong_direction' && (
        <p className="text-amber-600 dark:text-amber-400">
          {t(
            (plan.requiredKgPerWeek ?? 0) < 0
              ? 'goals.goalsSettings.goalWeightPlan.wrongDirectionLoss'
              : 'goals.goalsSettings.goalWeightPlan.wrongDirectionGain',
            {
              defaultValue:
                (plan.requiredKgPerWeek ?? 0) < 0
                  ? 'Your calorie goal is not set to lose weight; this goal needs a loss.'
                  : 'Your calorie goal is not set to gain weight; this goal needs a gain.',
            }
          )}
        </p>
      )}
      {plan.safetyZone && plan.safetyZone !== 'green' && (
        <p
          className={
            plan.safetyZone === 'red'
              ? 'text-destructive'
              : 'text-amber-600 dark:text-amber-400'
          }
        >
          {t(
            plan.safetyZone === 'red'
              ? 'goals.goalsSettings.goalWeightPlan.paceRed'
              : 'goals.goalsSettings.goalWeightPlan.paceYellow',
            {
              percent: plan.requiredPercentPerWeek,
              defaultValue:
                plan.safetyZone === 'red'
                  ? 'This date needs {{percent}}% of your body weight a week, which is very fast. A later date is easier to keep up.'
                  : 'This date needs {{percent}}% of your body weight a week, which is on the fast side.',
            }
          )}
        </p>
      )}
      {plan.belowFloor && (
        <p className="text-destructive">
          {plan.earliestDate
            ? t('goals.goalsSettings.goalWeightPlan.belowFloorEarliest', {
                date: formatDate(plan.earliestDate),
                defaultValue:
                  'This pace would put calories under the safe minimum. The earliest date reachable above it is about {{date}}.',
              })
            : t('goals.goalsSettings.goalWeightPlan.belowFloor', {
                defaultValue:
                  'This pace would put calories under the safe minimum.',
              })}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {showPaceActions && suggested !== null && (
          <Button
            size="sm"
            disabled={applying}
            onClick={() =>
              apply({ goalMode: 'weekly', goalModeWeeklyChangeKg: suggested })
            }
          >
            {t(
              suggested < 0
                ? 'goals.goalsSettings.goalWeightPlan.useLossPace'
                : 'goals.goalsSettings.goalWeightPlan.useGainPace',
              {
                pace: pace(suggested),
                unit,
                defaultValue:
                  suggested < 0
                    ? 'Use lose {{pace}} {{unit}} a week'
                    : 'Use gain {{pace}} {{unit}} a week',
              }
            )}
          </Button>
        )}
        {showPaceActions &&
          plan.highCutKgPerWeek !== null &&
          data.goalMode !== 'high_cut' && (
            <Button
              size="sm"
              variant="outline"
              disabled={applying}
              onClick={() => apply({ goalMode: 'high_cut' })}
            >
              {t('goals.goalsSettings.goalWeightPlan.useHighCut', {
                mode: getGoalModeLabel(t, 'high_cut'),
                defaultValue: 'Use {{mode}}',
              })}
            </Button>
          )}
        {plan.status === 'reached' && data.goalMode !== 'maintain' && (
          <Button
            size="sm"
            variant="outline"
            disabled={applying}
            onClick={() => apply({ goalMode: 'maintain' })}
          >
            {t('goals.goalsSettings.goalWeightPlan.switchToMaintain', {
              mode: getGoalModeLabel(t, 'maintain'),
              defaultValue: 'Switch calorie goal to {{mode}}',
            })}
          </Button>
        )}
      </div>
    </div>
  );
};
