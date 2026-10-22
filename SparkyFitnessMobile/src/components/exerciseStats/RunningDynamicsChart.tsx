import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import { CartesianChart } from 'victory-native';
import { useCSSVariable } from 'uniwind';
import { formatLocalizedNumber } from '../../localization';
import {
  useChartFont,
  CHART_LABEL_FONT_SIZE,
  computeNiceYAxisScale,
} from '../charts/chartFormatting';
import LineSeriesMark from '../charts/LineSeriesMark';

/** Keeps the Skia path light on long sessions. */
const MAX_POINTS = 400;

export interface DynamicsChartPoint {
  /** Minutes since the first reading. */
  elapsedMinutes: number;
  /** Already in the unit the axis shows. */
  value: number;
}

interface RunningDynamicsChartProps {
  data: readonly DynamicsChartPoint[];
  /** Caption under the x axis, whose ticks are bare minute counts. */
  xAxisCaption: string;
  /** Digits after the decimal point on the y axis ticks. */
  fractionDigits?: number;
}

/** One running-dynamics metric over the session, x in minutes from the first reading. */
const RunningDynamicsChart: React.FC<RunningDynamicsChartProps> = ({
  data,
  xAxisCaption,
  fractionDigits = 0,
}) => {
  const font = useChartFont(CHART_LABEL_FONT_SIZE);
  const [lineColor, textMuted] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
  ]) as [string, string];

  const points = useMemo(() => {
    const step = Math.ceil(data.length / MAX_POINTS);
    return data
      .filter((_, index) => index % step === 0 || index === data.length - 1)
      .map((point) => ({ minute: point.elapsedMinutes, value: point.value }));
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
              formatYLabel: (value) =>
                formatLocalizedNumber(Number(value), {
                  maximumFractionDigits: fractionDigits,
                }),
            },
          ]}
        >
          {({ points: chartPoints }) => (
            <LineSeriesMark
              points={chartPoints.value}
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

export default RunningDynamicsChart;
