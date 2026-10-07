import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, ScrollView, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';

import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import Switch from '../components/ui/Switch';
import {
  getOnDeviceModelInfo,
  getOnDeviceStatus,
} from '../services/onDeviceChat';
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
        <Switch
          testID={testID}
          accessibilityLabel={title}
          onValueChange={onValueChange}
          value={value}
        />
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
  const {
    data: provider,
    isLoading,
    isError,
  } = useActiveAiServiceSetting({
    throwOnFailure: true,
  });

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
  const onDeviceAvailable = useMemo(() => isOnDeviceLabelScanAvailable(), []);
  const onDeviceStatus = useMemo(() => getOnDeviceStatus(), []);
  const modelInfo = useMemo(() => getOnDeviceModelInfo(), []);
  const aiUserContext = useAppPreferencesStore((s) => s.aiUserContext);
  const setAiUserContext = useAppPreferencesStore((s) => s.setAiUserContext);
  const mutedColor = String(useCSSVariable('--color-text-muted'));
  const unavailableReason: Record<string, string> = {
    deviceNotEligible: t('aiSettings.onDevice.reason.deviceNotEligible', {
      defaultValue: 'This iPhone does not support Apple Intelligence.',
    }),
    appleIntelligenceNotEnabled: t(
      'aiSettings.onDevice.reason.appleIntelligenceNotEnabled',
      {
        defaultValue:
          'Turn on Apple Intelligence in the iPhone Settings app first.',
      }
    ),
    modelNotReady: t('aiSettings.onDevice.reason.modelNotReady', {
      defaultValue:
        'The on-device model is still downloading. Try again in a while.',
    }),
  };
  const header = useScreenHeader({
    title: t('screens.aiSettings', { defaultValue: 'AI' }),
    left: { kind: 'back' },
  });

  const providerText = isLoading
    ? t('aiSettings.server.loading', { defaultValue: 'Checking…' })
    : isError
      ? t('aiSettings.server.error', {
          defaultValue: 'Could not check the AI provider.',
        })
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
                'Used for food photos and label scans unless an on-device option below handles them. Providers are set up in the web app.',
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
            {modelInfo && (
              <Text
                testID="ai-model-info"
                className="text-text-primary text-sm mb-1"
              >
                {t('aiSettings.onDevice.model', {
                  defaultValue: '{{name}} · {{size}}-token window',
                  name: modelInfo.name,
                  size: modelInfo.contextSize.toLocaleString('en-US'),
                })}
              </Text>
            )}
            <Text className="text-text-secondary text-sm mb-3">
              {t('aiSettings.onDevice.description', {
                defaultValue:
                  'These run on this phone. Anything the on-device model cannot handle falls back to the server provider.',
              })}
            </Text>
            <ToggleCard
              testID="ai-label-scan-switch"
              title={t('aiSettings.onDevice.labelScan.title', {
                defaultValue: 'Scan Labels On Device',
              })}
              description={t('aiSettings.onDevice.labelScan.description', {
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
                  'Estimate a single meal photo with Apple Intelligence on this device. It is rougher than your server AI provider and does not match foods in your library. Up to 4 photos of one meal are read together; more than that, or a photo it cannot estimate, uses the server AI provider.',
              })}
              value={onDeviceFoodPhotoEnabled}
              onValueChange={setOnDeviceFoodPhotoEnabled}
            />
            <View className="bg-surface rounded-xl p-3 mb-4 shadow-sm">
              <Text className="text-base font-semibold text-text-primary mb-1">
                {t('aiSettings.aboutYou.title', { defaultValue: 'About you' })}
              </Text>
              <Text className="text-text-secondary text-sm mb-2">
                {t('aiSettings.aboutYou.description', {
                  defaultValue:
                    'Optional notes the on-device AI keeps in mind, such as vegetarian, no dairy, or a usual portion. They are used for meal photos and stay on this phone.',
                })}
              </Text>
              <TextInput
                testID="ai-about-you-input"
                multiline
                value={aiUserContext}
                onChangeText={setAiUserContext}
                placeholder={t('aiSettings.aboutYou.placeholder', {
                  defaultValue: 'e.g. vegetarian, lactose intolerant',
                })}
                placeholderTextColor={mutedColor}
                maxLength={500}
                className="text-text-primary text-sm min-h-[64px]"
                style={{ textAlignVertical: 'top' }}
              />
            </View>
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
          </>
        ) : (
          <Text className="text-text-secondary text-sm">
            {unavailableReason[onDeviceStatus] ??
              t('aiSettings.onDevice.unavailable', {
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
