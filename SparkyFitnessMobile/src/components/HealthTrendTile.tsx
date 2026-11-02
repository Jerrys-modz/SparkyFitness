import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import {
  HEALTH_TREND_LABELS,
  type HealthTrendKey,
} from '../constants/healthTrends';
import { formatLocalizedNumber } from '../localization/i18n';
import type { HealthTrendTileSummary } from '../utils/healthTrendTiles';
import { formatVolumeForUnit, volumeFromMl } from '../utils/unitConversions';
import TrendSparkline from './TrendSparkline';

const SPARKLINE_HEIGHT = 36;
const SPARKLINE_WIDTH = 120;

type TileValueFormat = {
  headline: string;
  unit: string;
};

export const formatTrendHeadline = (
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
 * The change over the window, e.g. "-1.2 kg · 7d", or just the window for daily totals,
 * which have no single change. VO2 max leaves its long unit off.
 */
export const formatTrendChange = (
  key: HealthTrendKey,
  summary: HealthTrendTileSummary,
  unit: string,
  rangeLabel: string
): string => {
  if (summary.kind !== 'latest' || summary.delta == null) return rangeLabel;
  const sign = summary.delta > 0 ? '+' : '';
  const amount = formatLocalizedNumber(summary.delta, {
    maximumFractionDigits: 1,
  });
  const withUnit = key === 'vo2max' || !unit ? '' : ` ${unit}`;
  return `${sign}${amount}${withUnit} · ${rangeLabel}`;
};

type HealthTrendTileProps = {
  trendKey: HealthTrendKey;
  summary: HealthTrendTileSummary;
  weightUnit: string;
  waterUnit: string;
  /** The window the figures cover, e.g. `7d`. */
  rangeLabel: string;
  isExpanded?: boolean;
  /** Makes the tile tappable; without it the tile is plain content. */
  onPress?: () => void;
};

/** One trend as a tile: a headline, its change over the window, and a sparkline. */
const HealthTrendTile: React.FC<HealthTrendTileProps> = ({
  trendKey,
  summary,
  weightUnit,
  waterUnit,
  rangeLabel,
  isExpanded = false,
  onPress,
}) => {
  // The line fills the tile, so it follows the tile's width rather than a fixed size.
  const [lineWidth, setLineWidth] = useState(SPARKLINE_WIDTH);
  const { t } = useTranslation();
  const accentColor = useCSSVariable('--color-accent-primary') as string;
  const { headline, unit } = formatTrendHeadline(
    trendKey,
    summary,
    weightUnit,
    waterUnit,
    t
  );
  const label = HEALTH_TREND_LABELS[trendKey](t);
  const className = `w-[48%] bg-surface rounded-xl p-3 mb-2 shadow-sm ${
    isExpanded ? 'border border-accent-primary' : ''
  }`;
  const body = (
    <>
      <Text className="text-text-muted text-xs" numberOfLines={1}>
        {label}
      </Text>
      <View className="flex-row items-baseline mt-1">
        <Text className="text-text-primary text-xl font-bold" numberOfLines={1}>
          {headline}
        </Text>
        {unit ? (
          <Text className="text-text-muted text-xs ml-1">{unit}</Text>
        ) : null}
      </View>
      <Text className="text-text-secondary text-xs" numberOfLines={1}>
        {formatTrendChange(trendKey, summary, unit, rangeLabel)}
      </Text>
      <View
        className="mt-2"
        onLayout={(event) =>
          setLineWidth(Math.floor(event.nativeEvent.layout.width))
        }
      >
        <TrendSparkline
          values={summary.values}
          width={lineWidth}
          height={SPARKLINE_HEIGHT}
          color={accentColor}
        />
      </View>
    </>
  );
  const accessibilityLabel = `${label}: ${headline}${unit ? ` ${unit}` : ''}`;
  if (!onPress) {
    return (
      <View
        testID={`health-trend-tile-${trendKey}`}
        accessible
        accessibilityLabel={accessibilityLabel}
        className={className}
      >
        {body}
      </View>
    );
  }
  return (
    <Pressable
      testID={`health-trend-tile-${trendKey}`}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ expanded: isExpanded }}
      onPress={onPress}
      className={className}
    >
      {body}
    </Pressable>
  );
};

export default HealthTrendTile;
