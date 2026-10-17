import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TFunction } from 'i18next';
import {
  COACHING_GOAL_DIRECTIONS,
  coachingDataNotes,
  type CoachingCheckInResponse,
  type CoachingDataNote,
  type CoachingGoalDirection,
  type CoachingLimit,
  type CoachingReason,
} from '@workspace/shared';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useCoachingCheckIn } from '@/hooks/Reports/useReports';
import {
  useAcceptCoachingCheckInMutation,
  useSaveCoachingSettingsMutation,
} from '@/hooks/Goals/useGoals';

interface CoachingCheckInCardProps {
  userId?: string | null;
  /** Viewing someone else's report: nothing here may change their goals. */
  readOnly?: boolean;
}

const KG_PER_LB = 0.45359237;
const RATE_OPTIONS = {
  kg: [0.1, 0.25, 0.5, 0.75, 1],
  lbs: [0.25, 0.5, 1, 1.5, 2],
} as const;

const reasonTitle = (t: TFunction, reason: CoachingReason): string => {
  switch (reason) {
    case 'insufficient-data':
      return t('coaching.reason.insufficientData.title', 'Not enough data yet');
    case 'low-adherence':
      return t(
        'coaching.reason.lowAdherence.title',
        'Too many unlogged days to judge'
      );
    case 'implausible-estimate':
      return t('coaching.reason.implausible.title', 'The estimate looks off');
    case 'on-track':
      return t('coaching.reason.onTrack.title', 'On track');
    case 'behind':
      return t('coaching.reason.behind.title', 'Behind your goal');
    case 'ahead':
      return t('coaching.reason.ahead.title', 'Ahead of your goal');
    case 'drifting':
      return t('coaching.reason.drifting.title', 'Weight is drifting');
    case 'off-target-intake':
      return t('coaching.reason.offTarget.title', 'Not eating to your target');
  }
};

const reasonBody = (
  t: TFunction,
  reason: CoachingReason,
  direction: CoachingGoalDirection
): string => {
  switch (reason) {
    case 'insufficient-data':
      return t(
        'coaching.reason.insufficientData.body',
        'A check-in needs a few weeks of weigh-ins and logged meals. Keep logging and it will appear here.'
      );
    case 'low-adherence':
      return t(
        'coaching.reason.lowAdherence.body',
        'Several recent days have no food logged, so what you ate cannot be compared with your weight reliably. Log most days and check again.'
      );
    case 'implausible-estimate':
      return t(
        'coaching.reason.implausible.body',
        'The numbers imply an energy use that does not look realistic, usually from missing food logs or a stray weigh-in. Nothing was changed.'
      );
    case 'on-track':
      return t(
        'coaching.reason.onTrack.body',
        'Your weight is moving at about the rate you asked for. Your targets stay as they are.'
      );
    case 'behind':
      if (direction === 'lose') {
        return t(
          'coaching.reason.behind.bodyLose',
          'Your weight is dropping more slowly than your goal rate, so a lower calorie target is suggested.'
        );
      }
      if (direction === 'gain') {
        return t(
          'coaching.reason.behind.bodyGain',
          'Your weight is rising more slowly than your goal rate, so a higher calorie target is suggested.'
        );
      }
      return t(
        'coaching.reason.behind.bodyMaintain',
        'Your weight is drifting away from steady, so a small adjustment is suggested.'
      );
    case 'ahead':
      if (direction === 'gain') {
        return t(
          'coaching.reason.ahead.bodyGain',
          'You are gaining faster than your goal rate. A slightly lower target keeps the gain steady.'
        );
      }
      return t(
        'coaching.reason.ahead.bodyLose',
        'You are losing faster than your goal rate. A slightly higher target keeps the pace sustainable.'
      );
    case 'drifting':
      return t(
        'coaching.reason.drifting.body',
        'Your weight is moving while you aim to hold steady. A small change to your calorie target is suggested.'
      );
    case 'off-target-intake':
      return t(
        'coaching.reason.offTarget.body',
        'Your calorie target already fits your estimated energy use, but your weight is not moving at your goal rate, so you have likely been eating more or less than the target. Nothing was changed.'
      );
  }
};

const directionLabel = (
  t: TFunction,
  direction: CoachingGoalDirection
): string => {
  switch (direction) {
    case 'lose':
      return t('coaching.direction.lose', 'Lose');
    case 'gain':
      return t('coaching.direction.gain', 'Gain');
    case 'maintain':
      return t('coaching.direction.maintain', 'Maintain');
  }
};

