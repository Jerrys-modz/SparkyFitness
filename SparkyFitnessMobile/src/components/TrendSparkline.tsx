import React, { useMemo } from 'react';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';

type TrendSparklineProps = {
  values: readonly number[];
  width: number;
  height: number;
  color: string;
  strokeWidth?: number;
};

const PADDING = 2;

/**
 * A bare line of the values, scaled to fit. No axes or labels: a tile's job is the
 * shape of the trend, and the full chart is one tap away for the numbers.
 */
const TrendSparkline: React.FC<TrendSparklineProps> = ({
  values,
  width,
  height,
  color,
  strokeWidth = 2,
}) => {
  const path = useMemo(() => {
    const skiaPath = Skia.Path.Make();
    if (values.length === 0 || width <= 0) return skiaPath;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min;
    const innerWidth = width - PADDING * 2;
    const innerHeight = height - PADDING * 2;
    values.forEach((value, index) => {
      const x =
        values.length === 1
          ? width / 2
          : PADDING + (index / (values.length - 1)) * innerWidth;
      // A flat series sits mid-height rather than on the floor.
      const y =
        span === 0
          ? height / 2
          : PADDING + (1 - (value - min) / span) * innerHeight;
      if (index === 0) skiaPath.moveTo(x, y);
      else skiaPath.lineTo(x, y);
    });
    return skiaPath;
  }, [values, width, height]);

  return (
    <Canvas style={{ width, height }}>
      <Path
        path={path}
        color={color}
        style="stroke"
        strokeWidth={strokeWidth}
        strokeJoin="round"
        strokeCap="round"
      />
    </Canvas>
  );
};

export default TrendSparkline;
