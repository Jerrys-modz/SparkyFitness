import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import Toast from 'react-native-toast-message';
import type { AiServiceSettingsResponse } from '@workspace/shared';

import BottomSheetPicker from './BottomSheetPicker';
import SettingsRow, { SettingsRowGroup } from './SettingsRow';
import Switch from './ui/Switch';
import Button from './ui/Button';
import {
  useAiServices,
  useSaveAiService,
  useSetActiveAiService,
} from '../hooks/useAiServices';
import { useActiveAiServiceSetting } from '../hooks/useActiveAiServiceSetting';
import { usePreferences } from '../hooks/usePreferences';
import { useUserAiConfigAllowed } from '../hooks/useUserAiConfigAllowed';
import { addLog } from '../services/LogService';
import {
  enabledAiServices,
  resolveActiveAiServiceId,
} from '../utils/aiServiceForm';
import { useAiServiceTypeLabel } from '../utils/aiServiceLabels';

const NONE = '__none__';
const SAME_AS_ACTIVE = '__same__';

interface AiServicesSectionProps {
  onAdd: () => void;
  onEdit: (serviceId: string) => void;
}

/**
 * The AI services the person can use: which one powers chat and the other AI
 * features, an optional different one for photos and labels, their own
 * services (add, edit, turn on or off) and the ones their admin shares.
 */