const limitText = (t: TFunction, limit: CoachingLimit): string => {
  switch (limit) {
    case 'weekly-cap':
      return t(
        'coaching.limit.weeklyCap',
        'Limited to a 10% change this week; a further change may follow next week.'
      );
    case 'safety-floor':
      return t(
        'coaching.limit.safetyFloor',
        'Held at your minimum safe calorie level.'
      );
    case 'uncertain-estimate':
      return t(
        'coaching.limit.uncertain',
        'The estimate is still uncertain, so only part of the change is suggested.'
      );
  }
};

const noteText = (t: TFunction, note: CoachingDataNote): string => {
  switch (note.kind) {
    case 'logDays':
      return t('coaching.note.logDays', {
        count: note.count,
        defaultValue_one: 'Log {{count}} more day for a reliable estimate',
        defaultValue_other: 'Log {{count}} more days for a reliable estimate',
      });
    case 'weighIns':
      return t('coaching.note.weighIns', {
        count: note.count,
        defaultValue_one: 'Weigh in {{count}} more time',
        defaultValue_other: 'Weigh in {{count}} more times',
      });
    case 'weighSpan':
      return t('coaching.note.weighSpan', {
        count: note.count,
        defaultValue_one:
          'Keep weighing in for {{count}} more day to cover two weeks',
        defaultValue_other:
          'Keep weighing in for {{count}} more days to cover two weeks',
      });
    case 'lowAdherence':
      return t('coaching.note.lowAdherence', {
        percent: note.percent,
        defaultValue: 'Only {{percent}}% of recent days have food logged',
      });
    case 'excludedDays':
      return t('coaching.note.excludedDays', {
        count: note.count,
        defaultValue_one:
          '{{count}} day left out because little food was logged',
        defaultValue_other:
          '{{count}} days left out because little food was logged',
      });
    case 'outliers':
      return t('coaching.note.outliers', {
        count: note.count,
        defaultValue_one:
          '{{count}} weigh-in ignored as out of line with your trend',
        defaultValue_other:
          '{{count}} weigh-ins ignored as out of line with your trend',
      });
  }
};

const Targets = ({
  label,
  targets,
  emphasised,
}: {
  label: string;
  targets: CoachingCheckInResponse['current'];
  emphasised: boolean;
}) => {
  const { t } = useTranslation();
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={
          emphasised ? 'text-xl font-bold' : 'text-xl text-muted-foreground'
        }
      >
        {t('coaching.kcal', {
          value: Math.round(targets.calories).toLocaleString(),
          defaultValue: '{{value}} kcal',
        })}
      </div>
      <div className="text-xs text-muted-foreground mt-1">
        {t('coaching.macros', {
          protein: Math.round(targets.protein),
          carbs: Math.round(targets.carbs),
          fat: Math.round(targets.fat),
          defaultValue: 'P {{protein}} g · C {{carbs}} g · F {{fat}} g',
        })}
      </div>
    </div>
  );
};

/**
 * The weekly check-in: weight trend against logged weigh-ins, estimated
 * expenditure with its uncertainty, today's targets next to the suggested ones,
 * and what is missing when there is not enough data. Everything is an estimate;
 * nothing changes until the person accepts.
 */
