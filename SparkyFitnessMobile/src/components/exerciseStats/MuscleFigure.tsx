import React, { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useCSSVariable } from 'uniwind';
import {
  heatLevel,
  maxDrawnMuscleSets,
  setsForMuscleKey,
  svgClassToMuscleKey,
} from '@workspace/shared';
import {
  MUSCLE_FIGURE_PATHS,
  MUSCLE_FIGURE_VIEWBOX,
} from './muscleFigurePaths';

/** Heat levels 1-4, shared with the web heat map's legend. */
export const MUSCLE_HEAT_COLORS = [
  '#86efac',
  '#22c55e',
  '#eab308',
  '#e11d48',
] as const;

const [, , VIEWBOX_WIDTH, VIEWBOX_HEIGHT] =
  MUSCLE_FIGURE_VIEWBOX.split(' ').map(Number);

interface DrawnPath {
  d: string;
  outline: boolean;
  /** Figure region, or null for the outline and undrawn detail. */
  muscle: string | null;
  level: number;
}

interface MuscleFigureProps {
  setsByMuscle: Record<string, number>;
  selectedKey: string | null;
  onSelect: (key: string) => void;
  accessibilityLabel: string;
}

/**
 * Front and back body figure tinted by working sets on primary muscles.
 * Each region is its own <Path> so a tap knows which muscle it hit.
 */
const MuscleFigure: React.FC<MuscleFigureProps> = ({
  setsByMuscle,
  selectedKey,
  onSelect,
  accessibilityLabel,
}) => {
  const [bodyFill, outlineStroke, regionStroke, emptyFill, selectedStroke] =
    useCSSVariable([
      '--color-raised',
      '--color-border-strong',
      '--color-border',
      '--color-progress-track',
      '--color-text-primary',
    ]) as [string, string, string, string, string];

  const paths = useMemo<DrawnPath[]>(() => {
    const max = maxDrawnMuscleSets(setsByMuscle);
    const drawn = MUSCLE_FIGURE_PATHS.map((path) => {
      const muscle = path.svgClass ? svgClassToMuscleKey(path.svgClass) : null;
      return {
        d: path.d,
        outline: path.outline,
        muscle,
        level: muscle
          ? heatLevel(setsForMuscleKey(muscle, setsByMuscle), max)
          : 0,
      };
    });
    // The lats wrap around the back. Painting them last keeps them on top of
    // the neighbouring regions, as on the web figure.
    return [
      ...drawn.filter((path) => path.muscle !== 'lats'),
      ...drawn.filter((path) => path.muscle === 'lats'),
    ];
  }, [setsByMuscle]);

  return (
    <View
      style={{
        width: '100%',
        maxWidth: 420,
        aspectRatio: VIEWBOX_WIDTH / VIEWBOX_HEIGHT,
      }}
      accessible
      accessibilityLabel={accessibilityLabel}
    >
      <Svg width="100%" height="100%" viewBox={MUSCLE_FIGURE_VIEWBOX}>
        {paths.map((path, index) => {
          if (path.outline) {
            return (
              <Path
                key={index}
                d={path.d}
                fill={bodyFill}
                stroke={outlineStroke}
                strokeWidth={1}
              />
            );
          }
          const { muscle } = path;
          const selected = muscle !== null && muscle === selectedKey;
          const dimmed = selectedKey !== null && muscle !== null && !selected;
          return (
            <Path
              key={index}
              d={path.d}
              fill={
                path.level > 0 ? MUSCLE_HEAT_COLORS[path.level - 1] : emptyFill
              }
              stroke={selected ? selectedStroke : regionStroke}
              strokeWidth={selected ? 1.75 : 0.5}
              opacity={dimmed ? 0.22 : 1}
              testID={muscle ? `muscle-figure-${muscle}` : undefined}
              onPress={muscle ? () => onSelect(muscle) : undefined}
            />
          );
        })}
      </Svg>
    </View>
  );
};

export default MuscleFigure;
