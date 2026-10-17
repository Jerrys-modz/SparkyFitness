import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';

import Icon from './Icon';
import { navigationRef } from './ActiveWorkoutBar';
import { useActiveWorkoutStore } from '../stores/activeWorkoutStore';
import {
  useOfflineQueueStatus,
  type OfflineQueueStatus,
} from '../hooks/useOfflineQueueStatus';

/** The line the banner shows, or null when there is nothing to say. */
export function bannerMessage(
  status: OfflineQueueStatus,
  t: ReturnType<typeof useTranslation>['t']
): string | null {
  const { pendingCount, attentionCount, isOffline, isSyncing } = status;
  if (pendingCount > 0) {
    const text = isOffline
      ? t('offlineQueue.banner.offlineWaiting', {
          defaultValue: 'Offline, {{count}} waiting to sync',
          defaultValue_one: 'Offline, {{count}} waiting to sync',
          defaultValue_other: 'Offline, {{count}} waiting to sync',
          count: pendingCount,
        })
      : isSyncing
        ? t('offlineQueue.banner.syncing', {
            defaultValue: 'Syncing {{count}}...',
            defaultValue_one: 'Syncing {{count}}...',
            defaultValue_other: 'Syncing {{count}}...',
            count: pendingCount,
          })
        : t('offlineQueue.banner.waiting', {
            defaultValue: '{{count}} waiting to sync',
            defaultValue_one: '{{count}} waiting to sync',
            defaultValue_other: '{{count}} waiting to sync',
            count: pendingCount,
          });
    if (attentionCount === 0) return text;
    return `${text} · ${t('offlineQueue.banner.needsAttention', {
      defaultValue: '{{count}} need attention',
      defaultValue_one: '{{count}} needs attention',
      defaultValue_other: '{{count}} need attention',
      count: attentionCount,
    })}`;
  }
  if (attentionCount > 0) {
    return t('offlineQueue.banner.needsAttention', {
      defaultValue: '{{count}} need attention',
      defaultValue_one: '{{count}} needs attention',
      defaultValue_other: '{{count}} need attention',
      count: attentionCount,
    });
  }
  if (isOffline) {
    return t('offlineQueue.banner.offline', { defaultValue: "You're offline" });
  }
  return null;
}

/**
 * A slim strip that appears only when there is something to say: the device
 * is offline, entries are waiting to sync, or some need attention. Tapping it
 * opens the queue screen.
 */
const OfflineQueueBanner: React.FC<{ reserveAddButtonClearance?: boolean }> = ({
  reserveAddButtonClearance = false,
}) => {
  const { t } = useTranslation();
  const workoutActive = useActiveWorkoutStore((s) => s.sessionId !== null);
  const status = useOfflineQueueStatus();
  const [textSecondary, warning] = useCSSVariable([
    '--color-text-secondary',
    '--color-warning',
  ]) as [string, string];
  const message = bannerMessage(status, t);
  if (!message) return null;

  const needsAttention = status.attentionCount > 0;
  return (
    <View
      className="bg-chrome border-t border-chrome-border"
      // CustomTabBar's floating Add button rises 20pt above the bar, unless a
      // workout bar sits between.
      style={{
        paddingBottom: reserveAddButtonClearance && !workoutActive ? 20 : 0,
      }}
    >
      <Pressable
        onPress={() => {
          if (navigationRef.isReady()) navigationRef.navigate('OfflineQueue');
        }}
        accessibilityRole="button"
        accessibilityLabel={message}
        className="flex-row items-center px-4 py-2"
      >
        <Icon
          name={
            needsAttention
              ? 'alert-circle'
              : status.isOffline
                ? 'cloud-offline'
                : 'sync'
          }
          size={16}
          color={needsAttention ? warning : textSecondary}
        />
        <Text
          numberOfLines={1}
          className="flex-1 ml-2 text-xs font-medium text-text-secondary"
        >
          {message}
        </Text>
        <Icon name="chevron-forward" size={14} color={textSecondary} />
      </Pressable>
    </View>
  );
};

export default OfflineQueueBanner;
