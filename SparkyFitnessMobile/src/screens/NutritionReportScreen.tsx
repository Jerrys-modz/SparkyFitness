import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useScreenHeader } from '../hooks/useScreenHeader';
import { useNutritionReport } from '../hooks/useNutritionReport';
import { formatLocalizedNumber } from '../localization';
import { NUTRIENT_META, getNutrientLabel } from '../constants/nutrients';
import ReportScreenLayout from '../components/reports/ReportScreenLayout';
import ReportSummaryCard from '../components/reports/ReportSummaryCard';
import ReportHighlights, {
  type ReportHighlight,
} from '../components/reports/ReportHighlights';
import { useReportCustomization } from '../hooks/useReportCustomization';
import MacroSplitBar from '../components/reports/MacroSplitBar';
import CaloriesBarChart from '../components/CaloriesBarChart';
import StatusView from '../components/StatusView';
import Icon from '../components/Icon';
import { formatTooltipDate } from '../components/charts/chartFormatting';
import { average } from '../utils/mathUtils';
import { percentChange } from '../utils/nutritionReport';
import { TREND_RANGE_DAYS } from '../utils/trendRange';
import type { RootStackScreenProps } from '../types/navigation';

type NutritionReportScreenProps = RootStackScreenProps<'NutritionReport'>;

