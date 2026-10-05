import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useScreenHeader } from '../hooks/useScreenHeader';
import { useNutritionTrends } from '../hooks/useNutritionTrends';
import { formatLocalizedNumber } from '../localization';
import ReportScreenLayout from '../components/reports/ReportScreenLayout';
import ReportSummaryCard from '../components/reports/ReportSummaryCard';
import NutrientBarChart from '../components/NutrientBarChart';
import Icon from '../components/Icon';
import type { TrendRange } from '../utils/trendRange';
import type { RootStackScreenProps } from '../types/navigation';

type NutritionReportScreenProps = RootStackScreenProps<'NutritionReport'>;

type NutrientConfig = {
  key: 'calories' | 'protein' | 'carbs' | 'fat';
  label: string;
  unit: string;
};

const NutritionReportScreen: React.FC<NutritionReportScreenProps> = ({
  navigation,
}) => {
  const { t } = useTranslation();
  const [range, setRange] = useState<TrendRange>('30d');
  const { data, isLoading, isError } = useNutritionTrends({ range });

  const header = useScreenHeader({
    title: t('nutritionReport.title', { defaultValue: 'Nutrition' }),
    left: { kind: 'back' },
  });

  const nutrients = useMemo<NutrientConfig[]>(
    () => [
      {
        key: 'calories',
        label: t('nutritionReport.calories', { defaultValue: 'Calories' }),
        unit: ' kcal',
      },
      {
        key: 'protein',
        label: t('nutritionReport.protein', { defaultValue: 'Protein' }),
        unit: 'g',
      },
      {
        key: 'carbs',
        label: t('nutritionReport.carbs', { defaultValue: 'Carbs' }),
        unit: 'g',
      },
      {
        key: 'fat',
        label: t('nutritionReport.fat', { defaultValue: 'Fat' }),
        unit: 'g',
      },
    ],
    [t]
  );

  const calorieSeries = useMemo(
    () => data.map((point) => ({ day: point.date, value: point.calories })),
    [data]
  );

  // Days with nothing logged are zero-filled by the hook; averaging them in would read
  // an unlogged day as a fast, so the average covers logged days only.
  const { averages, loggedDays } = useMemo(() => {
    const logged = data.filter((point) => point.calories > 0);
    const mean = (key: NutrientConfig['key']) =>
      logged.length === 0
        ? null
        : logged.reduce((sum, point) => sum + point[key], 0) / logged.length;
    return {
      loggedDays: logged.length,
      averages: {
        calories: mean('calories'),
        protein: mean('protein'),
        carbs: mean('carbs'),
        fat: mean('fat'),
      },
    };
  }, [data]);

  const summaryRows = [
    ...nutrients.map((nutrient) => ({
      label: nutrient.label,
      value:
        averages[nutrient.key] === null
          ? '-'
          : `${formatLocalizedNumber(Math.round(averages[nutrient.key] ?? 0))}${nutrient.unit}`,
      testID: `nutrition-average-${nutrient.key}`,
    })),
    {
      label: t('nutritionReport.daysLogged', { defaultValue: 'Days logged' }),
      value: formatLocalizedNumber(loggedDays),
      testID: 'nutrition-days-logged',
    },
  ];

  return (
    <ReportScreenLayout header={header} range={range} onRangeChange={setRange}>
      <NutrientBarChart
        data={calorieSeries}
        isLoading={isLoading}
        isError={isError}
        range={range}
        nutrientLabel={nutrients[0].label}
        unit=" kcal"
      />
      {!isLoading && !isError ? (
        <ReportSummaryCard
          title={t('nutritionReport.dailyAverages', {
            defaultValue: 'Daily averages',
          })}
          rows={summaryRows}
        />
      ) : null}
      <View className="bg-surface rounded-xl my-2 shadow-sm overflow-hidden">
        <Text className="text-text-primary text-lg font-semibold p-4 pb-2">
          {t('nutritionReport.trendsByNutrient', {
            defaultValue: 'Trend by nutrient',
          })}
        </Text>
        {nutrients.slice(1).map((nutrient) => (
          <Pressable
            key={nutrient.key}
            testID={`nutrition-trend-${nutrient.key}`}
            className="px-4 py-3 flex-row items-center justify-between border-t border-border-subtle"
            onPress={() =>
              navigation.navigate('NutrientTrends', {
                nutrientKey: nutrient.key,
                nutrientLabel: nutrient.label,
                unit: nutrient.unit,
              })
            }
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
          >
            <Text className="text-text-primary text-base">
              {nutrient.label}
            </Text>
            <Icon name="chevron-forward" size={20} color="#999" />
          </Pressable>
        ))}
      </View>
    </ReportScreenLayout>
  );
};

export default NutritionReportScreen;
