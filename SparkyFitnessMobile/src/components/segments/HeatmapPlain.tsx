import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { useCSSVariable } from 'uniwind';
import { heatIntensityClass, type HeatmapResponse } from '@workspace/shared';
import { HEATMAP_CLASSES, HEATMAP_COLORS } from '../../utils/heatmapDisplay';

const HEIGHT = 320;

interface HeatmapPlainProps {
  data: HeatmapResponse;
  accessibilityLabel: string;
}

/**
 * The heatmap with no map under it, for Android builds without a Google Maps
 * key: every cell is a square placed by its latitude and longitude, fitted
 * to the box around everything the person has been.
 */
const HeatmapPlain: React.FC<HeatmapPlainProps> = ({
  data,
  accessibilityLabel,
}) => {
  const [width, setWidth] = useState(0);
  const background = useCSSVariable('--color-raised') as string;

  const drawn = useMemo(() => {
    const bounds = data.bounds;
    if (!bounds || width <= 0) return [];
    const midLat = (bounds.minLat + bounds.maxLat) / 2;
    const cos = Math.max(0.1, Math.cos((midLat * Math.PI) / 180));
    const spanX = Math.max(1e-6, (bounds.maxLon - bounds.minLon) * cos);
    const spanY = Math.max(1e-6, bounds.maxLat - bounds.minLat);
    const pad = 12;
    const scale = Math.min(
      (width - 2 * pad) / spanX,
      (HEIGHT - 2 * pad) / spanY
    );
    const offsetX = (width - spanX * scale) / 2;
    const offsetY = (HEIGHT - spanY * scale) / 2;
    const size = Math.max(2, (data.cellM / 111_320) * scale);
    return data.cells.map(([lat, lon, count]) => ({
      x: offsetX + (lon - bounds.minLon) * cos * scale - size / 2,
      y: offsetY + (bounds.maxLat - lat) * scale - size / 2,
      size,
      fill:
        HEATMAP_COLORS[
          heatIntensityClass(count, data.maxCount, HEATMAP_CLASSES)
        ] ?? HEATMAP_COLORS[0],
    }));
  }, [data, width]);

  return (
    <View
      className="rounded-lg overflow-hidden"
      style={{ height: HEIGHT, backgroundColor: background }}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      testID="heatmap-plain"
    >
      {width > 0 ? (
        <Svg width={width} height={HEIGHT}>
          {drawn.map((cell, index) => (
            <Rect
              key={index}
              x={cell.x}
              y={cell.y}
              width={cell.size}
              height={cell.size}
              fill={cell.fill}
            />
          ))}
        </Svg>
      ) : null}
    </View>
  );
};

export default HeatmapPlain;
