import React, { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useDerivedValue, useSharedValue } from 'react-native-reanimated';

import {
  DASHBOARD_CARD_TITLES,
  type DashboardCardKey,
} from '../constants/dashboardCards';
import { moveItem } from '../utils/reorderUtils';
import { ReorderSwitchRow } from './ReorderSwitchRow';
import {
  computeReorderTargetIndex,
  resetReorderDragPreview,
  useReorderRowGeometry,
} from './WorkoutReorderList';

export const DASHBOARD_CARD_ROW_HEIGHT = 72;

interface DashboardCardReorderListProps {
  cards: DashboardCardKey[];
  /** Prefix of each row's test ids, e.g. `dashboard-card` gives `dashboard-card-row-macros`. */
  testIDPrefix: string;
  subtitle: (key: DashboardCardKey) => string;
  isEnabled: (key: DashboardCardKey) => boolean;
  onToggle: (key: DashboardCardKey, enabled: boolean) => void;
  onReorder: (order: DashboardCardKey[]) => void;
  onConfigure?: (key: DashboardCardKey) => (() => void) | undefined;
}

/**
 * One card of drag-to-reorder rows with a switch each, as Dashboard Settings shows for
 * the whole Dashboard or for one tab. Each list owns its own drag state, so several can
 * sit on one screen.
 */
const DashboardCardReorderList: React.FC<DashboardCardReorderListProps> = ({
  cards,
  testIDPrefix,
  subtitle,
  isEnabled,
  onToggle,
  onReorder,
  onConfigure,
}) => {
  const { t } = useTranslation();
  const { strides, offsets } = useReorderRowGeometry(
    cards.length,
    DASHBOARD_CARD_ROW_HEIGHT
  );
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
      onReorder(moveItem(cards, fromIndex, toIndex));
    },
    [cards, onReorder]
  );

  // Release the floating transform only once the reordered rows have rendered, so
  // clearing it is a visual no-op instead of a one-frame snap-back.
  useEffect(() => {
    if (!pendingDragResetRef.current) return;
    pendingDragResetRef.current = false;
    resetReorderDragPreview(activeDragIndex, panY, committingTranslate);
  }, [cards, committingTranslate, activeDragIndex, panY]);

  return (
    <View className="bg-surface rounded-xl overflow-hidden shadow-sm">
      {cards.map((cardKey, index) => {
        const title = DASHBOARD_CARD_TITLES[cardKey](t);
        return (
          <ReorderSwitchRow
            key={cardKey}
            testID={`${testIDPrefix}-row-${cardKey}`}
            dragHandleTestID={`${testIDPrefix}-drag-handle-${cardKey}`}
            switchTestID={`${testIDPrefix}-switch-${cardKey}`}
            index={index}
            lastIndex={cards.length - 1}
            title={title}
            subtitle={subtitle(cardKey)}
            isEnabled={isEnabled(cardKey)}
            onToggle={(enabled) => onToggle(cardKey, enabled)}
            onMove={handleMove}
            onConfigure={onConfigure?.(cardKey)}
            configureTestID={`${testIDPrefix}-configure-${cardKey}`}
            configureA11yLabel={t('dashboardSettings.configureCard', {
              defaultValue: 'Configure {{name}}',
              name: title,
            })}
            rowHeight={DASHBOARD_CARD_ROW_HEIGHT}
            reorderA11yLabel={t('dashboardSettings.reorder', {
              defaultValue: 'Reorder {{name}}',
              name: title,
            })}
            reorderA11yHint={t('dashboardSettings.reorderHint', {
              defaultValue: 'Reorder this card on your Dashboard',
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
  );
};

export default DashboardCardReorderList;
