import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import type { HealthTrendKey } from '../constants/healthTrends';
import { summarizeHealthTrend } from '../utils/healthTrendTiles';
import HealthTrendChart, {
  NO_HEART_RATE,
  NO_VO2MAX,
  rangeForTrend,
  trendHasData,
  type HealthTrendsData,
} from './HealthTrendChart';
import HealthTrendTile from './HealthTrendTile';

type HealthTrendTilesProps = HealthTrendsData & {
  /** The graphs to draw as tiles, already ordered and limited by the caller. */
  tileTrends: readonly HealthTrendKey[];
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
        {tiles.map(({ key, summary }) => (
          <HealthTrendTile
            key={key}
            trendKey={key}
            summary={summary}
            weightUnit={data.weightUnit}
            waterUnit={data.waterUnit}
            rangeLabel={rangeForTrend(data, key)}
            isExpanded={key === expandedKey}
            onPress={() => setExpandedKey(key === expandedKey ? null : key)}
          />
        ))}
      </View>
      {expanded ? <HealthTrendChart {...data} trendKey={expanded.key} /> : null}
    </View>
  );
};

export default HealthTrendTiles;
