import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useCSSVariable } from 'uniwind';
import {
  WIDGET_ACCENTS,
  WIDGET_LABEL_MAX_LENGTH,
  WIDGET_NAME_MAX_LENGTH,
  WIDGET_FAMILIES,
  WIDGET_FAMILY_MAX_METRICS,
  WIDGET_FAMILY_STYLES,
  WIDGET_METRICS,
} from '@workspace/shared';

import FormInput from '../components/FormInput';
import { FooterSaveBar } from '../components/FormScreenChrome';
import SettingsRow, { SettingsRowGroup } from '../components/SettingsRow';
import Switch from '../components/ui/Switch';
import WidgetPreview from '../components/widgets/WidgetPreview';
import { WIDGET_TEMPLATES } from '../constants/widgetBuilder';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useWidgetAccentColors } from '../hooks/useWidgetAccentColors';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useWidgetLayoutStore } from '../stores/widgetLayoutStore';
import type { RootStackScreenProps } from '../types/navigation';
import {
  applyWidgetTemplate,
  draftFromLayout,
  draftIsValid,
  draftToInput,
  emptyWidgetDraft,
  reconcileWidgetDraft,
  setDraftFamily,
  setDraftMetricLabel,
  toggleDraftMetric,
  widgetAccentLabels,
  widgetFamilyLabels,
  widgetMetricLabels,
  widgetStyleLabels,
  widgetTemplateLabels,
  type WidgetDraft,
} from '../utils/widgetBuilder';

type WidgetEditorScreenProps = RootStackScreenProps<'WidgetEditor'>;

/**
 * A selectable chip in the canonical form (DESIGN.md, Badges, pills and
 * chips): a pill with a 1px border. Selected is Sparky Blue with a white
 * label; unselected is a raised fill with an Ink Navy label.
 */
const Chip: React.FC<{
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}> = ({ label, selected, disabled, onPress }) => (
  <Pressable
    accessibilityRole="button"
    accessibilityState={{ selected, disabled: !!disabled }}
    disabled={disabled}
    onPress={onPress}
    className={`rounded-full border px-3 py-1.5 ${
      selected
        ? 'bg-accent-primary border-accent-primary'
        : 'bg-raised border-border-subtle'
    }`}
    style={({ pressed }) => ({
      opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
    })}
  >
    <Text
      className={`text-sm font-medium ${
        selected ? 'text-white' : 'text-text-primary'
      }`}
      numberOfLines={1}
    >
      {label}
    </Text>
  </Pressable>
);

const SectionTitle: React.FC<{ children: string }> = ({ children }) => (
  <Text className="text-sm font-medium text-text-secondary mb-1.5 mt-5">
    {children}
  </Text>
);

/**
 * Builds or edits one widget: a size, a style, up to a few numbers and a
 * color, with a live preview. Saving writes the layout to the device-local
 * store; `useWidgetSync` then mirrors it to the app group, and the person
 * places the "Custom widget" on the Home Screen or Lock Screen and picks this
 * layout in Edit Widget.
 */
