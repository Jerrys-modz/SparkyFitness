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

/** Width classes for the grid: two tiles a row, or three with `columns` 3. */
const TILE_WIDTH_CLASS = { 2: 'w-[48%]', 3: 'w-[31.5%]' } as const;

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
  /** Tiles per row, 2 by default. */
  columns?: 2 | 3;
  /** Draw the sparkline under the figures (default). */
  showSparkline?: boolean;
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
  columns = 2,
  showSparkline = true,
}) => {
  // The line fills the tile, so it follows the tile's width rather than a fixed size.
  const [lineWidth, setLineWidth] = useState(SPARKLINE_WIDTH);
  const { t } = useTranslation();
  const accentColor = useCSSVariable('--color-accent-primary') as string;
  const { headline, unit } = formatHeadline(
    trendKey,
    summary,
    weightUnit,
    waterUnit,
    t
  );
  const label = HEALTH_TREND_LABELS[trendKey](t);
  const showDelta = summary.kind === 'latest' && summary.delta != null;
  const className = `${TILE_WIDTH_CLASS[columns]} bg-surface rounded-xl p-3 mb-2 shadow-sm ${
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
      {showDelta ? (
        <Text className="text-text-secondary text-xs" numberOfLines={1}>
          {`${(summary.delta ?? 0) > 0 ? '+' : ''}${formatLocalizedNumber(
            summary.delta ?? 0,
            { maximumFractionDigits: 1 }
          )}${trendKey === 'vo2max' || !unit ? '' : ` ${unit}`} · ${rangeLabel}`}
        </Text>
      ) : (
        <Text className="text-text-muted text-xs">{rangeLabel}</Text>
      )}
      {showSparkline ? (
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
      ) : null}
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
