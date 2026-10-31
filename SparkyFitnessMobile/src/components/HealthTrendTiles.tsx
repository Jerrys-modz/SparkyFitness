import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import {
  HEALTH_TREND_LABELS,
  type HealthTrendKey,
} from '../constants/healthTrends';
import { formatLocalizedNumber } from '../localization/i18n';
import { formatVolumeForUnit, volumeFromMl } from '../utils/unitConversions';
import {
  summarizeHealthTrend,
  type HealthTrendTileSummary,
} from '../utils/healthTrendTiles';
import HealthTrendChart, {
  NO_HEART_RATE,
  NO_VO2MAX,
  rangeForTrend,
  trendHasData,
  type HealthTrendsData,
} from './HealthTrendChart';
import TrendSparkline from './TrendSparkline';

const SPARKLINE_HEIGHT = 36;
const SPARKLINE_WIDTH = 120;

type HealthTrendTilesProps = HealthTrendsData & {
  /** The graphs to draw as tiles, already ordered and limited by the caller. */
  tileTrends: readonly HealthTrendKey[];
};

type TileValueFormat = {
  headline: string;
  unit: string;
};

const formatHeadline = (
  key: HealthTrendKey,
  summary: HealthTrendTileSummary,
  weightUnit: string,
  waterUnit: string,
  t: ReturnType<typeof useTranslation>['t']
): TileValueFormat => {
  if (summary.headline == null) return { headline: '—', unit: '' };
  const value = summary.headline;
  switch (key) {
    case 'steps':
      return {
        headline: formatLocalizedNumber(Math.round(value)),
        unit: t('charts.tiles.stepsUnit', { defaultValue: 'steps/day' }),
      };
    case 'weight':
      return {
        headline: formatLocalizedNumber(value, { maximumFractionDigits: 1 }),
        unit: weightUnit,
      };
    case 'sleep':
      return {
        headline: formatLocalizedNumber(value, { maximumFractionDigits: 1 }),
        unit: t('charts.tiles.hoursUnit', { defaultValue: 'h/night' }),
      };
    case 'hydration':
      return {
        headline: formatVolumeForUnit(
          volumeFromMl(value, waterUnit),
          waterUnit
        ),
        unit: waterUnit,
      };
    case 'calories':
      return {
        headline: formatLocalizedNumber(Math.round(value)),
        unit: t('charts.tiles.caloriesUnit', { defaultValue: 'kcal/day' }),
      };
    case 'heartRate':
      return {
        headline: formatLocalizedNumber(Math.round(value)),
        unit: t('charts.tiles.bpmUnit', { defaultValue: 'bpm' }),
      };
    case 'vo2max':
      return {
        headline: formatLocalizedNumber(value, { maximumFractionDigits: 1 }),
        unit: t('charts.tiles.vo2Unit', { defaultValue: 'ml/kg/min' }),
      };
  }
};

/**
 * Several trends at a glance. Each tile is a headline number and a sparkline; tapping one
 * opens that trend's full chart underneath, and tapping it again closes it.
 */
const HealthTrendTiles: React.FC<HealthTrendTilesProps> = ({
  tileTrends,
  ...data
}) => {
  const { t } = useTranslation();
  const accentColor = useCSSVariable('--color-accent-primary') as string;
  const [expandedKey, setExpandedKey] = useState<HealthTrendKey | null>(null);

  const input = {
    steps: data.steps.data,
    weight: data.weight.data,
    sleep: data.sleep.data,
    hydration: data.hydration.data,
    calories: data.calories.data,
    heartRate: (data.heartRate ?? NO_HEART_RATE).data,
    vo2max: (data.vo2max ?? NO_VO2MAX).data,
  };
  const tiles = tileTrends
    .filter((key) => trendHasData(key, data))
    .map((key) => ({ key, summary: summarizeHealthTrend(key, input) }));

  if (tiles.length === 0) {
    return (
      <View className="bg-surface rounded-xl p-6 my-2 shadow-sm">
        <Text className="text-text-muted text-sm text-center">
          {tileTrends.length > 0
            ? t('charts.noTrendData', { defaultValue: 'No data to graph yet.' })
            : t('charts.noTiles', {
                defaultValue:
                  'No tiles chosen. Pick up to 4 graphs in Dashboard Settings.',
              })}
        </Text>
      </View>
    );
  }

  const expanded = tiles.find((tile) => tile.key === expandedKey);

  return (
    <View>
      <View className="flex-row flex-wrap justify-between">
        {tiles.map(({ key, summary }) => {
          const { headline, unit } = formatHeadline(
            key,
            summary,
            data.weightUnit,
            data.waterUnit,
            t
          );
          const label = HEALTH_TREND_LABELS[key](t);
          const isExpanded = key === expandedKey;
          const showDelta = summary.kind === 'latest' && summary.delta != null;
          return (
            <Pressable
              key={key}
              testID={`health-trend-tile-${key}`}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ expanded: isExpanded }}
              onPress={() => setExpandedKey(isExpanded ? null : key)}
              className={`bg-surface rounded-xl p-3 mb-2 shadow-sm ${
                isExpanded ? 'border border-accent-primary' : ''
              }`}
              style={{ width: '48.5%' }}
            >
              <Text className="text-text-muted text-xs">{label}</Text>
              <View className="flex-row items-baseline mt-1">
                <Text className="text-text-primary text-xl font-bold">
                  {headline}
                </Text>
                {unit ? (
                  <Text className="text-text-muted text-xs ml-1">{unit}</Text>
                ) : null}
              </View>
              {showDelta ? (
                <Text className="text-text-secondary text-xs">
                  {`${(summary.delta ?? 0) > 0 ? '+' : ''}${formatLocalizedNumber(
                    summary.delta ?? 0,
                    { maximumFractionDigits: 1 }
                  )}`}
                </Text>
              ) : (
                <Text className="text-text-muted text-xs">
                  {rangeForTrend(data, key)}
                </Text>
              )}
              <View className="mt-2">
                <TrendSparkline
                  values={summary.values}
                  width={SPARKLINE_WIDTH}
                  height={SPARKLINE_HEIGHT}
                  color={accentColor}
                />
              </View>
            </Pressable>
          );
        })}
      </View>
      {expanded ? <HealthTrendChart {...data} trendKey={expanded.key} /> : null}
    </View>
  );
};

export default HealthTrendTiles;
