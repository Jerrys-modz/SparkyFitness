import React, { useMemo } from 'react';
import { View } from 'react-native';
import { CartesianChart, Scatter } from 'victory-native';
import { useCSSVariable } from 'uniwind';
import type { SegmentEffort } from '@workspace/shared';
import {
  useChartFont,
  CHART_LABEL_FONT_SIZE,
  computeNiceYAxisScale,
} from '../charts/chartFormatting';
import LineSeriesMark from '../charts/LineSeriesMark';
import { effortChartPoints } from '../../utils/segmentDisplay';
import { formatClock } from '../../utils/gpsRecording';

interface SegmentEffortChartProps {
  /** Newest first, as the server sends them. */
  efforts: readonly SegmentEffort[];
}

/**
 * The person's times on a segment in the order they ran them. Drawn on
 * negated seconds so a faster effort sits higher; records get a larger dot.
 */
const SegmentEffortChart: React.FC<SegmentEffortChartProps> = ({ efforts }) => {
  const font = useChartFont(CHART_LABEL_FONT_SIZE);
  const [lineColor, recordColor, textMuted] = useCSSVariable([
    '--color-accent-primary',
    '--color-icon-success',
    '--color-text-muted',
  ]) as [string, string, string];

  const data = useMemo(
    () =>
      effortChartPoints(efforts).map((p) => ({
        index: p.index,
        time: p.value,
        record: p.isPersonalRecord ? p.value : undefined,
      })),
    [efforts]
  );
  const yScale = useMemo(() => {
    const values = data.map((p) => p.time);
    return values.length > 0
      ? computeNiceYAxisScale(Math.min(...values), Math.max(...values))
      : undefined;
  }, [data]);

  return (
    <View style={{ height: 180 }} testID="segment-effort-chart">
      <CartesianChart
        data={data}
        xKey="index"
        yKeys={['time', 'record']}
        domain={yScale ? { y: [yScale.min, yScale.max] } : undefined}
        domainPadding={{ top: 12, bottom: 12, left: 12, right: 12 }}
        xAxis={{
          font,
          tickCount: Math.min(5, Math.max(2, data.length)),
          labelColor: textMuted,
          formatXLabel: (value) => String(Number(value) + 1),
        }}
        yAxis={[
          {
            font,
            tickCount: yScale?.tickValues.length ?? 5,
            tickValues: yScale?.tickValues,
            labelColor: textMuted,
            formatYLabel: (value) => formatClock(-Number(value)),
          },
        ]}
      >
        {({ points }) => (
          <>
            <LineSeriesMark
              points={points.time}
              color={lineColor}
              strokeWidth={2}
              curveType="linear"
            />
            <Scatter
              points={points.time}
              color={lineColor}
              radius={3}
              shape="circle"
            />
            <Scatter
              points={points.record}
              color={recordColor}
              radius={6}
              shape="circle"
            />
          </>
        )}
      </CartesianChart>
    </View>
  );
};

export default SegmentEffortChart;
