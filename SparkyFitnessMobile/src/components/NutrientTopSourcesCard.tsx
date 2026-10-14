import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';

import { formatLocalizedNumber } from '../localization';
import { MEAL_CONFIG, getLocalizedMealLabel } from '../constants/meals';
import { buildTopSources, mealTypesInEntries } from '../utils/nutrientSources';
import type { FoodEntry } from '../types/foodEntries';

type NutrientTopSourcesCardProps = {
  entries: FoodEntry[];
  isLoading: boolean;
  isError: boolean;
  nutrientKey: string;
  nutrientLabel: string;
  unit: string;
  /** `YYYY-MM-DD` day picked on the chart, or null for the whole range. */
  selectedDay: string | null;
  /** Localized label for `selectedDay`. */
  selectedDayLabel: string;
  onClearDay: () => void;
};

const formatAmount = (value: number) =>
  formatLocalizedNumber(value, {
    maximumFractionDigits: value % 1 !== 0 ? 1 : 0,
  });

const NutrientTopSourcesCard: React.FC<NutrientTopSourcesCardProps> = ({
  entries,
  isLoading,
  isError,
  nutrientKey,
  nutrientLabel,
  unit,
  selectedDay,
  selectedDayLabel,
  onClearDay,
}) => {
  const { t } = useTranslation();
  const [mealType, setMealType] = useState<string | null>(null);

  const mealTypes = useMemo(() => mealTypesInEntries(entries), [entries]);
  // A meal type that has dropped out of the range (e.g. after a range switch) is no filter.
  const activeMealType =
    mealType && mealTypes.includes(mealType) ? mealType : null;

  const { sources } = useMemo(
    () =>
      buildTopSources(entries, nutrientKey, {
        day: selectedDay,
        mealType: activeMealType,
      }),
    [entries, nutrientKey, selectedDay, activeMealType]
  );

  const mealLabel = (name: string) =>
    MEAL_CONFIG[name.toLowerCase()]
      ? getLocalizedMealLabel(t, name.toLowerCase())
      : name;

  return (
    <View className="bg-surface rounded-xl p-4 mt-4 shadow-sm">
      <View className="flex-row justify-between items-center mb-3">
        <Text className="text-text-primary text-base font-bold">
          {t('nutrientTrends.topSources.title', {
            defaultValue: 'Top Sources',
          })}
        </Text>
        {selectedDay ? (
          <TouchableOpacity
            onPress={onClearDay}
            accessibilityRole="button"
            accessibilityLabel={t('nutrientTrends.topSources.clearDay', {
              defaultValue: 'Show whole period',
            })}
            testID="top-sources-clear-day"
          >
            <Text className="text-accent-primary text-sm font-semibold">
              {selectedDayLabel} ✕
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {mealTypes.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="mb-3"
        >
          {[null, ...mealTypes].map((name) => {
            const active = name === activeMealType;
            return (
              <TouchableOpacity
                key={name ?? 'all'}
                onPress={() => setMealType(name)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                testID={`top-sources-meal-${name ?? 'all'}`}
                className={`px-3 py-1.5 rounded-full mr-2 ${
                  active ? 'bg-accent-primary' : 'bg-background'
                }`}
              >
                <Text
                  className={`text-xs font-semibold ${
                    active ? 'text-white' : 'text-text-secondary'
                  }`}
                >
                  {name
                    ? mealLabel(name)
                    : t('nutrientTrends.topSources.allMeals', {
                        defaultValue: 'All meals',
                      })}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : null}

      {isLoading ? (
        <Text className="text-text-muted text-sm">
          {t('common.loading', { defaultValue: 'Loading...' })}
        </Text>
      ) : isError ? (
        <Text className="text-text-muted text-sm">
          {t('nutrientTrends.topSources.loadFailed', {
            defaultValue: 'Failed to load food sources',
          })}
        </Text>
      ) : sources.length === 0 ? (
        <Text className="text-text-muted text-sm">
          {t('nutrientTrends.topSources.empty', {
            defaultValue: 'No {{nutrient}} logged for this selection',
            nutrient: nutrientLabel,
          })}
        </Text>
      ) : (
        sources.map((source, index) => (
          <View
            key={source.key}
            className={`py-2 ${
              index < sources.length - 1 ? 'border-b border-border-subtle' : ''
            }`}
            testID={`top-source-${index}`}
          >
            <View className="flex-row justify-between items-baseline">
              <View className="flex-1 mr-3">
                <Text
                  className="text-text-primary text-sm font-semibold"
                  numberOfLines={1}
                >
                  {source.name}
                </Text>
                {source.brand ? (
                  <Text className="text-text-muted text-xs" numberOfLines={1}>
                    {source.brand}
                  </Text>
                ) : null}
              </View>
              <Text className="text-text-primary text-sm font-semibold">
                {formatAmount(source.amount)} {unit}
              </Text>
            </View>
            <View className="flex-row items-center mt-1.5">
              <View className="flex-1 h-1.5 rounded-full bg-background overflow-hidden">
                <View
                  className="h-1.5 rounded-full bg-accent-primary"
                  style={{ width: `${Math.round(source.share * 100)}%` }}
                />
              </View>
              <Text className="text-text-muted text-xs ml-2 w-10 text-right">
                {t('nutrientTrends.topSources.share', {
                  defaultValue: '{{percent}}%',
                  percent: Math.round(source.share * 100),
                })}
              </Text>
            </View>
          </View>
        ))
      )}
    </View>
  );
};

export default NutrientTopSourcesCard;
