import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, ScrollView, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';

import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import Switch from '../components/ui/Switch';
import OnDeviceChatDebugPanel from '../components/OnDeviceChatDebugPanel';
import SegmentedControl from '../components/SegmentedControl';
import {
  getCloudChatStatus,
  getOnDeviceStatus,
} from '../services/onDeviceChat';
import type { OnDeviceChatModel } from '../../modules/on-device-nutrition';
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
  const onDeviceChatModel = useAppPreferencesStore((s) => s.onDeviceChatModel);
  const setOnDeviceChatModel = useAppPreferencesStore(
    (s) => s.setOnDeviceChatModel
  );
  const onDeviceAvailable = useMemo(() => isOnDeviceLabelScanAvailable(), []);
  const cloudStatus = useMemo(() => getCloudChatStatus(), []);
  const onDeviceStatus = useMemo(() => getOnDeviceStatus(), []);
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
  const cloudStatusText: Record<string, string> = {
    available: t('aiSettings.chatModel.status.available', {
      defaultValue: 'Available',
    }),
    quotaLimitReached: t('aiSettings.chatModel.status.quotaLimitReached', {
      defaultValue: 'Usage limit reached for now. It will use this phone.',
    }),
    deviceNotEligible: t('aiSettings.chatModel.status.deviceNotEligible', {
      defaultValue: 'Not available on this device.',
    }),
    systemNotReady: t('aiSettings.chatModel.status.systemNotReady', {
      defaultValue: 'Not ready yet. Check that Apple Intelligence is set up.',
    }),
  };

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
                  'Estimate a single meal photo with Apple Intelligence on this device. It is rougher than your server AI provider and does not match foods in your library. Up to 4 photos of one meal are read together; more than that, or a photo it cannot estimate, uses the server AI provider.',
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
                  'Answer Sparky chat with Apple Intelligence on this device. It can read your diary and, after you confirm, log food, water or weight, or delete an entry. It is less capable than your server AI provider and the chat is saved to your Sparky history like the others.',
              })}
              value={onDeviceChatEnabled}
              onValueChange={setOnDeviceChatEnabled}
            />
            <View className="bg-surface rounded-xl p-3 mb-4 shadow-sm">
              <Text className="text-base font-semibold text-text-primary mb-1">
                {t('aiSettings.aboutYou.title', { defaultValue: 'About you' })}
              </Text>
              <Text className="text-text-secondary text-sm mb-2">
                {t('aiSettings.aboutYou.description', {
                  defaultValue:
                    'Optional notes the on-device AI keeps in mind, such as vegetarian, no dairy, or a usual portion. They are used for chat and meal photos and stay on this phone.',
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
            {cloudStatus !== 'unsupported' && (
              <View className="bg-surface rounded-xl p-3 mb-4 shadow-sm">
                <Text className="text-base font-semibold text-text-primary mb-3">
                  {t('aiSettings.chatModel.title', {
                    defaultValue: 'Chat model',
                  })}
                </Text>
                <SegmentedControl<OnDeviceChatModel>
                  segments={[
                    {
                      key: 'device',
                      label: t('aiSettings.chatModel.device', {
                        defaultValue: 'This phone',
                      }),
                    },
                    {
                      key: 'auto',
                      label: t('aiSettings.chatModel.auto', {
                        defaultValue: 'Auto',
                      }),
                    },
                    {
                      key: 'cloud',
                      label: t('aiSettings.chatModel.cloud', {
                        defaultValue: 'Apple servers',
                      }),
                    },
                  ]}
                  activeKey={onDeviceChatModel}
                  onSelect={setOnDeviceChatModel}
                />
                <Text
                  testID="ai-cloud-status"
                  className="text-text-secondary text-sm mt-3"
                >
                  {t('aiSettings.chatModel.statusLabel', {
                    defaultValue: 'Apple private servers: {{status}}',
                    status: cloudStatusText[cloudStatus] ?? cloudStatus,
                  })}
                </Text>
                <Text className="text-text-secondary text-sm mt-2">
                  {t('aiSettings.chatModel.description', {
                    defaultValue:
                      'This phone keeps everything on the device. Auto uses this phone and moves to Apple’s Private Cloud Compute only when a conversation is too long for it. Apple servers always uses Private Cloud Compute, so your messages and diary snapshot leave the phone; Apple says it does not store them. Apple limits how much each person can use.',
                  })}
                </Text>
              </View>
            )}
            <OnDeviceChatDebugPanel />
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
