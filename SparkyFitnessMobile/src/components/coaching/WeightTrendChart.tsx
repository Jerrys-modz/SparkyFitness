import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useCSSVariable } from 'uniwind';
import type { CoachingTrendPoint } from '@workspace/shared';

import { formatLocalizedNumber } from '../../localization';
import { weightFromKg } from '../../utils/unitConversions';
import { formatTooltipDate } from '../charts/chartFormatting';

interface WeightTrendChartProps {
  series: CoachingTrendPoint[];
  /** st_lbs is drawn in pounds. */
  unit: 'kg' | 'lbs';
}

const CHART_HEIGHT = 150;
const PAD_X = 8;
const PAD_Y = 10;
const DEFAULT_WIDTH = 300;

const dayNumber = (day: string): number => {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) / 86_400_000;
};

/**
 * Logged weights as dots and the smoothed trend as a line. A weigh-in the trend
 * ignored as implausible is drawn hollow, so a wrong reading is visible rather
 * than silently dropped.
 */
const WeightTrendChart: React.FC<WeightTrendChartProps> = ({
  series,
  unit,
}) => {
  const { t } = useTranslation();
  const [accent, muted] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-secondary',
  ]) as [string, string];
  const [width, setWidth] = useState(DEFAULT_WIDTH);

  const geometry = useMemo(() => {
    if (series.length === 0) return null;
    const points = series.map((p) => ({
      day: dayNumber(p.date),
      weight: weightFromKg(p.weightKg, unit),
      trend: weightFromKg(p.trendKg, unit),
      outlier: p.outlier,
    }));
    const values = points.flatMap((p) => [p.weight, p.trend]);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const pad = Math.max((hi - lo) * 0.1, 0.2);
    const yMin = lo - pad;
    const yMax = hi + pad;
    const firstDay = points[0]!.day;
    const lastDay = points[points.length - 1]!.day;
    const spanDays = Math.max(lastDay - firstDay, 1);
    const x = (day: number) =>
      PAD_X + ((day - firstDay) / spanDays) * (width - 2 * PAD_X);
    const y = (v: number) =>
      PAD_Y + (1 - (v - yMin) / (yMax - yMin)) * (CHART_HEIGHT - 2 * PAD_Y);
    const line = points
      .filter((p) => !p.outlier)
      .map(
        (p, i) =>
          `${i === 0 ? 'M' : 'L'}${x(p.day).toFixed(1)} ${y(p.trend).toFixed(1)}`
      )
      .join(' ');
    return {
      line,
      dots: points.map((p) => ({
        cx: x(p.day),
        cy: y(p.weight),
        outlier: p.outlier,
      })),
      yMin: lo,
      yMax: hi,
    };
  }, [series, unit, width]);

  if (!geometry) return null;

  const first = series[0]!;
  const last = series[series.length - 1]!;
  const fmt = (v: number) =>
    formatLocalizedNumber(v, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });

  return (
    <View
      testID="weight-trend-chart"
      accessible
      accessibilityLabel={t('coaching.chartA11y', {
        defaultValue:
          'Weight trend chart, from {{from}} {{unit}} to {{to}} {{unit}}',
        from: fmt(weightFromKg(first.trendKg, unit)),
        to: fmt(weightFromKg(last.trendKg, unit)),
        unit,
      })}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
    >
      <Svg width={width} height={CHART_HEIGHT}>
        <Path
          d={geometry.line}
          stroke={accent}
          strokeWidth={2.5}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {geometry.dots.map((dot, i) => (
          <Circle
            key={i}
            cx={dot.cx}
            cy={dot.cy}
            r={dot.outlier ? 4 : 3}
            fill={dot.outlier ? 'none' : muted}
            stroke={dot.outlier ? muted : 'none'}
            strokeWidth={1.5}
            opacity={dot.outlier ? 1 : 0.7}
          />
        ))}
      </Svg>
      <View className="flex-row justify-between mt-1">
        <Text className="text-text-secondary text-xs">
          {formatTooltipDate(first.date)}
        </Text>
        <Text className="text-text-secondary text-xs">
          {fmt(geometry.yMin)}–{fmt(geometry.yMax)} {unit}
        </Text>
        <Text className="text-text-secondary text-xs">
          {formatTooltipDate(last.date)}
        </Text>
      </View>
    </View>
  );
};

export default WeightTrendChart;