const NutritionReportScreen: React.FC<NutritionReportScreenProps> = ({
  navigation,
}) => {
  const { t } = useTranslation();
  const { range, setRange, isSectionShown } = useReportCustomization();
  const { report, isLoading, isError } = useNutritionReport({ range });
  const days = TREND_RANGE_DAYS[range];

  const header = useScreenHeader({
    title: t('nutritionReport.title', { defaultValue: 'Nutrition' }),
    left: { kind: 'back' },
  });

  const fmt = (value: number, digits = 0) =>
    formatLocalizedNumber(value, { maximumFractionDigits: digits });
  const kcal = (value: number) =>
    t('nutritionReport.kcal', {
      defaultValue: '{{value}} kcal',
      value: fmt(Math.round(value)),
    });
  const grams = (value: number) =>
    t('nutritionReport.grams', {
      defaultValue: '{{value}} g',
      value: fmt(Math.round(value)),
    });

  const insights = report?.insights ?? null;
  const averageCalories = useMemo(
    () => average(report?.series.map((point) => point.calories) ?? []),
    [report]
  );

  if (isLoading || isError) {
    return (
      <ReportScreenLayout
        header={header}
        range={range}
        onRangeChange={setRange}
      >
        <StatusView
          loading={isLoading}
          icon="chart-bar"
          iconTone="muted"
          inline
          title={
            isError
              ? t('nutritionReport.loadFailed', {
                  defaultValue: 'Failed to load nutrition data',
                })
              : undefined
          }
        />
      </ReportScreenLayout>
    );
  }

  const change = percentChange(
    insights?.averages?.calories ?? null,
    insights?.previousAverageCalories ?? null
  );
  const changeHint =
    change === null
      ? undefined
      : t('nutritionReport.changeHint', {
          defaultValue: '{{change}} vs previous {{days}} days',
          change: `${change > 0 ? '+' : ''}${formatLocalizedNumber(change)}%`,
          days,
        });

  const goal = insights?.goal;
  const goalRows =
    goal && goal.daysWithGoal > 0
      ? [
          {
            label: t('nutritionReport.onTarget', {
              defaultValue: 'Within 10% of goal',
            }),
            value: t('nutritionReport.daysOfLogged', {
              defaultValue: '{{onTarget}} of {{total}} days',
              onTarget: goal.onTarget,
              total: goal.daysWithGoal,
            }),
            testID: 'nutrition-goal-on-target',
          },
          {
            label: t('nutritionReport.overGoal', {
              defaultValue: 'Over goal',
            }),
            value: t('nutritionReport.daysCount', {
              defaultValue: '{{count}} days',
              count: goal.over,
            }),
            testID: 'nutrition-goal-over',
          },
          {
            label: t('nutritionReport.underGoal', {
              defaultValue: 'Under goal',
            }),
            value: t('nutritionReport.daysCount', {
              defaultValue: '{{count}} days',
              count: goal.under,
            }),
            testID: 'nutrition-goal-under',
          },
          {
            label: t('nutritionReport.averageVsGoal', {
              defaultValue: 'Average vs goal',
            }),
            value: `${(goal.averageDifference ?? 0) > 0 ? '+' : ''}${kcal(
              goal.averageDifference ?? 0
            )}`,
            testID: 'nutrition-goal-difference',
          },
        ]
      : [];

  const dayRow = (
    label: string,
    extreme: { day: string; calories: number } | null,
    testID: string
  ) =>
    extreme
      ? [
          {
            label,
            value: kcal(extreme.calories),
            hint: formatTooltipDate(extreme.day),
            testID,
          },
        ]
      : [];

  const signedPercent = (value: number) =>
    `${value > 0 ? '+' : ''}${formatLocalizedNumber(value)}%`;
  const highlights: ReportHighlight[] =
    insights && insights.loggedDays > 0 && insights.averages
      ? [
          {
            label: t('nutritionReport.avgCalories', {
              defaultValue: 'Avg calories',
            }),
            value: kcal(insights.averages.calories),
            change: change === null ? undefined : signedPercent(change),
            changeTone: 'neutral',
            testID: 'nutrition-highlight-calories',
          },
          {
            label: t('nutritionReport.avgProtein', {
              defaultValue: 'Avg protein',
            }),
            value: grams(insights.averages.protein),
            testID: 'nutrition-highlight-protein',
          },
          ...(goal && goal.daysWithGoal > 0
            ? [
                {
                  label: t('nutritionReport.onTargetShort', {
                    defaultValue: 'Days on target',
                  }),
                  value: t('nutritionReport.onTargetValue', {
                    defaultValue: '{{onTarget}}/{{total}}',
                    onTarget: goal.onTarget,
                    total: goal.daysWithGoal,
                  }),
                  testID: 'nutrition-highlight-on-target',
                },
              ]
            : []),
          {
            label: t('nutritionReport.daysLogged', {
              defaultValue: 'Days logged',
            }),
            value: t('nutritionReport.daysOfWindow', {
              defaultValue: '{{logged}} of {{total}}',
              logged: insights.loggedDays,
              total: days,
            }),
            testID: 'nutrition-highlight-days',
          },
        ]
      : [];

  return (
    <ReportScreenLayout header={header} range={range} onRangeChange={setRange}>
      {isSectionShown('nutrition.overview') ? (
        <ReportHighlights items={highlights} />
      ) : null}
      {isSectionShown('nutrition.chart') ? (
        <CaloriesBarChart
          data={report?.series ?? []}
          isLoading={false}
          isError={false}
          range={range}
          averageCalories={averageCalories}
          goals={report?.goals}
        />
      ) : null}
      {insights && insights.loggedDays > 0 && insights.averages ? (
        <>
          {isSectionShown('nutrition.averages') ? (
            <ReportSummaryCard
              title={t('nutritionReport.dailyAverages', {
                defaultValue: 'Daily averages',
              })}
              rows={[
                {
                  label: t('nutritionReport.calories', {
                    defaultValue: 'Calories',
                  }),
                  value: kcal(insights.averages.calories),
                  hint: changeHint,
                  testID: 'nutrition-average-calories',
                },
                {
                  label: getNutrientLabel(t, 'protein'),
                  value: grams(insights.averages.protein),
                  testID: 'nutrition-average-protein',
                },
                {
                  label: getNutrientLabel(t, 'carbs'),
                  value: grams(insights.averages.carbs),
                  testID: 'nutrition-average-carbs',
                },
                {
                  label: getNutrientLabel(t, 'fat'),
                  value: grams(insights.averages.fat),
                  testID: 'nutrition-average-fat',
                },
                {
                  label: t('nutritionReport.daysLogged', {
                    defaultValue: 'Days logged',
                  }),
                  value: t('nutritionReport.daysOfWindow', {
                    defaultValue: '{{logged}} of {{total}}',
                    logged: insights.loggedDays,
                    total: days,
                  }),
                  testID: 'nutrition-days-logged',
                },
              ]}
            />
          ) : null}
          {isSectionShown('nutrition.macroSplit') && insights.macroSplit ? (
            <View className="bg-surface rounded-xl p-4 my-2 shadow-sm">
              <Text className="text-text-primary text-lg font-semibold mb-3">
                {t('nutritionReport.macroSplit', {
                  defaultValue: 'Where your calories come from',
                })}
              </Text>
              <MacroSplitBar
                split={insights.macroSplit}
                labels={{
                  protein: getNutrientLabel(t, 'protein'),
                  carbs: getNutrientLabel(t, 'carbs'),
                  fat: getNutrientLabel(t, 'fat'),
                }}
              />
            </View>
          ) : null}
          {isSectionShown('nutrition.goal') && goalRows.length > 0 ? (
            <ReportSummaryCard
              title={t('nutritionReport.goalAdherence', {
                defaultValue: 'Calorie goal',
              })}
              rows={goalRows}
            />
          ) : null}
          {isSectionShown('nutrition.highlights') && insights.highest ? (
            <ReportSummaryCard
              title={t('nutritionReport.highlights', {
                defaultValue: 'Highlights',
              })}
              rows={[
                ...dayRow(
                  t('nutritionReport.highestDay', {
                    defaultValue: 'Highest day',
                  }),
                  insights.highest,
                  'nutrition-highest-day'
                ),
                ...dayRow(
                  t('nutritionReport.lowestDay', {
                    defaultValue: 'Lowest logged day',
                  }),
                  insights.lowest,
                  'nutrition-lowest-day'
                ),
              ]}
            />
          ) : null}
          {isSectionShown('nutrition.otherNutrients') &&
          insights.extras.length > 0 ? (
            <ReportSummaryCard
              title={t('nutritionReport.otherNutrients', {
                defaultValue: 'Other daily averages',
              })}
              rows={insights.extras.map((extra) => ({
                label: getNutrientLabel(t, extra.key),
                value: `${fmt(extra.average, extra.average < 10 ? 1 : 0)} ${
                  NUTRIENT_META[extra.key]?.unit ?? ''
                }`.trim(),
                testID: `nutrition-extra-${extra.key}`,
              }))}
            />
          ) : null}
          {isSectionShown('nutrition.trends') ? (
            <View className="bg-surface rounded-xl my-2 shadow-sm overflow-hidden">
              <Text className="text-text-primary text-lg font-semibold p-4 pb-2">
                {t('nutritionReport.trendsByNutrient', {
                  defaultValue: 'Trend by nutrient',
                })}
              </Text>
              {(['protein', 'carbs', 'fat'] as const).map((key) => (
                <Pressable
                  key={key}
                  testID={`nutrition-trend-${key}`}
                  className="px-4 py-3 flex-row items-center justify-between border-t border-border-subtle"
                  onPress={() =>
                    navigation.navigate('NutrientTrends', {
                      nutrientKey: key,
                      nutrientLabel: getNutrientLabel(t, key),
                      unit: 'g',
                    })
                  }
                  style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
                >
                  <Text className="text-text-primary text-base">
                    {getNutrientLabel(t, key)}
                  </Text>
                  <Icon name="chevron-forward" size={20} color="#999" />
                </Pressable>
              ))}
            </View>
          ) : null}
        </>
      ) : (
        <StatusView
          icon="chart-bar"
          iconTone="muted"
          inline
          title={t('nutritionReport.empty', {
            defaultValue: 'No food logged in this period',
          })}
        />
      )}
    </ReportScreenLayout>
  );
};

export default NutritionReportScreen;
