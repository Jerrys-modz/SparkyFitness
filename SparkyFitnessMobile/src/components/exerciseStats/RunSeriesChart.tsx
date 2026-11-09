import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { CartesianChart } from 'victory-native';
import { useCSSVariable } from 'uniwind';
import type { RunSeriesPoint } from '@workspace/shared';
import { formatLocalizedNumber } from '../../localization';
import {
  useChartFont,
  CHART_LABEL_FONT_SIZE,
  computeNiceYAxisScale,
} from '../charts/chartFormatting';
import LineSeriesMark from '../charts/LineSeriesMark';

type ChartRow = { minute: number; value: number };

/** Keeps the Skia path light on long sessions sampled every second. */
const MAX_POINTS = 600;

interface RunSeriesChartProps {
  data: readonly RunSeriesPoint[];
  /** Caption under the x axis, whose ticks are bare minute counts. */
  xAxisCaption: string;
  /** Hex or hsl color of the line. */
  color: string;
}

/** One running sensor over the session, x in minutes from the start. */
const RunSeriesChart: React.FC<RunSeriesChartProps> = ({
  data,
  xAxisCaption,
  color,
}) => {
  const font = useChartFont(CHART_LABEL_FONT_SIZE);
  const [textMuted] = useCSSVariable(['--color-text-muted']) as [string];

  const points = useMemo<ChartRow[]>(() => {
    const step = Math.max(1, Math.ceil(data.length / MAX_POINTS));
    return data
      .filter((_, index) => index % step === 0 || index === data.length - 1)
      .map((point) => ({ minute: point.minute, value: point.value }));
  }, [data]);

  const yAxisScale = useMemo(() => {
    const values = points.map((point) => point.value);
    return values.length > 0
      ? computeNiceYAxisScale(Math.min(...values), Math.max(...values))
      : undefined;
  }, [points]);

  return (
    <View>
      <View style={{ height: 160 }}>
        <CartesianChart
          data={points}
          xKey="minute"
          yKeys={['value']}
          domain={
            yAxisScale ? { y: [yAxisScale.min, yAxisScale.max] } : undefined
          }
          domainPadding={{ top: 8, bottom: 8 }}
          xAxis={{
            font,
            tickCount: 5,
            labelColor: textMuted,
            formatXLabel: (value) =>
              formatLocalizedNumber(Math.round(Number(value))),
          }}
          yAxis={[
            {
              font,
              tickCount: yAxisScale?.tickValues.length ?? 5,
              tickValues: yAxisScale?.tickValues,
              labelColor: textMuted,
              formatYLabel: (value) => formatLocalizedNumber(Number(value)),
            },
          ]}
        >
          {({ points: chartPoints }) => (
            <LineSeriesMark
              points={chartPoints.value}
              color={color}
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

export default RunSeriesChart;
