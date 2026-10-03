import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import Switch from '../components/ui/Switch';
import { useActiveAiServiceSetting } from '../hooks/useActiveAiServiceSetting';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { isOnDeviceLabelScanAvailable } from '../services/onDeviceLabelScan';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import type { RootStackScreenProps } from '../types/navigation';

type AiSettingsScreenProps = RootStackScreenProps<'AiSettings'>;

function ToggleCard({
  title,
  description,
  value,
  onValueChange,
  testID,
}: {
  title: string;
  description: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  testID: string;
}) {
  return (
    <View className="bg-surface rounded-xl p-3 mb-4 shadow-sm">
      <View className="flex-row justify-between items-center">
        <Text className="text-base font-semibold text-text-primary flex-shrink">
          {title}
        </Text>
        <Switch testID={testID} onValueChange={onValueChange} value={value} />
      </View>
      <Text className="text-text-secondary text-sm mt-4">{description}</Text>
    </View>
  );
}

const AiSettingsScreen: React.FC<AiSettingsScreenProps> = () => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();
  const { data: provider, isLoading } = useActiveAiServiceSetting();

  const onDeviceLabelScanEnabled = useAppPreferencesStore(
    (s) => s.onDeviceLabelScanEnabled
  );
  const setOnDeviceLabelScanEnabled = useAppPreferencesStore(
    (s) => s.setOnDeviceLabelScanEnabled
  );
  const onDeviceFoodPhotoEnabled = useAppPreferencesStore(
    (s) => s.onDeviceFoodPhotoEnabled
  );
  const setOnDeviceFoodPhotoEnabled = useAppPreferencesStore(
    (s) => s.setOnDeviceFoodPhotoEnabled
  );
  const onDeviceChatEnabled = useAppPreferencesStore(
    (s) => s.onDeviceChatEnabled
  );
  const setOnDeviceChatEnabled = useAppPreferencesStore(
    (s) => s.setOnDeviceChatEnabled
  );
  const onDeviceAvailable = useMemo(() => isOnDeviceLabelScanAvailable(), []);

  const header = useScreenHeader({
    title: t('screens.aiSettings', { defaultValue: 'AI' }),
    left: { kind: 'back' },
  });

  const providerText = isLoading
    ? t('aiSettings.server.loading', { defaultValue: 'Checking…' })
    : provider
      ? `${provider.service_name}${provider.model_name ? ` · ${provider.model_name}` : ''}`
      : t('aiSettings.server.none', {
          defaultValue: 'No AI provider is configured',
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
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
        contentInsetAdjustmentBehavior={
          usesNativeHeader ? 'automatic' : 'never'
        }
      >
        <Text className="text-text-primary text-base font-semibold mb-1">
          {t('aiSettings.server.title', { defaultValue: 'Server AI provider' })}
        </Text>
        <View className="bg-surface rounded-xl p-3 mb-6 shadow-sm">
          <Text
            testID="ai-settings-provider"
            className="text-text-primary text-base"
          >
            {providerText}
          </Text>
          <Text className="text-text-secondary text-sm mt-2">
            {t('aiSettings.server.description', {
              defaultValue:
                'Used for chat, food photos and label scans unless an on-device option below handles them. Providers are set up in the web app.',
            })}
          </Text>
        </View>

        <Text className="text-text-primary text-base font-semibold mb-1">
          {t('aiSettings.onDevice.title', {
            defaultValue: 'On-device (Apple Intelligence)',
          })}
        </Text>
        {onDeviceAvailable ? (
          <>
            <Text className="text-text-secondary text-sm mb-3">
              {t('aiSettings.onDevice.description', {
                defaultValue:
                  'These run on this phone. Anything the on-device model cannot handle falls back to the server provider.',
              })}
            </Text>
            <ToggleCard
              testID="ai-label-scan-switch"
              title={t('foodSettings.onDeviceLabelScan.title', {
                defaultValue: 'Scan Labels On Device',
              })}
              description={t('foodSettings.onDeviceLabelScan.description', {
                defaultValue:
                  'Read nutrition labels with Apple Intelligence on this device. If it cannot read a label, the server AI provider is used instead.',
              })}
              value={onDeviceLabelScanEnabled}
              onValueChange={setOnDeviceLabelScanEnabled}
            />
            <ToggleCard
              testID="ai-food-photo-switch"
              title={t('foodSettings.onDeviceFoodPhoto.title', {
                defaultValue: 'Estimate Food Photos On Device',
              })}
              description={t('foodSettings.onDeviceFoodPhoto.description', {
                defaultValue:
                  'Estimate a single meal photo with Apple Intelligence on this device. It is rougher than your server AI provider and does not match foods in your library. Photos with more than one picture, or that it cannot estimate, use the server AI provider.',
              })}
              value={onDeviceFoodPhotoEnabled}
              onValueChange={setOnDeviceFoodPhotoEnabled}
            />
            <ToggleCard
              testID="ai-chat-switch"
              title={t('foodSettings.onDeviceChat.title', {
                defaultValue: 'Sparky Chat On Device',
              })}
              description={t('foodSettings.onDeviceChat.description', {
                defaultValue:
                  'Answer Sparky chat with Apple Intelligence on this device. It can read your diary and, after you confirm, log food, water or weight, or delete an entry. It is less capable than your server AI provider and chats are not saved.',
              })}
              value={onDeviceChatEnabled}
              onValueChange={setOnDeviceChatEnabled}
            />
          </>
        ) : (
          <Text className="text-text-secondary text-sm">
            {t('aiSettings.onDevice.unavailable', {
              defaultValue:
                'Not available on this device. It needs iOS 27 or later with Apple Intelligence turned on and ready.',
            })}
          </Text>
        )}
      </ScrollView>
    </View>
  );
};

export default AiSettingsScreen;
