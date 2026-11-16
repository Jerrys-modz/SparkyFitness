import React, { useEffect, useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  milestonesToCelebrate,
  type WeightMilestone,
  type WeightProgressStartSource,
} from '@workspace/shared';

import { useWeightProgress } from '../../hooks/useWeightProgress';
import { useEnergyUnit } from '../../hooks/useEnergyUnit';
import { formatEnergy } from '../../utils/energyUnit';
import { getAppLocale } from '../../localization';
import { formatShortDate } from '../../utils/dateUtils';
import {
  formatWeightDisplay,
  type WeightDisplayMode,
} from '../../utils/unitConversions';

/** How many reached milestones the card lists, newest first. */
const SHOWN_MILESTONES = 4;

/** A weight change with its sign; a change that rounds to nothing has none. */
export function signedWeightText(kg: number, mode: WeightDisplayMode): string {
  const text = formatWeightDisplay(Math.abs(kg), mode);
  if (Number(text.replace(/[^\d.]/g, '')) === 0) return text;
  return `${kg > 0 ? '+' : kg < 0 ? '-' : ''}${text}`;
}

const signedPercentText = (value: number) => {
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) return '0%';
  return `${rounded > 0 ? '+' : '-'}${Math.abs(rounded).toFixed(1)}%`;
};

export function milestoneLabel(milestone: WeightMilestone, t: TFunction) {
  switch (milestone.kind) {
    case 'amount':
      return t('weightProgress.milestoneAmount', {
        defaultValue: '{{amount}} {{unit}} from your start',
        amount: milestone.value,
        unit: milestone.id.endsWith(':lbs') ? 'lbs' : 'kg',
      });
    case 'percent':
      return t('weightProgress.milestonePercent', {
        defaultValue: '{{percent}}% of your starting weight',
        percent: milestone.value,
      });
    case 'halfway':
      return t('weightProgress.milestoneHalfway', {
        defaultValue: 'Halfway to goal',
      });
    case 'goal':
      return t('weightProgress.milestoneGoal', { defaultValue: 'Goal weight' });
  }
}

const Stat: React.FC<{
  label: string;
  value: string;
  hint?: string;
  testID: string;
}> = ({ label, value, hint, testID }) => (
  <View
    className="w-1/2 p-1"
    testID={testID}
    accessible
    accessibilityLabel={`${label}: ${value}`}
  >
    <View className="rounded-lg border border-border-subtle p-3">
      <Text className="text-text-muted text-xs">{label}</Text>
      <Text className="text-text-primary text-base font-semibold">{value}</Text>
      {hint ? <Text className="text-text-muted text-xs">{hint}</Text> : null}
    </View>
  </View>
);