const WidgetEditorScreen: React.FC<WidgetEditorScreenProps> = ({
  navigation,
  route,
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  // The selected color swatch is ringed in Ink Navy so it reads on every theme.
  const [ringColor] = useCSSVariable(['--color-text-primary']) as [string];

  const layoutId = route.params?.layoutId;
  const layouts = useWidgetLayoutStore((state) => state.layouts);
  const addLayout = useWidgetLayoutStore((state) => state.addLayout);
  const updateLayout = useWidgetLayoutStore((state) => state.updateLayout);
  const existing = useMemo(
    () => layouts.find((l) => l.id === layoutId),
    [layouts, layoutId]
  );
  const isEditing = layoutId !== undefined;

  const [draft, setDraft] = useState<WidgetDraft>(() =>
    existing ? draftFromLayout(existing) : emptyWidgetDraft()
  );

  const accentColors = useWidgetAccentColors();
  const metricLabels = widgetMetricLabels(t);
  const familyLabels = widgetFamilyLabels(t);
  const styleLabels = widgetStyleLabels(t);
  const accentLabels = widgetAccentLabels(t);
  const templateLabels = widgetTemplateLabels(t);

  const maxMetrics = WIDGET_FAMILY_MAX_METRICS[draft.family];
  const isLock = draft.family.startsWith('lock');
  const metricsFull = draft.metrics.length >= maxMetrics;

  const save = () => {
    if (!draftIsValid(draft)) {
      Toast.show({
        type: 'error',
        text1: t('widgets.editor.nameRequired', {
          defaultValue: 'Name your widget',
        }),
        text2: t('widgets.editor.nameRequiredHelp', {
          defaultValue: 'It is how you find it when you place the widget.',
        }),
      });
      return;
    }
    const input = draftToInput(draft);
    if (isEditing && layoutId) {
      updateLayout(layoutId, input);
    } else if (addLayout(input) === null) {
      Toast.show({
        type: 'error',
        text1: t('widgets.editor.limitReached', {
          defaultValue: 'You have reached the widget limit',
        }),
        text2: t('widgets.editor.limitReachedHelp', {
          defaultValue: 'Delete one you no longer use to make room.',
        }),
      });
      return;
    }
    Toast.show({
      type: 'success',
      text1: t('widgets.editor.saved', { defaultValue: 'Widget saved' }),
    });
    navigation.goBack();
  };

  const header = useScreenHeader({
    title: isEditing
      ? t('widgets.editor.editTitle', { defaultValue: 'Edit widget' })
      : t('widgets.editor.createTitle', { defaultValue: 'New widget' }),
    left: { kind: 'back' },
    right: { kind: 'primary', placement: 'native-only', onPress: save },
  });

  const update = (changes: Partial<WidgetDraft>) =>
    setDraft((current) => reconcileWidgetDraft({ ...current, ...changes }));

  return (
    <View
      className="flex-1 bg-background"
      style={!usesNativeHeader ? { paddingTop: insets.top } : undefined}
    >
      {header}
      <KeyboardAwareScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 96,
        }}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior={
          usesNativeHeader ? 'automatic' : 'never'
        }
      >
        <WidgetPreview draft={draft} />
        <Text className="text-xs text-text-muted text-center mt-2">
          {t('widgets.editor.previewNote', {
            defaultValue:
              'A preview with sample numbers. Your real widget uses your data.',
          })}
        </Text>

        {!isEditing ? (
          <>
            <SectionTitle>
              {t('widgets.editor.template', {
                defaultValue: 'Start from a template',
              })}
            </SectionTitle>
            <View className="flex-row flex-wrap gap-2">
              {WIDGET_TEMPLATES.map((template) => (
                <Chip
                  key={template.key}
                  label={templateLabels[template.key]}
                  selected={false}
                  onPress={() =>
                    setDraft((current) =>
                      applyWidgetTemplate(
                        current,
                        template,
                        templateLabels[template.key]
                      )
                    )
                  }
                />
              ))}
            </View>
          </>
        ) : null}

        <SectionTitle>
          {t('widgets.editor.name', { defaultValue: 'Name' })}
        </SectionTitle>
        <FormInput
          value={draft.name}
          maxLength={WIDGET_NAME_MAX_LENGTH}
          placeholder={t('widgets.editor.namePlaceholder', {
            defaultValue: 'e.g. Morning macros',
          })}
          onChangeText={(name) => update({ name })}
        />

        <SectionTitle>
          {t('widgets.editor.size', { defaultValue: 'Designed for' })}
        </SectionTitle>
        <Text className="text-xs text-text-muted mb-2">
          {t('widgets.editor.sizeHelp', {
            defaultValue:
              'You pick the size when you add the widget, and it adapts. This sets the preview, the styles offered and how many numbers fit.',
          })}
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {WIDGET_FAMILIES.map((family) => (
            <Chip
              key={family}
              label={familyLabels[family]}
              selected={draft.family === family}
              onPress={() =>
                setDraft((current) => setDraftFamily(current, family))
              }
            />
          ))}
        </View>

        <SectionTitle>
          {t('widgets.editor.style', { defaultValue: 'Style' })}
        </SectionTitle>
        <View className="flex-row flex-wrap gap-2">
          {WIDGET_FAMILY_STYLES[draft.family].map((style) => (
            <Chip
              key={style}
              label={styleLabels[style]}
              selected={draft.style === style}
              onPress={() => update({ style })}
            />
          ))}
        </View>

        <SectionTitle>
          {t('widgets.editor.numbers', { defaultValue: 'Numbers' })}
        </SectionTitle>
        <Text className="text-xs text-text-muted mb-2">
          {t('widgets.editor.numbersHelp', {
            defaultValue:
              'Pick up to {{max}} for this size. {{selected}} chosen.',
            max: maxMetrics,
            selected: draft.metrics.length,
          })}
        </Text>
        <View className="flex-row flex-wrap gap-2">
          {WIDGET_METRICS.map((metric) => {
            const selected = draft.metrics.some((m) => m.metric === metric);
            return (
              <Chip
                key={metric}
                label={metricLabels[metric]}
                selected={selected}
                disabled={!selected && metricsFull}
                onPress={() =>
                  setDraft((current) => toggleDraftMetric(current, metric))
                }
              />
            );
          })}
        </View>

        <SectionTitle>
          {t('widgets.editor.labels', { defaultValue: 'Number names' })}
        </SectionTitle>
        <Text className="text-xs text-text-muted mb-2">
          {t('widgets.editor.labelsHelp', {
            defaultValue:
              'Optional. Rename a number to fit your widget, for example "Protein" to "P".',
          })}
        </Text>
        <View className="gap-2">
          {draft.metrics.map((m) => (
            <FormInput
              key={m.metric}
              value={m.label ?? ''}
              maxLength={WIDGET_LABEL_MAX_LENGTH}
              placeholder={metricLabels[m.metric]}
              accessibilityLabel={t('widgets.editor.labelFor', {
                defaultValue: 'Name for {{metric}}',
                metric: metricLabels[m.metric],
              })}
              onChangeText={(label) =>
                setDraft((current) =>
                  setDraftMetricLabel(current, m.metric, label)
                )
              }
            />
          ))}
        </View>

        <SectionTitle>
          {t('widgets.editor.color', { defaultValue: 'Color' })}
        </SectionTitle>
        <View className="flex-row flex-wrap gap-3">
          {WIDGET_ACCENTS.map((accent) => (
            <Pressable
              key={accent}
              accessibilityRole="button"
              accessibilityLabel={accentLabels[accent]}
              accessibilityState={{ selected: draft.accent === accent }}
              onPress={() => update({ accent })}
              hitSlop={4}
              className="rounded-full items-center justify-center"
              style={({ pressed }) => ({
                width: 36,
                height: 36,
                backgroundColor: accentColors[accent],
                borderWidth: draft.accent === accent ? 3 : 0,
                borderColor: ringColor,
                opacity: pressed ? 0.7 : 1,
              })}
            />
          ))}
        </View>

        {!isLock || draft.family === 'small' ? (
          <View className="mt-5">
            <SettingsRowGroup>
              {!isLock ? (
                <SettingsRow
                  title={t('widgets.editor.showTitle', {
                    defaultValue: 'Show name',
                  })}
                  rightAccessory={
                    <Switch
                      accessibilityLabel={t('widgets.editor.showTitle', {
                        defaultValue: 'Show name',
                      })}
                      value={draft.showTitle}
                      onValueChange={(showTitle) => update({ showTitle })}
                    />
                  }
                />
              ) : null}
              {draft.family === 'small' ? (
                <SettingsRow
                  title={t('widgets.editor.standBy', {
                    defaultValue: 'Easy to read in StandBy',
                  })}
                  subtitle={t('widgets.editor.standByHelp', {
                    defaultValue:
                      'Larger numbers and no name, for a charging iPhone on its side.',
                  })}
                  rightAccessory={
                    <Switch
                      accessibilityLabel={t('widgets.editor.standBy', {
                        defaultValue: 'Easy to read in StandBy',
                      })}
                      value={draft.standByFriendly}
                      onValueChange={(standByFriendly) =>
                        update({ standByFriendly })
                      }
                    />
                  }
                />
              ) : null}
            </SettingsRowGroup>
          </View>
        ) : null}
      </KeyboardAwareScrollView>
      {!usesNativeHeader ? <FooterSaveBar onPress={save} /> : null}
    </View>
  );
};

export default WidgetEditorScreen;
