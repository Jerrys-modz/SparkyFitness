import React, { useMemo } from 'react';
import {
  DashPathEffect,
  LinearGradient,
  Line as SkiaLine,
  vec,
} from '@shopify/react-native-skia';
import { Line } from 'victory-native';
import {
  zoneEdgeLines,
  zoneGradientStops,
  type HeartRateDisplayBand,
} from '@workspace/shared';
import LineSeriesMark from './LineSeriesMark';

type LineProps = React.ComponentProps<typeof Line>;

interface HeartRateZoneLineProps extends Omit<LineProps, 'color' | 'children'> {
  /** The person's bands, from `useHeartRateZoneBands`. */
  bands: readonly HeartRateDisplayBand[];
  /** The chart's plot area and y scale, from the CartesianChart render args. */
  chartBounds: { left: number; right: number; top: number; bottom: number };
  yScale: (bpm: number) => number;
  /** Draw a dotted line, in the zone's color, where each zone starts. */
  showZoneLines?: boolean;
}

/**
 * A heart rate line colored by the person's zones (it turns from blue to
 * green, amber and red as it climbs through them), with dotted zone lines
 * behind it. The colors and edges come from `@workspace/shared`, the same as
 * the web charts.
 */
const HeartRateZoneLine: React.FC<HeartRateZoneLineProps> = ({
  bands,
  chartBounds,
  yScale,
  showZoneLines = true,
  points,
  ...lineProps
}) => {
  const range = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    points.forEach((point) => {
      const value = point.yValue;
      if (typeof value !== 'number' || !Number.isFinite(value)) return;
      if (value < min) min = value;
      if (value > max) max = value;
    });
    return Number.isFinite(min) ? { min, max } : null;
  }, [points]);

  const stops = useMemo(
    () => (range ? zoneGradientStops(range.min, range.max, bands) : []),
    [range, bands]
  );

  const edges = useMemo(() => {
    if (!showZoneLines) return [];
    return zoneEdgeLines(bands)
      .map((edge) => ({ ...edge, y: yScale(edge.bpm) }))
      .filter(
        (edge) =>
          Number.isFinite(edge.y) &&
          edge.y >= chartBounds.top &&
          edge.y <= chartBounds.bottom
      );
  }, [bands, showZoneLines, yScale, chartBounds.top, chartBounds.bottom]);

  const firstColor = stops[0]?.color ?? bands[0]?.color ?? '#94a3b8';
  const isSolid = stops.every((stop) => stop.color === firstColor);

  return (
    <>
      {edges.map((edge) => (
        <SkiaLine
          key={edge.bpm}
          p1={vec(chartBounds.left, edge.y)}
          p2={vec(chartBounds.right, edge.y)}
          color={edge.color}
          strokeWidth={1.5}
          opacity={0.8}
        >
          <DashPathEffect intervals={[2, 5]} />
        </SkiaLine>
      ))}
      {isSolid || !range || points.length < 2 ? (
        <LineSeriesMark points={points} color={firstColor} {...lineProps} />
      ) : (
        <Line points={points} {...lineProps}>
          {/* Top of the gradient is the highest reading, bottom the lowest */}
          <LinearGradient
            start={vec(0, yScale(range.max))}
            end={vec(0, yScale(range.min))}
            colors={stops.map((stop) => stop.color)}
            positions={stops.map((stop) => stop.offset)}
          />
        </Line>
      )}
    </>
  );
};

export default HeartRateZoneLine;