const CoachingCheckInCard = ({
  userId,
  readOnly,
}: CoachingCheckInCardProps) => {
  const { t } = useTranslation();
  const { weightUnit } = usePreferences();
  const { data, isLoading, isError } = useCoachingCheckIn(userId);
  const accept = useAcceptCoachingCheckInMutation();
  const saveSettings = useSaveCoachingSettingsMutation();

  const displayUnit: 'kg' | 'lbs' = weightUnit === 'kg' ? 'kg' : 'lbs';
  const toDisplay = (kg: number) =>
    displayUnit === 'kg' ? kg : kg / KG_PER_LB;

  const chartData = useMemo(
    () =>
      (data?.trend.series ?? []).map((p) => ({
        date: p.date,
        trend: p.outlier
          ? undefined
          : Number(
              (displayUnit === 'kg'
                ? p.trendKg
                : p.trendKg / KG_PER_LB
              ).toFixed(2)
            ),
        weight: p.outlier
          ? undefined
          : Number(
              (displayUnit === 'kg'
                ? p.weightKg
                : p.weightKg / KG_PER_LB
              ).toFixed(2)
            ),
        ignored: p.outlier
          ? Number(
              (displayUnit === 'kg'
                ? p.weightKg
                : p.weightKg / KG_PER_LB
              ).toFixed(2)
            )
          : undefined,
      })),
    [data, displayUnit]
  );

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    );
  }
  if (isError || !data) return null;

  const notes = coachingDataNotes(data.dataQuality, data.reason);
  const canEdit = !readOnly;
  const weekdayNames = Array.from({ length: 7 }, (_, i) =>
    // 2024-01-07 was a Sunday.
    new Date(2024, 0, 7 + i).toLocaleDateString(undefined, { weekday: 'short' })
  );
  const rate = data.trend.weeklyRateKg;

  return (
    <Card data-testid="coaching-check-in-card">
      <CardHeader>
        <CardTitle>{t('coaching.title', 'Weekly Coaching')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <div className="text-lg font-semibold">
            {reasonTitle(t, data.reason)}
          </div>
          <p className="text-sm text-muted-foreground">
            {reasonBody(t, data.reason, data.goal.direction)}
          </p>
        </div>

        {chartData.length > 0 && (
          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase mb-2">
              {t('coaching.trend.title', "This week's trend")}
            </div>
            <div className="h-48 min-w-0">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <ComposedChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" fontSize={10} />
                  <YAxis domain={['auto', 'auto']} fontSize={10} width={40} />
                  <Tooltip />
                  <Scatter
                    dataKey="weight"
                    name={t('coaching.trend.logged', 'Logged weight')}
                    fill="hsl(var(--muted-foreground))"
                  />
                  <Scatter
                    dataKey="ignored"
                    name={t('coaching.trend.ignored', 'Ignored weigh-in')}
                    fill="transparent"
                    stroke="hsl(var(--muted-foreground))"
                  />
                  <Line
                    dataKey="trend"
                    name={t('coaching.trend.current', 'Trend weight')}
                    type="monotone"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2.5}
                    dot={false}
                    connectNulls
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="flex justify-between text-sm mt-2">
              <span>
                {t('coaching.trend.current', 'Trend weight')}:{' '}
                <strong>
                  {data.trend.currentKg === null
                    ? '—'
                    : `${toDisplay(data.trend.currentKg).toFixed(1)} ${displayUnit}`}
                </strong>
              </span>
              <span>
                {t('coaching.trend.rate', 'Change per week')}:{' '}
                <strong>
                  {rate === null
                    ? '—'
                    : `${rate > 0 ? '+' : ''}${toDisplay(rate).toFixed(2)} ${displayUnit}`}
                </strong>
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t(
                'coaching.trend.legend',
                'Dots are your weigh-ins and the line is the smoothed trend. Hollow dots were ignored as out of line.'
              )}
            </p>
          </div>
        )}

        <div>
          <div className="text-xs font-medium text-muted-foreground uppercase mb-1">
            {t('coaching.expenditure.title', 'Estimated expenditure')}
          </div>
          {data.expenditure.kcal === null ? (
            <p className="text-sm text-muted-foreground">
              {t(
                'coaching.expenditure.none',
                'Not enough data to estimate yet.'
              )}
            </p>
          ) : (
            <>
              <div className="text-2xl font-bold">
                {t('coaching.expenditure.value', {
                  kcal: Math.round(data.expenditure.kcal).toLocaleString(),
                  defaultValue: '{{kcal}} kcal a day',
                })}
              </div>
              {data.expenditure.marginKcal !== null && (
                <p className="text-sm text-muted-foreground">
                  {t('coaching.expenditure.margin', {
                    margin: Math.round(
                      data.expenditure.marginKcal
                    ).toLocaleString(),
                    defaultValue:
                      'Give or take about {{margin}} kcal from weigh-in noise alone',
                  })}
                </p>
              )}
              {data.expenditure.avgIntakeKcal !== null && (
                <p className="text-sm text-muted-foreground">
                  {t('coaching.expenditure.intake', {
                    kcal: Math.round(
                      data.expenditure.avgIntakeKcal
                    ).toLocaleString(),
                    defaultValue:
                      'Based on an average of {{kcal}} kcal on the days you logged food, so it reads low if some food goes unlogged',
                  })}
                </p>
              )}
            </>
          )}
        </div>

        <div>
          <div className="text-xs font-medium text-muted-foreground uppercase mb-2">
            {t('coaching.targets.title', 'Daily targets')}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Targets
              label={t('coaching.targets.now', 'Now')}
              targets={data.current}
              emphasised={!data.suggested}
            />
            {data.suggested && (
              <Targets
                label={t('coaching.targets.suggested', 'Suggested')}
                targets={data.suggested}
                emphasised
              />
            )}
          </div>
          {data.suggested && (
            <div className="mt-3 space-y-1">
              <p className="text-sm text-muted-foreground">
                {t('coaching.targets.change', {
                  change: `${data.changeKcal > 0 ? '+' : ''}${Math.round(
                    data.changeKcal
                  ).toLocaleString()}`,
                  defaultValue:
                    'A change of {{change}} kcal a day, starting today.',
                })}
              </p>
              {data.limits.map((limit) => (
                <p key={limit} className="text-xs text-muted-foreground">
                  {limitText(t, limit)}
                </p>
              ))}
              {data.proteinFloorApplied && (
                <p className="text-xs text-muted-foreground">
                  {t(
                    'coaching.limit.proteinFloor',
                    'Protein is kept up and carbs and fat take the reduction.'
                  )}
                </p>
              )}
              {data.goalManagedBySettings ? (
                <p className="text-sm text-amber-600">
                  {t(
                    'coaching.managedBySettings',
                    'Your calorie target is set by Calorie Settings (adaptive or goal mode), so it cannot be changed here. Switch to a fixed target to use coaching.'
                  )}
                </p>
              ) : (
                canEdit && (
                  <div className="pt-2">
                    <Button
                      onClick={() => accept.mutate(data.suggested!.calories)}
                      disabled={accept.isPending}
                    >
                      {t('coaching.accept', 'Accept')}
                    </Button>
                  </div>
                )
              )}
            </div>
          )}
        </div>

        {notes.length > 0 && (
          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase mb-1">
              {t('coaching.dataQuality.title', 'Data quality')}
            </div>
            <ul className="text-sm space-y-1">
              {notes.map((note) => (
                <li key={note.kind}>{noteText(t, note)}</li>
              ))}
            </ul>
          </div>
        )}

        {canEdit && (
          <div className="space-y-3">
            <div className="text-xs font-medium text-muted-foreground uppercase">
              {t('coaching.goal.title', 'Your goal')}
            </div>
            <div className="flex flex-wrap gap-2">
              {COACHING_GOAL_DIRECTIONS.map((direction) => (
                <Button
                  key={direction}
                  size="sm"
                  variant={
                    data.settings.direction === direction
                      ? 'default'
                      : 'outline'
                  }
                  disabled={saveSettings.isPending}
                  onClick={() => saveSettings.mutate({ direction })}
                >
                  {directionLabel(t, direction)}
                </Button>
              ))}
            </div>
            {data.settings.direction !== 'maintain' && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">
                  {t('coaching.goal.rate', 'Rate per week')}
                </div>
                <div className="flex flex-wrap gap-2">
                  {RATE_OPTIONS[displayUnit].map((option) => {
                    const kg =
                      displayUnit === 'kg' ? option : option * KG_PER_LB;
                    return (
                      <Button
                        key={option}
                        size="sm"
                        variant={
                          Math.abs(data.settings.rateKgPerWeek - kg) < 0.02
                            ? 'default'
                            : 'outline'
                        }
                        disabled={saveSettings.isPending}
                        onClick={() =>
                          saveSettings.mutate({
                            rateKgPerWeek: Math.round(kg * 100) / 100,
                          })
                        }
                      >
                        {option} {displayUnit}
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}
            <div>
              <div className="text-xs text-muted-foreground mb-1">
                {t('coaching.goal.checkInDay', 'Weekly check-in day')}
              </div>
              <div className="flex flex-wrap gap-2">
                {weekdayNames.map((name, weekday) => (
                  <Button
                    key={weekday}
                    size="sm"
                    variant={
                      data.settings.checkInWeekday === weekday
                        ? 'default'
                        : 'outline'
                    }
                    disabled={saveSettings.isPending}
                    onClick={() =>
                      saveSettings.mutate({ checkInWeekday: weekday })
                    }
                  >
                    {name}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          {t(
            'coaching.disclaimer',
            'These are estimates from your logged food and weigh-ins, not medical advice. Missing or inaccurate logs make them less reliable. Nothing changes until you accept.'
          )}
        </p>
      </CardContent>
    </Card>
  );
};

export default CoachingCheckInCard;
