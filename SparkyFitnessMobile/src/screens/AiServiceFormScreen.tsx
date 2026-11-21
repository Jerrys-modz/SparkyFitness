import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import {
  AI_SERVICE_TYPES,
  providerDetailText,
  type AiServiceSettingsResponse,
} from '@workspace/shared';

import BottomSheetPicker from '../components/BottomSheetPicker';
import FormInput from '../components/FormInput';
import StatusView from '../components/StatusView';
import Switch from '../components/ui/Switch';
import Button from '../components/ui/Button';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import {
  useAiServices,
  useDeleteAiService,
  useSaveAiService,
  useTestAiService,
} from '../hooks/useAiServices';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { addLog } from '../services/LogService';
import { getApiErrorMessage } from '../services/api/errors';
import type { RootStackScreenProps } from '../types/navigation';
import {
  NEW_AI_SERVICE_DRAFT,
  REASONING_EFFORTS,
  aiServiceDraftProblem,
  aiServiceFormFields,
  aiServiceSaveRequest,
  aiServiceTestRequest,
  draftFromService,
  type AiServiceDraft,
  type ChatToolProfile,
  type ReasoningEffort,
} from '../utils/aiServiceForm';
import {
  useAiServiceTypeLabel,
  useReasoningEffortLabel,
} from '../utils/aiServiceLabels';

type Props = RootStackScreenProps<'AiServiceForm'>;

const CUSTOM_MODEL = '__custom__';

const FieldLabel: React.FC<{ title: string; hint?: string }> = ({
  title,
  hint,
}) => (
  <View className="mb-2">
    <Text className="text-sm font-semibold text-text-primary">{title}</Text>
    {hint ? (
      <Text className="text-xs text-text-secondary mt-1">{hint}</Text>
    ) : null}
  </View>
);

const Warning: React.FC<{ title: string; body: string }> = ({
  title,
  body,
}) => (
  <View className="rounded-lg p-3 border border-border-subtle bg-raised gap-1">
    <Text className="text-sm font-semibold text-text-primary">{title}</Text>
    <Text className="text-xs text-text-secondary">{body}</Text>
  </View>
);

