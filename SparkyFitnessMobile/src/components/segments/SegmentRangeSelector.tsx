import React, { useCallback, useRef, useState } from 'react';
import { Pressable, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useTranslation } from 'react-i18next';
import { useCSSVariable } from 'uniwind';
import {
  formatRouteDistance,
  type DistanceUnit,
} from '../../utils/routeDisplay';
import {
  distanceAtBarPosition,
  handleFraction,
  moveSegmentHandle,
  nudgeSegmentHandle,
  segmentRangeLength,
  type SegmentRange,
} from '../../utils/segmentRange';

const THUMB = 26;
const BAR_HEIGHT = 8;

interface SegmentRangeSelectorProps {
  /** Length of the whole line, in metres. */
  totalM: number;
  range: SegmentRange;
  onChange: (range: SegmentRange) => void;
  unit: DistanceUnit;
}

/**
 * Picks the start and end of a segment by dragging two handles along a bar
 * that stands for the whole line. A drag moves the handle nearest the touch;
 * the nudge buttons move one by 50 m for precision and for screen readers.
 */
const SegmentRangeSelector: React.FC<SegmentRangeSelectorProps> = ({
  totalM,
  range,
  onChange,
  unit,
}) => {
  const { t } = useTranslation();
  const [accent, track] = useCSSVariable([
    '--color-accent-primary',
    '--color-raised',
  ]) as [string, string];
  const [width, setWidth] = useState(0);
  const active = useRef<'start' | 'end' | null>(null);
  const rangeRef = useRef(range);
  rangeRef.current = range;

  const usable = Math.max(1, width - THUMB);
  const toX = (valueM: number) =>
    handleFraction(valueM, totalM) * usable + THUMB / 2;

  const applyTouch = useCallback(
    (x: number, begin: boolean) => {
      const current = rangeRef.current;
      const at = distanceAtBarPosition(x - THUMB / 2, usable, totalM);
      if (begin) {
        active.current =
          Math.abs(at - current.startM) <= Math.abs(at - current.endM)
            ? 'start'
            : 'end';
      }
      if (!active.current) return;
      const next = moveSegmentHandle(current, active.current, at, totalM);
      if (next.startM !== current.startM || next.endM !== current.endM) {
        onChange(next);
      }
    },
    [onChange, totalM, usable]
  );

  const pan = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .activeOffsetX([-4, 4])
    .failOffsetY([-14, 14])
    .onBegin((event) => applyTouch(event.x, true))
    .onUpdate((event) => applyTouch(event.x, false))
    .onFinalize(() => {
      active.current = null;
    });

  const nudge = (handle: 'start' | 'end', direction: -1 | 1) =>
    onChange(nudgeSegmentHandle(range, handle, direction, totalM));

  const label = (m: number) => formatRouteDistance(m, unit);
  const startX = toX(range.startM);
  const endX = toX(range.endM);

  const nudgeButton = (
    handle: 'start' | 'end',
    direction: -1 | 1,
    accessibilityLabel: string
  ) => (
    <Pressable
      onPress={() => nudge(handle, direction)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      testID={`segment-nudge-${handle}-${direction < 0 ? 'back' : 'forward'}`}
      className="bg-raised rounded-lg px-3 py-2"
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
    >
      <Text className="text-accent-primary text-base font-semibold">
        {direction < 0 ? '−' : '+'}
      </Text>
    </Pressable>
  );

  return (
    <View testID="segment-range-selector">
      <GestureDetector gesture={pan}>
        <View
          onLayout={(event: LayoutChangeEvent) =>
            setWidth(event.nativeEvent.layout.width)
          }
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={t('segments.create.rangeA11y', {
            start: label(range.startM),
            end: label(range.endM),
            defaultValue:
              'Segment from {{start}} to {{end}} along the line. Drag a handle to change it.',
          })}
          testID="segment-range-bar"
          style={{ height: 48, justifyContent: 'center' }}
        >
          <View
            style={{
              height: BAR_HEIGHT,
              borderRadius: BAR_HEIGHT / 2,
              backgroundColor: track,
              marginHorizontal: THUMB / 2,
            }}
          />
          <View
            style={{
              position: 'absolute',
              left: startX,
              width: Math.max(0, endX - startX),
              height: BAR_HEIGHT,
              borderRadius: BAR_HEIGHT / 2,
              backgroundColor: accent,
            }}
          />
          {[startX, endX].map((x, index) => (
            <View
              key={index}
              testID={
                index === 0 ? 'segment-handle-start' : 'segment-handle-end'
              }
              style={{
                position: 'absolute',
                left: x - THUMB / 2,
                width: THUMB,
                height: THUMB,
                borderRadius: THUMB / 2,
                backgroundColor: '#ffffff',
                borderWidth: 3,
                borderColor: accent,
              }}
            />
          ))}
        </View>
      </GestureDetector>
      <View className="flex-row justify-between items-center mt-2">
        <View className="flex-row items-center gap-2">
          {nudgeButton(
            'start',
            -1,
            t('segments.create.startEarlier', {
              defaultValue: 'Move the start earlier',
            })
          )}
          <View>
            <Text className="text-text-secondary text-xs">
              {t('segments.create.start', { defaultValue: 'Start' })}
            </Text>
            <Text
              className="text-text-primary text-sm font-semibold"
              testID="segment-start-label"
            >
              {label(range.startM)}
            </Text>
          </View>
          {nudgeButton(
            'start',
            1,
            t('segments.create.startLater', {
              defaultValue: 'Move the start later',
            })
          )}
        </View>
        <View className="flex-row items-center gap-2">
          {nudgeButton(
            'end',
            -1,
            t('segments.create.endEarlier', {
              defaultValue: 'Move the end earlier',
            })
          )}
          <View className="items-end">
            <Text className="text-text-secondary text-xs">
              {t('segments.create.end', { defaultValue: 'End' })}
            </Text>
            <Text
              className="text-text-primary text-sm font-semibold"
              testID="segment-end-label"
            >
              {label(range.endM)}
            </Text>
          </View>
          {nudgeButton(
            'end',
            1,
            t('segments.create.endLater', {
              defaultValue: 'Move the end later',
            })
          )}
        </View>
      </View>
      <Text
        className="text-text-secondary text-sm text-center mt-2"
        testID="segment-length-label"
      >
        {t('segments.create.length', {
          distance: label(segmentRangeLength(range)),
          defaultValue: 'Segment length {{distance}}',
        })}
      </Text>
    </View>
  );
};

export default SegmentRangeSelector;
