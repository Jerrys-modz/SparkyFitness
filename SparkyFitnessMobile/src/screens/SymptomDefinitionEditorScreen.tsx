import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import Icon from '../components/Icon';
import { FooterSaveBar } from '../components/FormScreenChrome';
import { useSymptomDefinitions, useSymptomActions } from '../hooks/useSymptoms';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../types/navigation';
import type {
  SymptomDefinitionCategory,
  SymptomScaleType,
  SymptomTemplate,
} from '@workspace/shared';

type Props = NativeStackScreenProps<
  RootStackParamList,
  'SymptomDefinitionEditor'
>;

const CATEGORIES: SymptomDefinitionCategory[] = [
  'general',
  'head',
  'pain',
  'gi',
  'respiratory',
  'skin',
  'mental',
  'other',
];

const TEMPLATES: SymptomTemplate[] = [
  'generic',
  'headache',
  'pain',
  'gi',
  'respiratory',
  'skin',
  'mental',
];

const SCALES: SymptomScaleType[] = [
  '1-10',
  '1-5',
  'none-severe',
  'count',
  'text',
];

export default function SymptomDefinitionEditorScreen({
  navigation,
  route,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const { definitionId } = route.params || {};

  const { definitions } = useSymptomDefinitions();
  const existing = definitionId
    ? definitions.find((d) => d.id === definitionId)
    : null;

  const [name, setName] = useState(existing?.name ?? '');
  const [category, setCategory] = useState<SymptomDefinitionCategory>(
    (existing?.category as SymptomDefinitionCategory) ?? 'general'
  );
  const [template, setTemplate] = useState<SymptomTemplate>(
    (existing?.template as SymptomTemplate) ?? 'generic'
  );
  const [scaleType, setScaleType] = useState<SymptomScaleType>(
    (existing?.scale_type as SymptomScaleType) ?? '1-10'
  );
  const [isEpisodic, setIsEpisodic] = useState(existing?.is_episodic ?? false);
  const [isPinned, setIsPinned] = useState(existing?.is_pinned ?? false);

  const { saveDefinition } = useSymptomActions();

  const getCategoryLabel = (cat: SymptomDefinitionCategory) => {
    switch (cat) {
      case 'general':
        return t('symptoms.categories.general', { defaultValue: 'General' });
      case 'head':
        return t('symptoms.categories.head', {
          defaultValue: 'Headache / Head',
        });
      case 'pain':
        return t('symptoms.categories.pain', { defaultValue: 'Pain' });
      case 'gi':
        return t('symptoms.categories.gi', { defaultValue: 'GI / Digestive' });
      case 'respiratory':
        return t('symptoms.categories.respiratory', {
          defaultValue: 'Respiratory',
        });
      case 'skin':
        return t('symptoms.categories.skin', { defaultValue: 'Skin' });
      case 'mental':
        return t('symptoms.categories.mental', { defaultValue: 'Mental' });
      case 'other':
        return t('symptoms.categories.other', { defaultValue: 'Other' });
    }
  };

  const getTemplateLabel = (tmpl: SymptomTemplate) => {
    switch (tmpl) {
      case 'generic':
        return t('symptoms.templates.generic', { defaultValue: 'Generic' });
      case 'headache':
        return t('symptoms.templates.headache', {
          defaultValue: 'Headache / Migraine',
        });
      case 'pain':
        return t('symptoms.templates.pain', { defaultValue: 'Body Pain' });
      case 'gi':
        return t('symptoms.templates.gi', { defaultValue: 'GI / Digestive' });
      case 'respiratory':
        return t('symptoms.templates.respiratory', {
          defaultValue: 'Respiratory',
        });
      case 'skin':
        return t('symptoms.templates.skin', { defaultValue: 'Skin Flare' });
      case 'mental':
        return t('symptoms.templates.mental', {
          defaultValue: 'Mental Health',
        });
    }
  };

  const getScaleLabel = (scale: SymptomScaleType) => {
    switch (scale) {
      case '1-10':
        return t('symptoms.scales.oneToTen', { defaultValue: '1 - 10 Scale' });
      case '1-5':
        return t('symptoms.scales.oneToFive', { defaultValue: '1 - 5 Scale' });
      case 'none-severe':
        return t('symptoms.scales.noneToSevere', {
          defaultValue: 'None - Severe (5 levels)',
        });
      case 'count':
        return t('symptoms.scales.count', {
          defaultValue: 'Count / Frequency',
        });
      case 'text':
        return t('symptoms.scales.text', { defaultValue: 'Text / Notes Only' });
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert(
        t('common.error', { defaultValue: 'Error' }),
        t('symptoms.nameRequired', {
          defaultValue: 'Please enter a name for the symptom.',
        })
      );
      return;
    }

    await saveDefinition.mutateAsync({
      name: name.trim(),
      category,
      template,
      scale_type: scaleType,
      is_episodic: isEpisodic,
      is_pinned: isPinned,
    });

    navigation.goBack();
  };

  const header = useScreenHeader({
    title: existing
      ? t('symptoms.editDefinitionTitle', { defaultValue: 'Edit Symptom Type' })
      : t('symptoms.newDefinitionTitle', { defaultValue: 'New Symptom Type' }),
    left: {
      kind: 'dismiss',
      onPress: () => navigation.goBack(),
      accessibilityLabel: t('common.cancel', { defaultValue: 'Cancel' }),
    },
    right: {
      kind: 'primary',
      label: t('common.save', { defaultValue: 'Save' }),
      onPress: handleSave,
      busy: saveDefinition.isPending,
      identifier: 'symptom-definition-save',
    },
  });

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}

      <ScrollView
        className="flex-1 px-4 py-4 space-y-5"
        keyboardShouldPersistTaps="handled"
      >
        {/* Name Input */}
        <View className="space-y-1.5">
          <Text className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            {t('symptoms.name', { defaultValue: 'Symptom Name' })}
          </Text>
          <TextInput
            placeholder={t('symptoms.namePlaceholder', {
              defaultValue: 'e.g. Migraine, Knee Pain, Acid Reflux',
            })}
            placeholderTextColor="#94a3b8"
            value={name}
            onChangeText={setName}
            className="bg-card border border-border rounded-xl px-3.5 py-2.5 text-sm text-foreground"
          />
        </View>

        {/* Template */}
        <View className="space-y-2">
          <Text className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            {t('symptoms.template', {
              defaultValue: 'Template (Pre-configured Sections)',
            })}
          </Text>
          <View className="flex-row flex-wrap gap-1.5">
            {TEMPLATES.map((tmpl) => {
              const isSelected = template === tmpl;
              return (
                <TouchableOpacity
                  key={tmpl}
                  onPress={() => setTemplate(tmpl)}
                  className={`px-3 py-2 rounded-xl border ${
                    isSelected
                      ? 'bg-primary border-primary'
                      : 'bg-card border-border'
                  }`}
                >
                  <Text
                    className={`text-xs font-semibold ${
                      isSelected ? 'text-primary-foreground' : 'text-foreground'
                    }`}
                  >
                    {getTemplateLabel(tmpl)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Category */}
        <View className="space-y-2">
          <Text className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            {t('symptoms.category', { defaultValue: 'Category' })}
          </Text>
          <View className="flex-row flex-wrap gap-1.5">
            {CATEGORIES.map((cat) => {
              const isSelected = category === cat;
              return (
                <TouchableOpacity
                  key={cat}
                  onPress={() => setCategory(cat)}
                  className={`px-3 py-1.5 rounded-full border ${
                    isSelected
                      ? 'bg-blue-600/20 border-blue-500'
                      : 'bg-card border-border'
                  }`}
                >
                  <Text
                    className={`text-xs ${
                      isSelected
                        ? 'text-blue-500 font-semibold'
                        : 'text-foreground'
                    }`}
                  >
                    {getCategoryLabel(cat)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Scale Type */}
        <View className="space-y-2">
          <Text className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            {t('symptoms.scaleType', { defaultValue: 'Severity Scale' })}
          </Text>
          <View className="space-y-1.5">
            {SCALES.map((sc) => {
              const isSelected = scaleType === sc;
              return (
                <TouchableOpacity
                  key={sc}
                  onPress={() => setScaleType(sc)}
                  className={`p-3 rounded-xl border flex-row items-center justify-between ${
                    isSelected
                      ? 'bg-card border-primary'
                      : 'bg-card border-border'
                  }`}
                >
                  <Text
                    className={`text-sm font-semibold ${
                      isSelected ? 'text-primary' : 'text-foreground'
                    }`}
                  >
                    {getScaleLabel(sc)}
                  </Text>
                  {isSelected && (
                    <Icon name="checkmark" size={16} color="#3b82f6" />
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Switches */}
        <View className="bg-card border border-border p-3.5 rounded-2xl space-y-4">
          <View className="flex-row justify-between items-center">
            <View className="flex-1 pr-4">
              <Text className="text-sm font-semibold text-foreground">
                {t('symptoms.isEpisodic', {
                  defaultValue: 'Duration-based episodes',
                })}
              </Text>
              <Text className="text-xs text-muted-foreground">
                {t('symptoms.isEpisodicDesc', {
                  defaultValue:
                    'Tracks start time, ongoing banner, and total duration',
                })}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setIsEpisodic(!isEpisodic)}
              className={`w-12 h-6 rounded-full p-0.5 ${
                isEpisodic ? 'bg-primary' : 'bg-muted'
              }`}
            >
              <View
                className={`w-5 h-5 rounded-full bg-white transition-all ${
                  isEpisodic ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </TouchableOpacity>
          </View>

          <View className="flex-row justify-between items-center pt-2 border-t border-border/40">
            <View className="flex-1 pr-4">
              <Text className="text-sm font-semibold text-foreground">
                {t('symptoms.isPinned', { defaultValue: 'Pin to top of list' })}
              </Text>
              <Text className="text-xs text-muted-foreground">
                {t('symptoms.isPinnedDesc', {
                  defaultValue: 'Shows first in the quick logging chips',
                })}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setIsPinned(!isPinned)}
              className={`w-12 h-6 rounded-full p-0.5 ${
                isPinned ? 'bg-primary' : 'bg-muted'
              }`}
            >
              <View
                className={`w-5 h-5 rounded-full bg-white transition-all ${
                  isPinned ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </TouchableOpacity>
          </View>
        </View>

        <View className="h-20" />
      </ScrollView>

      {/* Sticky Save Bar */}
      <FooterSaveBar
        onPress={handleSave}
        busy={saveDefinition.isPending}
        label={t('common.save', { defaultValue: 'Save' })}
      />
    </View>
  );
}
