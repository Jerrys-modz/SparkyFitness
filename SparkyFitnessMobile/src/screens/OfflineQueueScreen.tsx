import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, Text, View } from 'react-native';
import Toast from 'react-native-toast-message';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Button from '../components/ui/Button';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useOfflineQueueStatus } from '../hooks/useOfflineQueueStatus';
import { itemsForConfig } from '../services/offlineQueue/queueLogic';
import { discardAttentionItem } from '../services/offlineQueue/queueActions';
import { drainQueue } from '../services/offlineQueue/queueRunner';
import type { AttentionItem, QueueItem } from '../services/offlineQueue/types';
import { useOfflineQueueStore } from '../stores/offlineQueueStore';
import { formatShortDate } from '../utils/dateUtils';
import type { RootStackScreenProps } from '../types/navigation';

type OfflineQueueScreenProps = RootStackScreenProps<'OfflineQueue'>;

function useItemLabels() {
  const { t, i18n } = useTranslation();
  return useCallback(
    (item: QueueItem): { title: string; subtitle: string } => {
      const day = formatShortDate(item.entryDate, i18n.language);
      switch (item.kind) {
        case 'food_entry':
          return {
            title:
              item.preview.food_name ??
              t('foodRow.unknownFood', { defaultValue: 'Unknown food' }),
            subtitle: `${item.preview.quantity} ${item.preview.unit} · ${item.preview.meal_type} · ${day}`,
          };
        case 'water':
          return {
            title: t('offlineQueue.items.water', { defaultValue: 'Water' }),
            subtitle: `${t('offlineQueue.items.oneDrink', {
              defaultValue: '1 drink',
            })} · ${day}`,
          };
        case 'check_in':
          return {
            title: t('offlineQueue.items.measurements', {
              defaultValue: 'Measurements',
            }),
            subtitle: day,
          };
      }
    },
    [t, i18n.language]
  );
}

const ItemRow: React.FC<{
  item: QueueItem | AttentionItem;
  title: string;
  subtitle: string;
  detail?: string | null;
  action?: { label: string; onPress: () => void };
}> = ({ title, subtitle, detail, action }) => (
  <View className="flex-row items-center bg-surface rounded-xl px-4 py-3 mb-2">
    <View className="flex-1 mr-3">
      <Text className="text-md text-text-primary" numberOfLines={1}>
        {title}
      </Text>
      <Text className="text-sm text-text-secondary" numberOfLines={1}>
        {subtitle}
      </Text>
      {detail ? (
        <Text className="text-xs text-text-muted mt-1" numberOfLines={3}>
          {detail}
        </Text>
      ) : null}
    </View>
    {action ? (
      <Button variant="ghost" onPress={action.onPress} className="py-0 px-0">
        {action.label}
      </Button>
    ) : null}
  </View>
);

const OfflineQueueScreen: React.FC<OfflineQueueScreenProps> = () => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding();
  const labelFor = useItemLabels();
  const status = useOfflineQueueStatus();
  const items = useOfflineQueueStore((s) => s.items);
  const attention = useOfflineQueueStore((s) => s.attention);
  const configId = useOfflineQueueStore((s) => s.activeConfigId);
  const [syncing, setSyncing] = useState(false);

  const pending = useMemo(
    () => itemsForConfig(items, configId),
    [items, configId]
  );
  const needsAttention = useMemo(
    () => attention.filter((item) => item.configId === configId),
    [attention, configId]
  );

  const header = useScreenHeader({
    title: t('offlineQueue.screen.title', { defaultValue: 'Offline entries' }),
    left: { kind: 'back' },
  });

  const syncNow = async () => {
    setSyncing(true);
    try {
      const result = await drainQueue({ force: true });
      if (result.stopped === 'done') {
        Toast.show({
          type: 'success',
          text1: t('offlineQueue.screen.synced', {
            defaultValue: 'Synced {{count}} entries',
            defaultValue_one: 'Synced {{count}} entry',
            defaultValue_other: 'Synced {{count}} entries',
            count: result.sent,
          }),
        });
      } else {
        Toast.show({
          type: 'info',
          text1:
            result.stopped === 'auth'
              ? t('offlineQueue.screen.signInAgain', {
                  defaultValue: 'Sign in again to sync',
                })
              : result.stopped === 'retry'
                ? t('offlineQueue.screen.serverError', {
                    defaultValue: 'Your server had a problem. It will retry.',
                  })
                : t('offlineQueue.screen.stillOffline', {
                    defaultValue: "Can't reach your server yet",
                  }),
        });
      }
    } finally {
      setSyncing(false);
    }
  };

  const confirmDiscard = (item: AttentionItem) => {
    Alert.alert(
      t('offlineQueue.screen.discardTitle', { defaultValue: 'Discard entry?' }),
      t('offlineQueue.screen.discardMessage', {
        defaultValue:
          'It was not saved to your server and cannot be recovered after this.',
      }),
      [
        {
          text: t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
        {
          text: t('offlineQueue.screen.discard', { defaultValue: 'Discard' }),
          style: 'destructive',
          onPress: () => void discardAttentionItem(item.id),
        },
      ]
    );
  };

  const reasonText = (item: AttentionItem): string =>
    item.reason === 'account_mismatch'
      ? t('offlineQueue.screen.accountMismatch', {
          defaultValue:
            'Made while signed in as a different account, so it was not sent.',
        })
      : item.message;

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 16 + activeWorkoutBarPadding,
        }}
      >
        {pending.length > 0 ? (
          <Button
            variant="primary"
            onPress={() => void syncNow()}
            loading={syncing || status.isSyncing}
            disabled={syncing || status.isSyncing}
            className="py-3 mb-4"
          >
            {t('offlineQueue.screen.syncNow', { defaultValue: 'Sync now' })}
          </Button>
        ) : null}

        {needsAttention.length > 0 ? (
          <>
            <Text className="text-xs font-semibold uppercase text-text-muted mb-2">
              {t('offlineQueue.screen.needsAttention', {
                defaultValue: 'Needs attention',
              })}
            </Text>
            {needsAttention.map((item) => {
              const labels = labelFor(item);
              return (
                <ItemRow
                  key={item.id}
                  item={item}
                  title={labels.title}
                  subtitle={labels.subtitle}
                  detail={reasonText(item)}
                  action={{
                    label: t('offlineQueue.screen.discard', {
                      defaultValue: 'Discard',
                    }),
                    onPress: () => confirmDiscard(item),
                  }}
                />
              );
            })}
          </>
        ) : null}

        {pending.length > 0 ? (
          <>
            <Text className="text-xs font-semibold uppercase text-text-muted mt-2 mb-2">
              {t('offlineQueue.screen.waiting', {
                defaultValue: 'Waiting to sync',
              })}
            </Text>
            {pending.map((item) => {
              const labels = labelFor(item);
              return (
                <ItemRow
                  key={item.id}
                  item={item}
                  title={labels.title}
                  subtitle={labels.subtitle}
                  detail={item.lastError}
                />
              );
            })}
          </>
        ) : null}

        {pending.length === 0 && needsAttention.length === 0 ? (
          <Text className="text-text-secondary text-base text-center mt-12">
            {t('offlineQueue.screen.empty', {
              defaultValue: 'Nothing is waiting to sync.',
            })}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
};

export default OfflineQueueScreen;
