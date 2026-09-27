import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ScrollView,
  Text,
  View,
  type AccessibilityActionEvent,
} from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useDerivedValue,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';

import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import Icon from '../components/Icon';
import Switch from '../components/ui/Switch';
import {
  computeReorderTargetIndex,
  createReorderRowPanGesture,
  REORDER_ROW_HEIGHT,
  resetReorderDragPreview,
  useReorderRowGeometry,
  useReorderRowPreviewStyle,
} from '../components/WorkoutReorderList';
import {
  HEALTH_TREND_LABELS,
  type HealthTrendKey,
} from '../constants/healthTrends';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import type { RootStackScreenProps } from '../types/navigation';
import {
  applyHealthTrendOrderMove,
  resolveHealthTrendOrder,
} from '../utils/healthTrendPreferences';

type HealthTrendsSettingsScreenProps =
  RootStackScreenProps<'HealthTrendsSettings'>;

const ROW_HEIGHT = REORDER_ROW_HEIGHT;

const HealthTrendListRow: React.FC<{
  trendKey: HealthTrendKey;
  index: number;
  lastIndex: number;
  label: string;
  isEnabled: boolean;
  onToggle: (enabled: boolean) => void;
  onMove: (fromIndex: number, toIndex: number) => void;
  textMuted: string;
  activeDragIndex: SharedValue<number>;
  panY: SharedValue<number>;
  committingTranslate: SharedValue<number>;
  targetIndex: SharedValue<number>;
  strides: number[];
}> = ({
  trendKey,
  index,
  lastIndex,
  label,
  isEnabled,
  onToggle,
  onMove,
  textMuted,
  activeDragIndex,
  panY,
  committingTranslate,
  targetIndex,
  strides,
}) => {
  const { t } = useTranslation();

  const dragGesture = createReorderRowPanGesture({
    index,
    activeDragIndex,
    panY,
    committingTranslate,
    targetIndex,
    onMove,
  });

  const previewStyle = useReorderRowPreviewStyle(
    index,
    activeDragIndex,
    panY,
    committingTranslate,
    targetIndex,
    strides
  );

  const handleAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'increment') {
      onMove(index, Math.min(index + 1, lastIndex));
      return;
    }
    if (event.nativeEvent.actionName === 'decrement') {
      onMove(index, Math.max(index - 1, 0));
    }
  };

  return (
    <Animated.View
      testID={`health-trend-row-${trendKey}`}
      className="flex-row items-center bg-surface border-b border-border/40 pr-4"
      style={[previewStyle, { height: ROW_HEIGHT }]}
    >
      <GestureDetector gesture={dragGesture}>
        <View
          testID={`health-trend-drag-handle-${trendKey}`}
          className="px-4 py-3"
          accessibilityRole="adjustable"
          accessibilityLabel={t('healthTrendsSettings.reorder', {
            defaultValue: 'Reorder {{name}}',
            name: label,
          })}
          accessibilityValue={{
            text: isEnabled
              ? t('healthTrendsSettings.stateShown', { defaultValue: 'Shown' })
              : t('healthTrendsSettings.stateHidden', {
                  defaultValue: 'Hidden',
                }),
          }}
          accessibilityHint={t('healthTrendsSettings.reorderHint', {
            defaultValue: 'Reorder this graph in your Dashboard health trends',
          })}
          accessibilityActions={[
            {
              name: 'decrement',
              label: t('healthTrendsSettings.moveUp', {
                defaultValue: 'Move up',
              }),
            },
            {
              name: 'increment',
              label: t('healthTrendsSettings.moveDown', {
                defaultValue: 'Move down',
              }),
            },
          ]}
          onAccessibilityAction={handleAccessibilityAction}
        >
          <Icon name="reorder-handle" size={22} color={textMuted} />
        </View>
      </GestureDetector>

      <Text
        className={`flex-1 pr-3 text-base font-medium ${
          isEnabled ? 'text-text-primary' : 'text-text-muted'
        }`}
        numberOfLines={1}
      >
        {label}
      </Text>

      <Switch
        accessibilityLabel={label}
        value={isEnabled}
        onValueChange={onToggle}
        testID={`health-trend-switch-${trendKey}`}
      />
    </Animated.View>
  );
};

const HealthTrendsSettingsScreen: React.FC<
  HealthTrendsSettingsScreenProps
> = () => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();
  const textMuted = String(useCSSVariable('--color-text-muted'));

  const healthTrendOrder = useAppPreferencesStore((s) => s.healthTrendOrder);
  const hiddenHealthTrends = useAppPreferencesStore(
    (s) => s.hiddenHealthTrends
  );
  const setHealthTrendOrder = useAppPreferencesStore(
    (s) => s.setHealthTrendOrder
  );
  const setHealthTrendHidden = useAppPreferencesStore(
    (s) => s.setHealthTrendHidden
  );

  const orderedKeys = useMemo(
    () => resolveHealthTrendOrder(healthTrendOrder),
    [healthTrendOrder]
  );

  const { strides, offsets } = useReorderRowGeometry(orderedKeys.length);

  const activeDragIndex = useSharedValue(-1);
  const panY = useSharedValue(0);
  const committingTranslate = useSharedValue(0);
  const pendingDragResetRef = useRef(false);

  const targetIndex = useDerivedValue(() =>
    activeDragIndex.value < 0
      ? -1
      : computeReorderTargetIndex(
          strides,
          offsets,
          activeDragIndex.value,
          panY.value
        )
  );

  const handleMove = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) return;
      const newOrder = applyHealthTrendOrderMove(
        orderedKeys,
        fromIndex,
        toIndex
      );
      pendingDragResetRef.current = true;
      setHealthTrendOrder(newOrder);
    },
    [orderedKeys, setHealthTrendOrder]
  );

  useEffect(() => {
    if (!pendingDragResetRef.current) return;
    pendingDragResetRef.current = false;
    resetReorderDragPreview(activeDragIndex, panY, committingTranslate);
  }, [orderedKeys, committingTranslate, activeDragIndex, panY]);

  const header = useScreenHeader({
    title: t('screens.healthTrendsSettings', { defaultValue: 'Health Trends' }),
    left: { kind: 'back' },
  });

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingTop: 16,
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
        contentInsetAdjustmentBehavior={
          usesNativeHeader ? 'automatic' : 'never'
        }
      >
        <Text className="text-text-secondary text-sm mb-4">
          {t('healthTrendsSettings.description', {
            defaultValue:
              'Drag a graph by its handle to reorder it. Toggle off to hide it from your Dashboard.',
          })}
        </Text>

        <View className="bg-surface rounded-xl overflow-hidden shadow-sm">
          {orderedKeys.map((trendKey, index) => (
            <HealthTrendListRow
              key={trendKey}
              trendKey={trendKey}
              index={index}
              lastIndex={orderedKeys.length - 1}
              label={HEALTH_TREND_LABELS[trendKey](t)}
              isEnabled={!hiddenHealthTrends.includes(trendKey)}
              onToggle={(enabled) => setHealthTrendHidden(trendKey, !enabled)}
              onMove={handleMove}
              textMuted={textMuted}
              activeDragIndex={activeDragIndex}
              panY={panY}
              committingTranslate={committingTranslate}
              targetIndex={targetIndex}
              strides={strides}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
};

export default HealthTrendsSettingsScreen;
