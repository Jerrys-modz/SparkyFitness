import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';

/** Marks a diary entry that is still waiting in the offline queue. */
const PendingSyncBadge: React.FC = () => {
  const { t } = useTranslation();
  const textMuted = useCSSVariable('--color-text-muted') as string;
  return (
    <View
      className="flex-row items-center mt-0.5"
      accessibilityLabel={t('offlineQueue.pendingEntry.title', {
        defaultValue: 'Waiting to sync',
      })}
    >
      <Icon name="sync" size={12} color={textMuted} />
      <Text className="text-xs text-text-muted ml-1">
        {t('offlineQueue.pendingEntry.title', {
          defaultValue: 'Waiting to sync',
        })}
      </Text>
    </View>
  );
};

export default PendingSyncBadge;