const WeightProgressCard: React.FC<{
  targetWeightKg: number | null;
  weightMode: WeightDisplayMode;
}> = ({ targetWeightKg, weightMode }) => {
  const { t } = useTranslation();
  const energyUnit = useEnergyUnit();
  const locale = getAppLocale();
  const {
    isLoading,
    progress,
    milestones,
    energy,
    expenditureKcal,
    settings,
    updateSettings,
  } = useWeightProgress({
    targetWeightKg,
    unit: weightMode === 'kg' ? 'kg' : 'lbs',
  });

  const startDate = progress?.start.date ?? null;
  const achievedIds = useMemo(
    () => (milestones?.achieved ?? []).map((m) => m.id),
    [milestones]
  );
  // First view of a start (or a new start): what is already reached is shown,
  // not celebrated.
  useEffect(() => {
    if (isLoading || !milestones || !startDate) return;
    if (settings.seen?.startDate !== startDate) {
      updateSettings({ seen: { startDate, ids: achievedIds } });
    }
  }, [
    isLoading,
    milestones,
    startDate,
    achievedIds,
    settings.seen,
    updateSettings,
  ]);

  if (isLoading || !progress) return null;

  const date = (day: string) => formatShortDate(day, locale);
  const weight = (kg: number) => formatWeightDisplay(kg, weightMode);
  const sourceText = (source: WeightProgressStartSource) =>
    source === 'custom'
      ? t('weightProgress.sourceCustom', { defaultValue: 'start you chose' })
      : source === 'onboarding'
        ? t('weightProgress.sourceOnboarding', {
            defaultValue: 'from your setup',
          })
        : t('weightProgress.sourceFirst', {
            defaultValue: 'your first weigh-in',
          });
  const celebrate =
    milestones && startDate && !settings.milestonesHidden
      ? milestonesToCelebrate(milestones.achieved, startDate, settings.seen)
      : [];
  const goal = progress.goal;

  return (
    <View
      className="bg-surface rounded-xl p-4 my-2 shadow-sm"
      testID="weight-progress-card"
    >
      <Text className="text-text-primary text-lg font-semibold">
        {t('weightProgress.title', { defaultValue: 'Weight progress' })}
      </Text>
      <Text className="text-text-muted text-xs mb-2">
        {t('weightProgress.startedOn', {
          defaultValue: 'Since {{date}} ({{source}})',
          date: date(progress.start.date),
          source: sourceText(progress.start.source),
        })}
      </Text>
      <View className="flex-row flex-wrap -m-1">
        <Stat
          testID="weight-progress-start"
          label={t('weightProgress.startWeight', {
            defaultValue: 'Starting weight',
          })}
          value={weight(progress.start.weight)}
        />
        <Stat
          testID="weight-progress-change"
          label={t('weightProgress.change', { defaultValue: 'Change (trend)' })}
          value={signedWeightText(progress.totalChange, weightMode)}
          hint={t('weightProgress.now', {
            defaultValue: 'Now {{weight}}',
            weight: weight(progress.currentTrend),
          })}
        />
        <Stat
          testID="weight-progress-percent"
          label={t('weightProgress.percentOfStart', {
            defaultValue: 'Of starting weight',
          })}
          value={signedPercentText(progress.percentChange)}
        />
        <Stat
          testID="weight-progress-goal"
          label={t('weightProgress.towardGoal', {
            defaultValue: 'Toward goal',
          })}
          value={goal ? `${Math.round(goal.percentToGoal)}%` : '-'}
          hint={
            goal
              ? goal.reached
                ? t('weightProgress.goalReached', {
                    defaultValue: 'Goal reached',
                  })
                : t('weightProgress.toGo', {
                    defaultValue: '{{weight}} to go',
                    weight: weight(goal.remaining),
                  })
              : t('weightProgress.noGoal', {
                  defaultValue: 'Set a goal weight in Goals',
                })
          }
        />
      </View>
      {goal ? (
        <View
          className="h-2 rounded-full bg-progress-track mt-3 overflow-hidden"
          accessibilityRole="progressbar"
          accessibilityValue={{
            min: 0,
            max: 100,
            now: Math.round(goal.percentToGoal),
          }}
        >
          <View
            className="h-2 bg-accent-primary"
            style={{ width: `${goal.percentToGoal}%` }}
          />
        </View>
      ) : null}

      {milestones && !settings.milestonesHidden ? (
        <View className="mt-4" testID="weight-milestones">
          <View className="flex-row justify-between items-center mb-1">
            <Text className="text-text-primary text-sm font-semibold">
              {t('weightProgress.milestones', { defaultValue: 'Milestones' })}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => updateSettings({ milestonesHidden: true })}
              testID="weight-milestones-hide"
            >
              <Text className="text-text-secondary text-xs">
                {t('weightProgress.hideMilestones', {
                  defaultValue: 'Hide milestones',
                })}
              </Text>
            </Pressable>
          </View>
          {celebrate.length > 0 && startDate ? (
            <View
              className="rounded-lg bg-accent-muted p-3 mb-2 flex-row justify-between items-start"
              testID="weight-milestone-celebration"
              accessibilityLiveRegion="polite"
            >
              <Text className="text-text-primary text-sm flex-1 mr-2">
                {t('weightProgress.celebrate', {
                  defaultValue: 'Milestone reached: {{milestones}}',
                  milestones: celebrate
                    .map((m) => milestoneLabel(m, t))
                    .join(', '),
                })}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  updateSettings({ seen: { startDate, ids: achievedIds } })
                }
                testID="weight-milestone-dismiss"
              >
                <Text className="text-text-secondary text-xs">
                  {t('weightProgress.dismiss', { defaultValue: 'Dismiss' })}
                </Text>
              </Pressable>
            </View>
          ) : null}
          {milestones.achieved.length > 0 ? (
            [...milestones.achieved]
              .reverse()
              .slice(0, SHOWN_MILESTONES)
              .map((m) => (
                <Text key={m.id} className="text-text-secondary text-sm py-0.5">
                  {milestoneLabel(m, t)}
                  {m.achievedOn ? ` · ${date(m.achievedOn)}` : ''}
                </Text>
              ))
          ) : (
            <Text className="text-text-muted text-xs">
              {t('weightProgress.noneYet', {
                defaultValue: 'No milestones reached yet.',
              })}
            </Text>
          )}
          {milestones.next && milestones.toNext !== null ? (
            <Text className="text-text-muted text-xs mt-1">
              {t('weightProgress.nextMilestone', {
                defaultValue: 'Next: {{milestone}}, {{weight}} to go',
                milestone: milestoneLabel(milestones.next, t),
                weight: weight(milestones.toNext),
              })}
            </Text>
          ) : null}
        </View>
      ) : null}
      {milestones && settings.milestonesHidden ? (
        <Pressable
          accessibilityRole="button"
          className="mt-3"
          onPress={() => updateSettings({ milestonesHidden: false })}
          testID="weight-milestones-show"
        >
          <Text className="text-text-secondary text-xs">
            {t('weightProgress.showMilestones', {
              defaultValue: 'Show milestones',
            })}
          </Text>
        </Pressable>
      ) : null}

      {energy && expenditureKcal !== null ? (
        <View className="mt-4" testID="weight-fat-estimate">
          <Text className="text-text-primary text-sm font-semibold mb-1">
            {t('weightProgress.energyTitle', {
              defaultValue: 'From your food log (estimate)',
            })}
          </Text>
          {energy.enough ? (
            <>
              <View className="flex-row flex-wrap -m-1">
                <Stat
                  testID="weight-fat-estimated"
                  label={
                    energy.estimatedFatKg >= 0
                      ? t('weightProgress.fatLost', {
                          defaultValue: 'Estimated fat lost',
                        })
                      : t('weightProgress.fatGained', {
                          defaultValue: 'Estimated fat gained',
                        })
                  }
                  value={`~${weight(Math.abs(energy.estimatedFatKg))}`}
                />
                <Stat
                  testID="weight-fat-actual"
                  label={t('weightProgress.actualChange', {
                    defaultValue: 'Trend change, same days',
                  })}
                  value={
                    energy.actualChangeKg === null
                      ? '-'
                      : signedWeightText(energy.actualChangeKg, weightMode)
                  }
                />
              </View>
              <Text className="text-text-muted text-xs mt-1">
                {t('weightProgress.energyNote', {
                  defaultValue:
                    'An estimate, not a measurement: {{days}} days with food logged between {{from}} and {{to}}, against an estimated expenditure of {{expenditure}} a day. Days without a food log are left out. Scale weight also moves with water and glycogen.',
                  days: energy.loggedDays,
                  from: date(energy.from),
                  to: date(energy.to),
                  expenditure: formatEnergy(expenditureKcal, energyUnit, t),
                })}
              </Text>
            </>
          ) : (
            <Text className="text-text-muted text-xs">
              {t('weightProgress.energyNotEnough', {
                defaultValue:
                  'Log food on at least 7 days to see this estimate ({{days}} so far since {{from}}).',
                days: energy.loggedDays,
                from: date(energy.from),
              })}
            </Text>
          )}
        </View>
      ) : null}
    </View>
  );
};

export default WeightProgressCard;