const AiServiceForm: React.FC<{
  service: AiServiceSettingsResponse | null;
  onDone: () => void;
}> = ({ service, onDone }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const typeLabel = useAiServiceTypeLabel();
  const effortLabel = useReasoningEffortLabel();
  const isEdit = service !== null;
  const [draft, setDraft] = useState<AiServiceDraft>(() =>
    service ? draftFromService(service) : NEW_AI_SERVICE_DRAFT
  );
  const update = (patch: Partial<AiServiceDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
    testMutation.reset();
  };

  const saveMutation = useSaveAiService();
  const deleteMutation = useDeleteAiService();
  const testMutation = useTestAiService();
  const busy = saveMutation.isPending || deleteMutation.isPending;
  const fields = aiServiceFormFields(draft);
  const problem = aiServiceDraftProblem(draft, isEdit);

  const showError = (error: unknown, fallback: string) => {
    addLog('AI service change failed', 'ERROR', [String(error)]);
    Toast.show({
      type: 'error',
      text1: t('common.error', { defaultValue: 'Error' }),
      text2: getApiErrorMessage(error) ?? fallback,
    });
  };

  const handleSave = () => {
    if (problem || busy) return;
    saveMutation.mutate(aiServiceSaveRequest(draft, service?.id), {
      onSuccess: onDone,
      onError: (error) =>
        showError(
          error,
          t('aiServices.saveFailed', {
            defaultValue: 'Could not save the AI service.',
          })
        ),
    });
  };

  const handleDelete = () => {
    if (!service || busy) return;
    Alert.alert(
      t('aiServices.deleteTitle', { defaultValue: 'Delete this AI service?' }),
      t('aiServices.deleteDescription', {
        defaultValue:
          'Its API key is deleted too. If it was the service in use, AI features use the one set by your admin, if any.',
      }),
      [
        {
          text: t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
        {
          text: t('common.delete', { defaultValue: 'Delete' }),
          style: 'destructive',
          onPress: () =>
            deleteMutation.mutate(service.id, {
              onSuccess: onDone,
              onError: (error) =>
                showError(
                  error,
                  t('aiServices.deleteFailed', {
                    defaultValue: 'Could not delete the AI service.',
                  })
                ),
            }),
        },
      ]
    );
  };

  const testCategoryText = (category: string | undefined): string => {
    switch (category) {
      case 'api_key_missing':
        return t('aiServices.test.apiKeyMissing', {
          defaultValue:
            'The API key is missing or not valid. Add a valid key and try again.',
        });
      case 'custom_url_missing':
        return t('aiServices.test.customUrlMissing', {
          defaultValue: 'This service type needs a URL.',
        });
      case 'upstream_error':
        return t('aiServices.test.upstreamError', {
          defaultValue:
            'The AI service returned an error. Check the API key, model and URL.',
        });
      case 'timeout':
        return t('aiServices.test.timeout', {
          defaultValue:
            'The AI service did not answer in time. Check the URL and that the server can be reached.',
        });
      case 'unsupported_provider':
        return t('aiServices.test.unsupported', {
          defaultValue: 'This service type is not supported.',
        });
      default:
        return t('aiServices.test.unknown', {
          defaultValue:
            'The connection test failed. Check the settings and try again.',
        });
    }
  };

  const testResult = testMutation.data;
  const modelValue = fields.typesModel ? CUSTOM_MODEL : draft.modelName;
  const modelPickerOptions = [
    ...fields.modelSuggestions.map((model, index) => ({
      label:
        index === 0
          ? t('aiServices.model.recommended', {
              defaultValue: '{{model}} (recommended)',
              model,
            })
          : model,
      value: model,
    })),
    {
      label: t('aiServices.model.other', { defaultValue: 'Other model…' }),
      value: CUSTOM_MODEL,
    },
  ];

  const problemText = (): string | null => {
    switch (problem) {
      case 'name':
        return t('aiServices.problem.name', {
          defaultValue: 'Give the service a name.',
        });
      case 'apiKey':
        return t('aiServices.problem.apiKey', {
          defaultValue: 'Enter the API key.',
        });
      case 'customUrl':
        return t('aiServices.problem.customUrl', {
          defaultValue: 'Enter the server URL.',
        });
      case 'model':
        return t('aiServices.problem.model', {
          defaultValue: 'Enter the model name.',
        });
      default:
        return null;
    }
  };

  return (
    <ScrollView
      contentContainerStyle={{
        padding: 16,
        gap: 16,
        paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="bg-surface rounded-xl p-4 gap-4 shadow-sm">
        <View>
          <FieldLabel
            title={t('aiServices.fields.name', { defaultValue: 'Name' })}
          />
          <FormInput
            value={draft.name}
            onChangeText={(name) => update({ name })}
            maxLength={120}
            placeholder={t('aiServices.fields.namePlaceholder', {
              defaultValue: 'My AI service',
            })}
            accessibilityLabel={t('aiServices.fields.name', {
              defaultValue: 'Name',
            })}
            testID="ai-service-name"
          />
        </View>
        <View>
          <FieldLabel
            title={t('aiServices.fields.type', {
              defaultValue: 'Service type',
            })}
          />
          <BottomSheetPicker
            value={draft.serviceType}
            options={AI_SERVICE_TYPES.map((type) => ({
              label: typeLabel(type),
              value: type,
            }))}
            onSelect={(serviceType) =>
              update({ serviceType, modelName: '', customModel: false })
            }
            title={t('aiServices.fields.type', {
              defaultValue: 'Service type',
            })}
          />
        </View>
        <View>
          <FieldLabel
            title={t('aiServices.fields.apiKey', { defaultValue: 'API key' })}
            hint={
              isEdit
                ? t('aiServices.fields.apiKeyEditHint', {
                    defaultValue:
                      'Leave blank to keep the saved key. A new key is stored encrypted.',
                  })
                : fields.needsApiKey
                  ? undefined
                  : t('aiServices.fields.apiKeyOptional', {
                      defaultValue: 'Not needed for most self-hosted servers.',
                    })
            }
          />
          <FormInput
            value={draft.apiKey}
            onChangeText={(apiKey) => update({ apiKey })}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="password"
            accessibilityLabel={t('aiServices.fields.apiKey', {
              defaultValue: 'API key',
            })}
            testID="ai-service-api-key"
          />
        </View>
        {fields.needsCustomUrl && (
          <View>
            <FieldLabel
              title={t('aiServices.fields.customUrl', {
                defaultValue: 'Server URL',
              })}
            />
            <FormInput
              value={draft.customUrl}
              onChangeText={(customUrl) => update({ customUrl })}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder={
                fields.isOllama
                  ? 'http://localhost:11434'
                  : 'https://api.example.com/v1'
              }
              accessibilityLabel={t('aiServices.fields.customUrl', {
                defaultValue: 'Server URL',
              })}
              testID="ai-service-url"
            />
          </View>
        )}
        <View className="gap-2">
          <FieldLabel
            title={t('aiServices.fields.model', { defaultValue: 'Model' })}
          />
          {fields.modelSuggestions.length > 0 && (
            <BottomSheetPicker
              value={modelValue}
              options={modelPickerOptions}
              onSelect={(value) =>
                value === CUSTOM_MODEL
                  ? update({ customModel: true, modelName: '' })
                  : update({ customModel: false, modelName: value })
              }
              placeholder={t('aiServices.model.default', {
                defaultValue: 'Service default',
              })}
              title={t('aiServices.fields.model', { defaultValue: 'Model' })}
            />
          )}
          {fields.typesModel && (
            <FormInput
              value={draft.modelName}
              onChangeText={(modelName) => update({ modelName })}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={t('aiServices.model.placeholder', {
                defaultValue: 'Model name',
              })}
              accessibilityLabel={t('aiServices.model.placeholder', {
                defaultValue: 'Model name',
              })}
              testID="ai-service-model"
            />
          )}
        </View>
        {fields.showsReasoningEffort && (
          <View>
            <FieldLabel
              title={t('aiServices.fields.reasoningEffort', {
                defaultValue: 'Reasoning effort',
              })}
              hint={t('aiServices.fields.reasoningEffortHint', {
                defaultValue:
                  'More effort gives food and meal questions more thinking time, and can be slower and cost more.',
              })}
            />
            <BottomSheetPicker<ReasoningEffort>
              value={draft.reasoningEffort}
              options={REASONING_EFFORTS.map((effort) => ({
                label: effortLabel(effort),
                value: effort,
              }))}
              onSelect={(reasoningEffort) => update({ reasoningEffort })}
              title={t('aiServices.fields.reasoningEffort', {
                defaultValue: 'Reasoning effort',
              })}
            />
          </View>
        )}
        {fields.showsToolProfile && (
          <View className="gap-2">
            <FieldLabel
              title={t('aiServices.fields.toolProfile', {
                defaultValue: 'Chat tools',
              })}
              hint={t('aiServices.fields.toolProfileHint', {
                defaultValue:
                  'Core keeps only the food, exercise and measurement logging tools, for local or slower models.',
              })}
            />
            <BottomSheetPicker<ChatToolProfile>
              value={draft.chatToolProfile}
              options={[
                {
                  label: t('aiServices.toolProfile.full', {
                    defaultValue: 'Full (all tools)',
                  }),
                  value: 'full',
                },
                {
                  label: t('aiServices.toolProfile.core', {
                    defaultValue: 'Core (faster, fewer tools)',
                  }),
                  value: 'core',
                },
              ]}
              onSelect={(chatToolProfile) => update({ chatToolProfile })}
              title={t('aiServices.fields.toolProfile', {
                defaultValue: 'Chat tools',
              })}
            />
            {fields.isOllama && (
              <Warning
                title={t('aiServices.ollama.contextTitle', {
                  defaultValue: "Raise Ollama's context window",
                })}
                body={t('aiServices.ollama.contextBody', {
                  defaultValue:
                    'Ollama uses a 4096-token context by default and silently cuts off anything longer, which breaks tool calls. Set a larger context (for example 16384) on the Ollama server.',
                })}
              />
            )}
          </View>
        )}
        {fields.supportsVoice ? (
          <View className="flex-row items-center justify-between gap-3">
            <View className="flex-shrink">
              <Text className="text-sm font-semibold text-text-primary">
                {t('aiServices.fields.voice', {
                  defaultValue: 'Offer for voice input',
                })}
              </Text>
              <Text className="text-xs text-text-secondary mt-1">
                {t('aiServices.fields.voiceHint', {
                  defaultValue:
                    'Turn on only if the model accepts audio. It then appears in Voice settings.',
                })}
              </Text>
            </View>
            <Switch
              value={draft.supportsAudioInput}
              onValueChange={(supportsAudioInput) =>
                update({ supportsAudioInput })
              }
              accessibilityLabel={t('aiServices.fields.voice', {
                defaultValue: 'Offer for voice input',
              })}
              testID="ai-service-voice"
            />
          </View>
        ) : null}
        <View>
          <FieldLabel
            title={t('aiServices.fields.systemPrompt', {
              defaultValue: 'Extra instructions',
            })}
            hint={t('aiServices.fields.systemPromptHint', {
              defaultValue: 'Optional. Added to what Sparky is told.',
            })}
          />
          <FormInput
            value={draft.systemPrompt}
            onChangeText={(systemPrompt) => update({ systemPrompt })}
            multiline
            style={{ minHeight: 88, textAlignVertical: 'top' }}
            accessibilityLabel={t('aiServices.fields.systemPrompt', {
              defaultValue: 'Extra instructions',
            })}
            testID="ai-service-system-prompt"
          />
        </View>
        <View className="flex-row items-center justify-between gap-3">
          <View className="flex-shrink">
            <Text className="text-sm font-semibold text-text-primary">
              {t('aiServices.fields.enabled', { defaultValue: 'Enabled' })}
            </Text>
            <Text className="text-xs text-text-secondary mt-1">
              {t('aiServices.fields.enabledHint', {
                defaultValue:
                  'Only enabled services can be picked for chat and other AI features.',
              })}
            </Text>
          </View>
          <Switch
            value={draft.enabled}
            onValueChange={(enabled) => update({ enabled })}
            accessibilityLabel={t('aiServices.fields.enabled', {
              defaultValue: 'Enabled',
            })}
            testID="ai-service-enabled"
          />
        </View>
      </View>

      <View className="gap-2">
        <Button
          variant="outline"
          onPress={() =>
            testMutation.mutate(aiServiceTestRequest(draft, service?.id))
          }
          disabled={testMutation.isPending || busy}
          testID="ai-service-test"
        >
          {testMutation.isPending
            ? t('aiServices.test.running', { defaultValue: 'Testing…' })
            : t('aiServices.test.button', {
                defaultValue: 'Test connection',
              })}
        </Button>
        {testResult && !testMutation.isPending ? (
          <View accessibilityRole="alert" testID="ai-service-test-result">
            {testResult.ok ? (
              <Text className="text-sm text-text-primary">
                {t('aiServices.test.ok', {
                  defaultValue: 'Connected. The service answered.',
                })}
              </Text>
            ) : (
              <>
                <Text className="text-sm text-icon-danger">
                  {testCategoryText(testResult.category)}
                </Text>
                {testResult.detail ? (
                  <Text className="text-xs text-text-secondary mt-1">
                    {providerDetailText(testResult.detail)}
                  </Text>
                ) : null}
              </>
            )}
          </View>
        ) : null}
        {testMutation.isError ? (
          <Text accessibilityRole="alert" className="text-sm text-icon-danger">
            {t('aiServices.test.requestFailed', {
              defaultValue: 'Could not run the test. Check your connection.',
            })}
          </Text>
        ) : null}
      </View>

      <View className="gap-2">
        {problem && draft.name.trim() ? (
          <Text className="text-sm text-text-secondary">{problemText()}</Text>
        ) : null}
        <Button
          variant="primary"
          onPress={handleSave}
          disabled={problem !== null || busy}
          testID="ai-service-save"
        >
          {saveMutation.isPending
            ? t('common.saving', { defaultValue: 'Saving…' })
            : t('common.save', { defaultValue: 'Save' })}
        </Button>
        {isEdit && (
          <Button
            variant="destructive"
            onPress={handleDelete}
            disabled={busy}
            testID="ai-service-delete"
          >
            {t('common.delete', { defaultValue: 'Delete' })}
          </Button>
        )}
      </View>
    </ScrollView>
  );
};

const AiServiceFormScreen: React.FC<Props> = ({ navigation, route }) => {
  const { t } = useTranslation();
  const serviceId = route.params?.serviceId;
  const { data: services = [], isLoading, isError, refetch } = useAiServices();
  // Only the person's own services can be edited here.
  const service = serviceId
    ? (services.find((s) => s.id === serviceId && !s.is_public) ?? null)
    : null;

  const header = useScreenHeader({
    title: serviceId
      ? t('aiServices.editTitle', { defaultValue: 'Edit AI service' })
      : t('aiServices.addTitle', { defaultValue: 'Add AI service' }),
    left: { kind: 'back' },
  });

  // Wait for the list before mounting the form so an edit starts from the
  // saved values.
  const ready = !serviceId || (!isLoading && !isError && service !== null);

  return (
    <View className="flex-1 bg-background">
      {header}
      {ready ? (
        <AiServiceForm
          key={service?.id ?? 'new-ai-service'}
          service={service}
          onDone={() => navigation.goBack()}
        />
      ) : isLoading ? (
        <StatusView loading />
      ) : (
        <StatusView
          icon="alert-circle"
          iconTone="danger"
          title={
            isError
              ? t('aiServices.loadFailed', {
                  defaultValue: 'Could not load your AI services.',
                })
              : t('aiServices.notFound', {
                  defaultValue: 'AI service not found.',
                })
          }
          action={{
            label: t('common.retry', { defaultValue: 'Retry' }),
            onPress: () => void refetch(),
          }}
        />
      )}
    </View>
  );
};

export default AiServiceFormScreen;
