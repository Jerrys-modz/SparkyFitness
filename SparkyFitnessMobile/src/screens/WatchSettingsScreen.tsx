import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { useDerivedValue, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { ReorderSwitchRow } from '../components/ReorderSwitchRow';
import {
  computeReorderTargetIndex,
  REORDER_ROW_HEIGHT,
  resetReorderDragPreview,
  useReorderRowGeometry,
} from '../components/WorkoutReorderList';
import { WATCH_PAGE_KEYS, WATCH_PAGE_LABELS } from '../constants/watchPages';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import type { RootStackScreenProps } from '../types/navigation';
import { moveItem, resolveKeyOrder } from '../utils/reorderUtils';

type WatchSettingsScreenProps = RootStackScreenProps<'WatchSettings'>;

// One height for every row, so the drag geometry has a single stride.
const ROW_HEIGHT = REORDER_ROW_HEIGHT;

/**
 * Which pages the Apple Watch app shows and the order you swipe through them.
 * Stored on the phone and sent to the watch in its context push
 * (`useWatchCheckInBridge`), so a change reaches the wrist the next time the
 * two talk.
 */
const WatchSettingsScreen: React.FC<WatchSettingsScreenProps> = () => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();

  const watchPageOrder = useAppPreferencesStore((s) => s.watchPageOrder);
  const hiddenWatchPages = useAppPreferencesStore((s) => s.hiddenWatchPages);
  const setWatchPageOrder = useAppPreferencesStore((s) => s.setWatchPageOrder);
  const setWatchPageHidden = useAppPreferencesStore(
    (s) => s.setWatchPageHidden
  );

  const orderedKeys = useMemo(
    () => resolveKeyOrder(watchPageOrder, WATCH_PAGE_KEYS),
    [watchPageOrder]
  );
  const shownCount = orderedKeys.filter(
    (key) => !hiddenWatchPages.includes(key)
  ).length;

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
      pendingDragResetRef.current = true;
      setWatchPageOrder(moveItem(orderedKeys, fromIndex, toIndex));
    },
    [orderedKeys, setWatchPageOrder]
  );

  // Release the floating transform only once the reordered rows have rendered,
  // so clearing it is a visual no-op instead of a one-frame snap-back.
  useEffect(() => {
    if (!pendingDragResetRef.current) return;
    pendingDragResetRef.current = false;
    resetReorderDragPreview(activeDragIndex, panY, committingTranslate);
  }, [orderedKeys, committingTranslate, activeDragIndex, panY]);

  const header = useScreenHeader({
    title: t('screens.watchSettings', { defaultValue: 'Apple Watch' }),
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
          {t('watchSettings.description', {
            defaultValue:
              'Drag a page by its handle to change the order you swipe through them on your watch. Toggle a page off to hide it. The Workout page still appears while a workout is running.',
          })}
        </Text>

        <View className="bg-surface rounded-xl overflow-hidden shadow-sm">
          {orderedKeys.map((pageKey, index) => {
            const label = WATCH_PAGE_LABELS[pageKey](t);
            const isShown = !hiddenWatchPages.includes(pageKey);
            return (
              <ReorderSwitchRow
                key={pageKey}
                testID={`watch-page-row-${pageKey}`}
                dragHandleTestID={`watch-page-drag-handle-${pageKey}`}
                switchTestID={`watch-page-switch-${pageKey}`}
                index={index}
                lastIndex={orderedKeys.length - 1}
                title={label}
                isEnabled={isShown}
                // The watch needs at least one page to land on.
                switchDisabled={isShown && shownCount <= 1}
                onToggle={(enabled) => setWatchPageHidden(pageKey, !enabled)}
                onMove={handleMove}
                rowHeight={ROW_HEIGHT}
                reorderA11yLabel={t('watchSettings.reorder', {
                  defaultValue: 'Reorder {{name}}',
                  name: label,
                })}
                reorderA11yHint={t('watchSettings.reorderHint', {
                  defaultValue: 'Changes where this page sits on your watch',
                })}
                activeDragIndex={activeDragIndex}
                panY={panY}
                committingTranslate={committingTranslate}
                targetIndex={targetIndex}
                strides={strides}
              />
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
};

export default WatchSettingsScreen;
