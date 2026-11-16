import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import {
  MAX_GOAL_MODE_WEEKLY_CHANGE_KG,
  type GoalWeightPlanResponse,
} from '@workspace/shared';
import Button from './ui/Button';
import { updatePreferences } from '../services/api/preferencesApi';
import {
  goalWeightPlanQueryKey,
  preferencesQueryKey,
} from '../hooks/queryKeys';
import type { UserPreferences } from '../types/preferences';
import { formatDayLabel } from '../utils/dayLabel';
import { formatEnergy } from '../utils/energyUnit';
import { useEnergyUnit } from '../hooks/useEnergyUnit';
import { weightFromKg } from '../utils/unitConversions';
import { formatLocalizedNumber } from '../localization/i18n';

/** A pace the weekly goal mode can store: within its bound, to the gram. */
const storableWeeklyChangeKg = (kgPerWeek: number): number =>
  Math.round(
    Math.max(
      -MAX_GOAL_MODE_WEEKLY_CHANGE_KG,
      Math.min(MAX_GOAL_MODE_WEEKLY_CHANGE_KG, kgPerWeek)
    ) * 1000
  ) / 1000;

/** The calorie goal mode's label, as Calorie Settings shows it. */
const goalModeLabel = (t: TFunction, mode: string): string => {
  switch (mode) {
    case 'weekly':
      return t('calorieSettings.goalMode.weekly', {
        defaultValue: 'Weekly weight change',
      });
    case 'recomp':
      return t('calorieSettings.goalMode.recomp', {
        defaultValue: 'Body Recomposition (-10%)',
      });
    case 'cut':
      return t('calorieSettings.goalMode.cut', { defaultValue: 'Cut (-15%)' });
    case 'high_cut':
      return t('calorieSettings.goalMode.highCut', {
        defaultValue: 'High Cut (-20%)',
      });
    case 'lean_bulk':
      return t('calorieSettings.goalMode.leanBulk', {
        defaultValue: 'Lean Bulk (+10%)',
      });
    case 'bulk':
      return t('calorieSettings.goalMode.bulk', {
        defaultValue: 'Bulk (+20%)',
      });
    case 'manual':
      return t('calorieSettings.goalMode.manual', {
        defaultValue: 'Manual (Custom %)',
      });
    default:
      return t('calorieSettings.goalMode.maintain', {
        defaultValue: 'Maintain (0%)',
      });
  }
};

interface GoalWeightPlanCardProps {
  data: GoalWeightPlanResponse;
  weightUnit: 'kg' | 'lbs';
}

/**
 * What the goal weight's target date needs, next to what the calorie goal
 * gives. Offers a pace with one tap; never changes calories by itself.
 */