const AiServicesSection: React.FC<AiServicesSectionProps> = ({
  onAdd,
  onEdit,
}) => {
  const { t } = useTranslation();
  const typeLabel = useAiServiceTypeLabel();
  const { data: allowed = false } = useUserAiConfigAllowed();
  const { data: services = [], isLoading, isError, refetch } = useAiServices();
  const { preferences } = usePreferences();
  const { data: serverActive } = useActiveAiServiceSetting();
  const setActive = useSetActiveAiService();
  const saveService = useSaveAiService();

  const enabled = enabledAiServices(services);
  const activeId = resolveActiveAiServiceId(
    services,
    preferences?.active_ai_service_id,
    serverActive?.id
  );
  const visionId =
    enabled.find((s) => s.id === preferences?.active_vision_ai_service_id)
      ?.id ?? null;
  const own = services.filter((s) => !s.is_public);
  const shared = services.filter((s) => s.is_public);

  const failed = (error: unknown) => {
    addLog('AI service setting failed', 'ERROR', [String(error)]);
    Toast.show({
      type: 'error',
      text1: t('common.error', { defaultValue: 'Error' }),
      text2: t('aiServices.updateFailed', {
        defaultValue: 'Could not change the AI service.',
      }),
    });
  };

  const describe = (service: AiServiceSettingsResponse) =>
    [typeLabel(service.service_type), service.model_name]
      .filter(Boolean)
      .join(' · ');

  const options = enabled.map((service) => ({
    label: service.is_public
      ? t('aiServices.sharedName', {
          defaultValue: '{{name}} (from your admin)',
          name: service.service_name,
        })
      : service.service_name,
    value: service.id,
  }));

  const toggleOwn = (service: AiServiceSettingsResponse, isActive: boolean) =>
    saveService.mutate(
      {
        // The server overwrites the URL, model and instructions with what is
        // sent, so an on/off change resends the saved values.
        id: service.id,
        service_name: service.service_name,
        service_type: service.service_type,
        custom_url: service.custom_url ?? null,
        model_name: service.model_name ?? null,
        system_prompt: service.system_prompt ?? '',
        chat_tool_profile: service.chat_tool_profile,
        reasoning_effort: service.reasoning_effort,
        supports_audio_input: service.supports_audio_input,
        is_active: isActive,
      },
      { onError: failed }
    );

  if (isLoading) {
    return (
      <Text className="text-text-secondary text-sm mb-6">
        {t('aiServices.loading', { defaultValue: 'Loading AI services…' })}
      </Text>
    );
  }

  if (isError) {
    return (
      <View className="mb-6 gap-3">
        <Text accessibilityRole="alert" className="text-icon-danger text-sm">
          {t('aiServices.loadFailed', {
            defaultValue: 'Could not load your AI services.',
          })}
        </Text>
        <Button onPress={() => void refetch()}>
          {t('common.retry', { defaultValue: 'Retry' })}
        </Button>
      </View>
    );
  }

  return (
    <View className="mb-6 gap-3" testID="ai-services-section">
      <Text className="text-text-primary text-base font-semibold">
        {t('aiServices.title', { defaultValue: 'AI services' })}
      </Text>

      {enabled.length === 0 ? (
        <Text className="text-text-secondary text-sm">
          {allowed
            ? t('aiServices.noneEnabled', {
                defaultValue:
                  'No AI service is set up yet. Add one below to use chat, photo logging and label scans.',
              })
            : t('aiServices.noneShared', {
                defaultValue:
                  'Your admin has not set up an AI service for this server yet.',
              })}
        </Text>
      ) : (
        <View className="gap-3">
          <View>
            <Text className="text-sm text-text-secondary mb-1">
              {t('aiServices.activeLabel', {
                defaultValue: 'Used for chat and AI features',
              })}
            </Text>
            <BottomSheetPicker
              value={activeId ?? NONE}
              options={options}
              placeholder={t('aiServices.pickOne', {
                defaultValue: 'Pick a service',
              })}
              onSelect={(id) =>
                setActive.mutate(
                  { active_ai_service_id: id },
                  { onError: failed }
                )
              }
              title={t('aiServices.activeLabel', {
                defaultValue: 'Used for chat and AI features',
              })}
            />
          </View>
          <View>
            <Text className="text-sm text-text-secondary mb-1">
              {t('aiServices.visionLabel', {
                defaultValue: 'Used for photos and labels',
              })}
            </Text>
            <BottomSheetPicker
              value={visionId ?? SAME_AS_ACTIVE}
              options={[
                {
                  label: t('aiServices.sameAsActive', {
                    defaultValue: 'Same as above',
                  }),
                  value: SAME_AS_ACTIVE,
                },
                ...options,
              ]}
              onSelect={(id) =>
                setActive.mutate(
                  {
                    active_vision_ai_service_id:
                      id === SAME_AS_ACTIVE ? null : id,
                  },
                  { onError: failed }
                )
              }
              title={t('aiServices.visionLabel', {
                defaultValue: 'Used for photos and labels',
              })}
            />
          </View>
        </View>
      )}

      {allowed ? (
        <>
          {own.length > 0 && (
            <SettingsRowGroup>
              {own.map((service) => (
                <SettingsRow
                  key={service.id}
                  title={service.service_name}
                  subtitle={describe(service)}
                  onPress={() => onEdit(service.id)}
                  rightAccessory={
                    <Switch
                      value={service.is_active}
                      onValueChange={(value) => toggleOwn(service, value)}
                      disabled={saveService.isPending}
                      accessibilityLabel={t('aiServices.enableNamed', {
                        defaultValue: 'Enable {{name}}',
                        name: service.service_name,
                      })}
                      testID={`ai-service-switch-${service.id}`}
                    />
                  }
                  testID={`ai-service-row-${service.id}`}
                />
              ))}
            </SettingsRowGroup>
          )}
          <Button variant="outline" onPress={onAdd} testID="ai-service-add">
            {t('aiServices.add', { defaultValue: 'Add AI service' })}
          </Button>
        </>
      ) : (
        <Text className="text-text-secondary text-sm">
          {t('aiServices.perUserOff', {
            defaultValue:
              'Your admin manages the AI services on this server, so you cannot add your own.',
          })}
        </Text>
      )}

      {shared.length > 0 && (
        <View className="gap-2">
          <Text className="text-sm font-semibold text-text-primary">
            {t('aiServices.sharedTitle', { defaultValue: 'From your admin' })}
          </Text>
          <SettingsRowGroup>
            {shared.map((service) => (
              <SettingsRow
                key={service.id}
                title={service.service_name}
                subtitle={
                  service.is_active
                    ? describe(service)
                    : t('aiServices.sharedOff', {
                        defaultValue: '{{details}} · turned off by your admin',
                        details: describe(service),
                      })
                }
                testID={`ai-service-shared-${service.id}`}
              />
            ))}
          </SettingsRowGroup>
        </View>
      )}
    </View>
  );
};

export default AiServicesSection;
