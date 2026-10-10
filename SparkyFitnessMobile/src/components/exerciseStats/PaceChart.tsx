import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { CartesianChart } from 'victory-native';
import { useCSSVariable } from 'uniwind';
import { formatLocalizedNumber } from '../../localization';
import type { PacePoint } from '../../utils/cardioSession';
import { formatPace } from '../../utils/gpsRecording';
import {
  makeChartFont,
  CHART_LABEL_FONT_SIZE,
  computeNiceYAxisScale,
} from '../charts/chartFormatting';
import LineSeriesMark from '../charts/LineSeriesMark';

const font = makeChartFont(CHART_LABEL_FONT_SIZE);

interface PaceChartProps {
  data: readonly PacePoint[];
  /** Caption under the x axis, naming the distance unit. */
  xAxisCaption: string;
}

/**
 * Pace over distance. The line is drawn on negated pace so a faster stretch
 * sits higher on the chart, as in running apps; the axis labels undo it.
 */
const PaceChart: React.FC<PaceChartProps> = ({ data, xAxisCaption }) => {
  const [lineColor, textMuted] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
  ]) as [string, string];

  const points = useMemo(
    () =>
      data.map((point) => ({
        distance: point.distance,
        pace: -point.paceSeconds,
      })),
    [data]
  );

  const yAxisScale = useMemo(() => {
    const values = points.map((point) => point.pace);
    return values.length > 0
      ? computeNiceYAxisScale(Math.min(...values), Math.max(...values))
      : undefined;
  }, [points]);

  return (
    <View>
      <View style={{ height: 180 }}>
        <CartesianChart
          data={points}
          xKey="distance"
          yKeys={['pace']}
          domain={
            yAxisScale ? { y: [yAxisScale.min, yAxisScale.max] } : undefined
          }
          domainPadding={{ top: 8, bottom: 8 }}
          xAxis={{
            font,
            tickCount: 5,
            labelColor: textMuted,
            formatXLabel: (value) =>
              formatLocalizedNumber(Number(value), {
                maximumFractionDigits: 1,
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
            <LineSeriesMark
              points={chartPoints.pace}
              color={lineColor}
              strokeWidth={2}
              curveType="linear"
            />
          )}
        </CartesianChart>
      </View>
      <Text className="text-text-muted text-xs text-center mt-1">
        {xAxisCaption}
      </Text>
    </View>
  );
};

export default PaceChart;