const GoalWeightPlanCard: React.FC<GoalWeightPlanCardProps> = ({
  data,
  weightUnit,
}) => {
  const { t } = useTranslation();
  const energyUnit = useEnergyUnit();
  const queryClient = useQueryClient();
  const apply = useMutation({
    mutationFn: (prefs: Partial<UserPreferences>) => updatePreferences(prefs),
    onSuccess: () =>
      Promise.all(
        [
          preferencesQueryKey,
          goalWeightPlanQueryKey,
          ['dailySummary'],
          ['familyDailySummary'],
          ['goals'],
          ['goalsRange'],
          ['nutritionTrends'],
        ].map((queryKey) => queryClient.invalidateQueries({ queryKey }))
      ),
    onError: () =>
      Toast.show({
        type: 'error',
        text1: t('common.error', { defaultValue: 'Error' }),
        text2: t('calorieSettings.updateFailed', {
          defaultValue: 'Failed to update setting.',
        }),
      }),
  });

  const plan = data.plan;
  if (!plan || data.goalKg === null || !data.targetDate) return null;

  const modeLabel = (mode: string) => goalModeLabel(t, mode);
  const weight = (kg: number) =>
    formatLocalizedNumber(weightFromKg(kg, weightUnit), {
      maximumFractionDigits: 1,
    });
  const pace = (kgPerWeek: number) =>
    formatLocalizedNumber(weightFromKg(Math.abs(kgPerWeek), weightUnit), {
      maximumFractionDigits: 2,
    });
  const goal = `${weight(data.goalKg)} ${weightUnit}`;
  const targetDate = formatDayLabel(data.targetDate, 'short');
  const required = plan.requiredKgPerWeek;
  const suggested = required === null ? null : storableWeeklyChangeKg(required);
  const showPaceActions =
    suggested !== null &&
    (plan.status === 'needs_faster' ||
      plan.status === 'needs_slower' ||
      plan.status === 'wrong_direction');

  const lines: { key: string; text: string; tone?: 'warn' | 'danger' }[] = [];
  if (plan.status === 'reached') {
    lines.push({
      key: 'reached',
      text: t('goals.goalWeightPlan.reached', {
        goal,
        defaultValue: 'You have reached {{goal}}.',
      }),
    });
  } else if (plan.status === 'date_passed') {
    lines.push({
      key: 'passed',
      text: t('goals.goalWeightPlan.datePassed', {
        date: targetDate,
        defaultValue:
          'Your target date ({{date}}) has passed. Pick a new date to see the pace it needs.',
      }),
    });
  } else if (required !== null) {
    const requiredParams = {
      goal,
      date: targetDate,
      pace: pace(required),
      unit: weightUnit,
      energy: formatEnergy(
        Math.abs(plan.requiredDailyKcal ?? 0),
        energyUnit,
        t
      ),
    };
    lines.push({
      key: 'required',
      text:
        required < 0
          ? t('goals.goalWeightPlan.requiredLoss', {
              ...requiredParams,
              defaultValue:
                'To reach {{goal}} by {{date}}: lose {{pace}} {{unit}} a week (about {{energy}} a day under maintenance).',
            })
          : t('goals.goalWeightPlan.requiredGain', {
              ...requiredParams,
              defaultValue:
                'To reach {{goal}} by {{date}}: gain {{pace}} {{unit}} a week (about {{energy}} a day over maintenance).',
            }),
    });
    const mode = modeLabel(data.goalMode ?? 'maintain');
    lines.push({
      key: 'setting',
      text:
        plan.settingKgPerWeek === null
          ? t('goals.goalWeightPlan.noSetting', {
              defaultValue:
                'Once there is a maintenance estimate and a calorie goal, this compares them with your date.',
            })
          : plan.settingReachDate
            ? t('goals.goalWeightPlan.setting', {
                mode,
                pace: pace(plan.settingKgPerWeek),
                unit: weightUnit,
                goal,
                date: formatDayLabel(plan.settingReachDate, 'short'),
                defaultValue:
                  'Your {{mode}} setting: about {{pace}} {{unit}} a week, reaching {{goal}} around {{date}}.',
              })
            : t('goals.goalWeightPlan.settingNoReach', {
                mode,
                defaultValue:
                  'Your {{mode}} setting does not move you toward this goal.',
              }),
    });
    if (plan.status === 'on_course') {
      lines.push({
        key: 'onCourse',
        text: t('goals.goalWeightPlan.onCourse', {
          defaultValue: 'Your calorie goal is on course for this date.',
        }),
      });
    }
    if (plan.schedule) {
      const days = plan.schedule.daysAhead;
      lines.push({
        key: 'schedule',
        text:
          days === 0
            ? t('goals.goalWeightPlan.onPath', {
                defaultValue: 'You are on the planned path.',
              })
            : days > 0
              ? t('goals.goalWeightPlan.ahead', {
                  count: days,
                  defaultValue: '{{count}} days ahead of the planned path.',
                })
              : t('goals.goalWeightPlan.behind', {
                  count: -days,
                  defaultValue: '{{count}} days behind the planned path.',
                }),
      });
    }
    if (plan.status === 'wrong_direction') {
      lines.push({
        key: 'direction',
        tone: 'warn',
        text:
          required < 0
            ? t('goals.goalWeightPlan.wrongDirectionLoss', {
                defaultValue:
                  'Your calorie goal is not set to lose weight; this goal needs a loss.',
              })
            : t('goals.goalWeightPlan.wrongDirectionGain', {
                defaultValue:
                  'Your calorie goal is not set to gain weight; this goal needs a gain.',
              }),
      });
    }
    if (plan.safetyZone === 'yellow' || plan.safetyZone === 'red') {
      lines.push({
        key: 'zone',
        tone: plan.safetyZone === 'red' ? 'danger' : 'warn',
        text:
          plan.safetyZone === 'red'
            ? t('goals.goalWeightPlan.paceRed', {
                percent: plan.requiredPercentPerWeek,
                defaultValue:
                  'This date needs {{percent}}% of your body weight a week, which is very fast. A later date is easier to keep up.',
              })
            : t('goals.goalWeightPlan.paceYellow', {
                percent: plan.requiredPercentPerWeek,
                defaultValue:
                  'This date needs {{percent}}% of your body weight a week, which is on the fast side.',
              }),
      });
    }
    if (plan.belowFloor) {
      lines.push({
        key: 'floor',
        tone: 'danger',
        text: plan.earliestDate
          ? t('goals.goalWeightPlan.belowFloorEarliest', {
              date: formatDayLabel(plan.earliestDate, 'short'),
              defaultValue:
                'This pace would put calories under the safe minimum. The earliest date reachable above it is about {{date}}.',
            })
          : t('goals.goalWeightPlan.belowFloor', {
              defaultValue:
                'This pace would put calories under the safe minimum.',
            }),
      });
    }
  }

  return (
    <View
      className="gap-2 rounded-lg border border-border-subtle p-3"
      testID="goal-weight-plan"
    >
      {lines.map((line) => (
        <Text
          key={line.key}
          className={
            line.tone === 'danger'
              ? 'text-sm text-icon-danger'
              : line.tone === 'warn'
                ? 'text-sm text-icon-warning'
                : 'text-sm text-text-primary'
          }
        >
          {line.text}
        </Text>
      ))}
      <View className="flex-row flex-wrap gap-2">
        {showPaceActions && suggested !== null && (
          <Button
            variant="primary"
            disabled={apply.isPending}
            onPress={() =>
              apply.mutate({
                goal_mode: 'weekly',
                goal_mode_weekly_change_kg: suggested,
              })
            }
            testID="goal-weight-plan-use-pace"
          >
            {suggested < 0
              ? t('goals.goalWeightPlan.useLossPace', {
                  pace: pace(suggested),
                  unit: weightUnit,
                  defaultValue: 'Use lose {{pace}} {{unit}} a week',
                })
              : t('goals.goalWeightPlan.useGainPace', {
                  pace: pace(suggested),
                  unit: weightUnit,
                  defaultValue: 'Use gain {{pace}} {{unit}} a week',
                })}
          </Button>
        )}
        {showPaceActions &&
          plan.highCutKgPerWeek !== null &&
          data.goalMode !== 'high_cut' && (
            <Button
              variant="outline"
              disabled={apply.isPending}
              onPress={() => apply.mutate({ goal_mode: 'high_cut' })}
              testID="goal-weight-plan-use-high-cut"
            >
              {t('goals.goalWeightPlan.useHighCut', {
                mode: modeLabel('high_cut'),
                defaultValue: 'Use {{mode}}',
              })}
            </Button>
          )}
        {plan.status === 'reached' && data.goalMode !== 'maintain' && (
          <Button
            variant="outline"
            disabled={apply.isPending}
            onPress={() => apply.mutate({ goal_mode: 'maintain' })}
            testID="goal-weight-plan-maintain"
          >
            {t('goals.goalWeightPlan.switchToMaintain', {
              mode: modeLabel('maintain'),
              defaultValue: 'Switch calorie goal to {{mode}}',
            })}
          </Button>
        )}
      </View>
    </View>
  );
};

export default GoalWeightPlanCard;
