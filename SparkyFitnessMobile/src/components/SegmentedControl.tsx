import { View, Text, TouchableOpacity } from 'react-native';

export type Segment<T extends string> = {
  key: T;
  label: string;
  /** Optional accent: a dot before the label and a matching underline while selected. */
  color?: string;
};

type SegmentedControlProps<T extends string> = {
  segments: Segment<T>[];
  activeKey: T;
  onSelect: (key: T) => void;
  /**
   * `neutral` (default) lifts the selected segment onto the card color. `accent` fills it
   * with Sparky Blue, for a control that switches what the whole screen shows.
   */
  tone?: 'neutral' | 'accent';
  testID?: string;
};

const SegmentedControl = <T extends string>({
  segments,
  activeKey,
  onSelect,
  tone = 'neutral',
  testID,
}: SegmentedControlProps<T>) => {
  const accent = tone === 'accent';
  return (
    <View testID={testID}>
      <View
        className={`flex-row bg-raised p-1 ${accent ? 'rounded-xl' : 'rounded-lg'}`}
        accessibilityRole="tablist"
      >
        {segments.map((segment) => {
          const selected = activeKey === segment.key;
          const selectedFill = accent ? 'bg-accent-primary' : 'bg-surface';
          const labelColor = selected
            ? accent
              ? 'text-white'
              : 'text-text-primary'
            : accent
              ? 'text-text-secondary'
              : 'text-text-muted';
          return (
            <TouchableOpacity
              key={segment.key}
              testID={testID ? `${testID}-${segment.key}` : undefined}
              onPress={() => onSelect(segment.key)}
              className={`flex-1 flex-row py-2 items-center ${
                accent ? 'rounded-lg' : 'rounded-md'
              } ${selected ? selectedFill : ''} justify-center gap-1.5`}
              style={
                selected && segment.color && !accent
                  ? { borderWidth: 1.5, borderColor: segment.color }
                  : undefined
              }
              activeOpacity={0.7}
              accessibilityRole="tab"
              accessibilityLabel={segment.label}
              accessibilityState={{ selected }}
            >
              {segment.color && (
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: segment.color,
                    opacity: selected ? 1 : 0.5,
                  }}
                />
              )}
              <Text
                className={`text-sm ${
                  selected ? 'font-semibold' : 'font-medium'
                } ${labelColor}`}
                numberOfLines={1}
              >
                {segment.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

export default SegmentedControl;
