import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { CartesianChart } from 'victory-native';
import { useCSSVariable } from 'uniwind';
import { formatLocalizedNumber } from '../../localization';
import type { PacePoint } from '../../utils/cardioSession';
import { formatPace } from '../../utils/gpsRecording';
import {
  useChartFont,
  CHART_LABEL_FONT_SIZE,
  computeNiceYAxisScale,
} from '../charts/chartFormatting';
import LineSeriesMark from '../charts/LineSeriesMark';

const X_TICK_COUNT = 5;

/**
 * Decimal places for distance ticks. One place is enough on a long route;
 * a short one needs more, or ticks under 0.1 apart all read as "0.0".
 */
export function distanceTickDigits(
  span: number,
  tickCount = X_TICK_COUNT
): number {
  const step = span / Math.max(1, tickCount - 1);
  if (!(step > 0) || !Number.isFinite(step)) return 1;
  return Math.min(3, Math.max(1, Math.ceil(-Math.log10(step))));
}

interface PaceChartProps {
  data: readonly PacePoint[];
  /** Caption under the x axis, naming the distance unit. */
  xAxisCaption: string;
  /**
   * Draws the grade-adjusted pace as a second line, over the stretches that
   * have one. The caller only sets it for a track with elevation.
   */
  gradeAdjusted?: { paceLabel: string; gapLabel: string };
}

/**
 * Pace over distance. The line is drawn on negated pace so a faster stretch
 * sits higher on the chart, as in running apps; the axis labels undo it.
 */
const PaceChart: React.FC<PaceChartProps> = ({
  data: allData,
  xAxisCaption,
  gradeAdjusted,
}) => {
  const font = useChartFont(CHART_LABEL_FONT_SIZE);
  const [lineColor, gapColor, textMuted] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-secondary',
    '--color-text-muted',
  ]) as [string, string, string];

  // Both lines are drawn over the same stretches, so a stretch with no
  // grade-adjusted reading is left out rather than given the plain pace.
  const data = useMemo(
    () =>
      gradeAdjusted
        ? allData.filter((point) => point.gapSeconds != null)
        : allData,
    [allData, gradeAdjusted]
  );

  const points = useMemo(
    () =>
      data.map((point) => ({
        distance: point.distance,
        pace: -point.paceSeconds,
        gap: -(point.gapSeconds ?? point.paceSeconds),
      })),
    [data]
  );

  const yAxisScale = useMemo(() => {
    const values = points.flatMap((point) =>
      gradeAdjusted ? [point.pace, point.gap] : [point.pace]
    );
    return values.length > 0
      ? computeNiceYAxisScale(Math.min(...values), Math.max(...values))
      : undefined;
  }, [points, gradeAdjusted]);

  const distanceDigits = useMemo(() => {
    if (data.length < 2) return 1;
    const distances = data.map((point) => point.distance);
    return distanceTickDigits(Math.max(...distances) - Math.min(...distances));
  }, [data]);

  return (
    <View>
      <View style={{ height: 180 }}>
        <CartesianChart
          data={points}
          xKey="distance"
          yKeys={['pace', 'gap']}
          domain={
            yAxisScale ? { y: [yAxisScale.min, yAxisScale.max] } : undefined
          }
          domainPadding={{ top: 8, bottom: 8 }}
          xAxis={{
            font,
            tickCount: X_TICK_COUNT,
            labelColor: textMuted,
            formatXLabel: (value) =>
              formatLocalizedNumber(Number(value), {
                maximumFractionDigits: distanceDigits,
              }),
          }}
          yAxis={[
            {
              font,
              tickCount: yAxisScale?.tickValues.length ?? 5,
              tickValues: yAxisScale?.tickValues,
              labelColor: textMuted,
              formatYLabel: (value) => formatPace(-Number(value)),
            },
          ]}
        >
          {({ points: chartPoints }) => (
            <>
              <LineSeriesMark
                points={chartPoints.pace}
                color={lineColor}
                strokeWidth={2}
                curveType="linear"
              />
              {gradeAdjusted ? (
                <LineSeriesMark
                  points={chartPoints.gap}
                  color={gapColor}
                  strokeWidth={2}
                  curveType="linear"
                />
              ) : null}
            </>
          )}
        </CartesianChart>
      </View>
      <Text className="text-text-muted text-xs text-center mt-1">
        {xAxisCaption}
      </Text>
      {gradeAdjusted ? (
        <View className="flex-row justify-center mt-1">
          <View className="flex-row items-center mr-4">
            <View
              className="w-3 h-1 rounded-full mr-1"
              style={{ backgroundColor: lineColor }}
            />
            <Text className="text-text-muted text-xs">
              {gradeAdjusted.paceLabel}
            </Text>
          </View>
          <View className="flex-row items-center">
            <View
              className="w-3 h-1 rounded-full mr-1"
              style={{ backgroundColor: gapColor }}
            />
            <Text className="text-text-muted text-xs">
              {gradeAdjusted.gapLabel}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
};

export default PaceChart;
