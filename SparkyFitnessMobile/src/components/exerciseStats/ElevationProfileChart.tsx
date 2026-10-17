import React, { useMemo } from 'react';
import { View } from 'react-native';
import { Area, CartesianChart } from 'victory-native';
import { useCSSVariable } from 'uniwind';
import { formatLocalizedNumber } from '../../localization';
import type { ElevationSample } from '../../utils/routeElevation';
import {
  useChartFont,
  CHART_LABEL_FONT_SIZE,
  computeNiceYAxisScale,
} from '../charts/chartFormatting';
import LineSeriesMark from '../charts/LineSeriesMark';
import { distanceTickDigits } from './PaceChart';

const X_TICK_COUNT = 5;

interface ElevationProfileChartProps {
  data: readonly ElevationSample[];
}

/** Height over distance along a route, with the area under it softly filled. */
const ElevationProfileChart: React.FC<ElevationProfileChartProps> = ({
  data,
}) => {
  const font = useChartFont(CHART_LABEL_FONT_SIZE);
  const [lineColor, textMuted] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
  ]) as [string, string];

  const points = useMemo(() => data.map((sample) => ({ ...sample })), [data]);

  const yAxisScale = useMemo(() => {
    const values = points.map((point) => point.elevation);
    return values.length > 0
      ? computeNiceYAxisScale(Math.min(...values), Math.max(...values))
      : undefined;
  }, [points]);

  const distanceDigits = useMemo(() => {
    if (data.length < 2) return 1;
    const distances = data.map((sample) => sample.distance);
    return distanceTickDigits(Math.max(...distances) - Math.min(...distances));
  }, [data]);

  return (
    <View style={{ height: 160 }}>
      <CartesianChart
        data={points}
        xKey="distance"
        yKeys={['elevation']}
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
            formatYLabel: (value) =>
              formatLocalizedNumber(Math.round(Number(value))),
          },
        ]}
      >
        {({ points: chartPoints, chartBounds }) => (
          <>
            <Area
              points={chartPoints.elevation}
              y0={chartBounds.bottom}
              color={lineColor}
              opacity={0.18}
              curveType="linear"
            />
            <LineSeriesMark
              points={chartPoints.elevation}
              color={lineColor}
              strokeWidth={2}
              curveType="linear"
            />
          </>
        )}
      </CartesianChart>
    </View>
  );
};

export default ElevationProfileChart;
