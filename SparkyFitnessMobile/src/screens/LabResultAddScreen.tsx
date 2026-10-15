import React, { useMemo, useRef, useState } from 'react';
import {
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Toast from 'react-native-toast-message';
import CalendarSheet, {
  type CalendarSheetRef,
} from '../components/CalendarSheet';
import { FooterSaveBar } from '../components/FormScreenChrome';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useLabMarkers, useSaveLabResult } from '../hooks/useLabResults';
import { useCustomCategories } from '../hooks/useCustomMeasurements';
import { useProfile } from '../hooks/useProfile';
import {
  formatDateLabel,
  getDateRelationToToday,
  getTodayDate,
} from '../utils/dateUtils';
import { LAB_MARKER_PRESETS, hasSexSpecificRange } from '@workspace/shared';
import {
  buildLabPickerOptions,
  formatLabRange,
  labMarkerName,
  labSexFromGender,
  newLabMarkerFromPreset,
  parseLabValue,
  parseRangeBound,
  type NewLabMarker,
} from '../utils/labResults';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'LabResultAdd'>;

const PICKER_LIMIT = 40;
const INPUT_CLASS =
  'bg-surface border border-border rounded-xl px-3.5 py-2.5 text-sm text-text-primary';

/** A chosen marker: one the user already has, or a new one to create on save. */
type Selection =
  | { kind: 'existing'; categoryId: string }
  | { kind: 'new'; draft: NewLabMarker };

const LabResultAddScreen: React.FC<Props> = ({ navigation, route }) => {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const [textMuted] = useCSSVariable(['--color-text-muted']) as [string];
  const dateLocale = i18n.language.startsWith('pl') ? 'pl-PL' : 'en-US';
  const calendarRef = useRef<CalendarSheetRef>(null);

  const categoriesQuery = useCustomCategories();
  const { markers } = useLabMarkers();
  const save = useSaveLabResult();
  const { profile } = useProfile();
  const sex = labSexFromGender(profile?.gender);

  const [selection, setSelection] = useState<Selection | null>(
    route.params?.categoryId
      ? { kind: 'existing', categoryId: route.params.categoryId }
      : null
  );
  const [search, setSearch] = useState('');
  const [unit, setUnit] = useState('');
  const [lowText, setLowText] = useState('');
  const [highText, setHighText] = useState('');
  const [valueText, setValueText] = useState('');
  const [date, setDate] = useState(getTodayDate());
  const [notes, setNotes] = useState('');

  const existing =
    selection?.kind === 'existing'
      ? markers.find((m) => m.id === selection.categoryId)
      : undefined;
  const isNew = selection?.kind === 'new';
  const sexSpecificHint =
    selection?.kind === 'new' &&
    LAB_MARKER_PRESETS.some(
      (p) => p.key === selection.draft.name && hasSexSpecificRange(p)
    );

  const options = useMemo(
    () => buildLabPickerOptions(categoriesQuery.data ?? [], search),
    [categoriesQuery.data, search]
  );

  const customName = search.trim();
  const canCreateCustom =
    customName !== '' &&
    !(categoriesQuery.data ?? []).some(
      (c) => c.name.toLowerCase() === customName.toLowerCase()
    );

  const chooseNew = (draft: NewLabMarker) => {
    setSelection({ kind: 'new', draft });
    setUnit(draft.measurement_type);
    setLowText(draft.ref_range_low != null ? String(draft.ref_range_low) : '');
    setHighText(
      draft.ref_range_high != null ? String(draft.ref_range_high) : ''
    );
  };

  const markerTitle = existing
    ? labMarkerName(existing)
    : selection?.kind === 'new'
      ? selection.draft.display_name
      : '';

  const value = parseLabValue(valueText);
  const low = parseRangeBound(lowText);
  const high = parseRangeBound(highText);
  const rangeValid =
    low.ok &&
    high.ok &&
    (low.value === null || high.value === null || low.value <= high.value);
  const dateValid = getDateRelationToToday(date) !== 'future';
  const canSave =
    selection !== null &&
    (selection.kind === 'existing' ? existing !== undefined : true) &&
    value !== null &&
    dateValid &&
    (!isNew || (unit.trim() !== '' && rangeValid)) &&
    !save.isPending;

  const handleSave = async () => {
    if (!canSave || selection === null || value === null) return;
    try {
      await save.mutateAsync({
        target:
          selection.kind === 'existing'
            ? { categoryId: selection.categoryId }
            : {
                newMarker: {
                  ...selection.draft,
                  measurement_type: unit.trim(),
                  ref_range_low: low.ok ? low.value : null,
                  ref_range_high: high.ok ? high.value : null,
                },
              },
        value,
        date,
        notes,
      });
      navigation.goBack();
    } catch {
      Toast.show({
        type: 'error',
        text1: t('labs.saveFailed', {
          defaultValue: 'Could not save the lab result',
        }),
      });
    }
  };

  const header = useScreenHeader({
    title: t('screens.labResultAdd', { defaultValue: 'Add lab result' }),
    left: {
      kind: 'dismiss',
      onPress: () => navigation.goBack(),
      accessibilityLabel: t('common.cancel', { defaultValue: 'Cancel' }),
    },
    right: [
      {
        kind: 'primary',
        label: t('common.save', { defaultValue: 'Save' }),
        onPress: handleSave,
        busy: save.isPending,
        disabled: !canSave,
        placement: 'native-only',
        identifier: 'lab-result-save',
      },
    ],
  });

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      <ScrollView
        className="flex-1 px-4 py-3"
        contentContainerClassName="gap-4 pb-6"
        keyboardShouldPersistTaps="handled"
      >
        {selection === null ? (
          <View className="gap-3">
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder={t('labs.searchPlaceholder', {
                defaultValue: 'Search markers (HbA1c, LDL, ...)',
              })}
              placeholderTextColor={textMuted}
              autoCorrect={false}
              className={INPUT_CLASS}
              accessibilityLabel={t('labs.searchPlaceholder', {
                defaultValue: 'Search markers (HbA1c, LDL, ...)',
              })}
            />
            <View className="bg-surface rounded-xl overflow-hidden">
              {canCreateCustom && (
                <TouchableOpacity
                  onPress={() =>
                    chooseNew({
                      name: customName,
                      display_name: customName,
                      measurement_type: '',
                      ref_range_low: null,
                      ref_range_high: null,
                    })
                  }
                  className="px-4 py-3.5 border-b border-border-subtle"
                  accessibilityRole="button"
                >
                  <Text className="text-base font-semibold text-accent-primary">
                    {t('labs.createCustom', {
                      defaultValue: 'Add "{{name}}" as a new marker',
                      name: customName,
                    })}
                  </Text>
                </TouchableOpacity>
              )}
              {options.slice(0, PICKER_LIMIT).map((option, index) => {
                const key =
                  option.kind === 'existing'
                    ? option.category.id
                    : `preset-${option.preset.key}`;
                const title =
                  option.kind === 'existing'
                    ? labMarkerName(option.category)
                    : option.preset.displayName;
                const unitLabel =
                  option.kind === 'existing'
                    ? option.category.measurement_type
                    : option.preset.unit;
                return (
                  <TouchableOpacity
                    key={key}
                    onPress={() =>
                      option.kind === 'existing'
                        ? setSelection({
                            kind: 'existing',
                            categoryId: option.category.id,
                          })
                        : chooseNew(newLabMarkerFromPreset(option.preset, sex))
                    }
                    className={`px-4 py-3 flex-row items-center justify-between ${
                      index > 0 || canCreateCustom
                        ? 'border-t border-border-subtle'
                        : ''
                    }`}
                    accessibilityRole="button"
                  >
                    <Text className="text-base text-text-primary flex-1 mr-3">
                      {title}
                    </Text>
                    <Text className="text-xs text-text-muted">{unitLabel}</Text>
                  </TouchableOpacity>
                );
              })}
              {options.length === 0 && !canCreateCustom && (
                <Text className="px-4 py-3.5 text-sm text-text-muted">
                  {t('labs.noMatches', { defaultValue: 'No matching markers' })}
                </Text>
              )}
            </View>
          </View>
        ) : (
          <>
            <View className="flex-row items-center justify-between">
              <Text className="text-text-primary text-lg font-bold flex-1 mr-3">
                {markerTitle}
              </Text>
              {!route.params?.categoryId && (
                <TouchableOpacity
                  onPress={() => setSelection(null)}
                  accessibilityRole="button"
                >
                  <Text className="text-sm font-semibold text-accent-primary">
                    {t('labs.changeMarker', { defaultValue: 'Change' })}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            <View className="gap-1.5">
              <Text className="text-text-secondary text-sm font-medium">
                {t('labs.value', { defaultValue: 'Result' })}
              </Text>
              <View className="flex-row items-center gap-2">
                <TextInput
                  value={valueText}
                  onChangeText={setValueText}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={textMuted}
                  className={`${INPUT_CLASS} flex-1`}
                  accessibilityLabel={t('labs.value', {
                    defaultValue: 'Result',
                  })}
                />
                {isNew ? (
                  <TextInput
                    value={unit}
                    onChangeText={setUnit}
                    placeholder={t('labs.unit', { defaultValue: 'Unit' })}
                    placeholderTextColor={textMuted}
                    autoCapitalize="none"
                    className={`${INPUT_CLASS} w-28`}
                    accessibilityLabel={t('labs.unit', {
                      defaultValue: 'Unit',
                    })}
                  />
                ) : (
                  <Text className="text-base text-text-secondary">
                    {existing?.measurement_type}
                  </Text>
                )}
              </View>
              {!isNew && existing && (
                <Text className="text-xs text-text-muted">
                  {formatLabRange(
                    existing.ref_range_low,
                    existing.ref_range_high,
                    existing.measurement_type
                  )
                    ? t('labs.referenceRange', {
                        defaultValue: 'Reference range: {{range}}',
                        range: formatLabRange(
                          existing.ref_range_low,
                          existing.ref_range_high,
                          existing.measurement_type
                        ),
                      })
                    : ''}
                </Text>
              )}
            </View>

            {isNew && (
              <View className="gap-1.5">
                <Text className="text-text-secondary text-sm font-medium">
                  {t('labs.rangeOptional', {
                    defaultValue: 'Reference range (optional)',
                  })}
                </Text>
                <View className="flex-row items-center gap-2">
                  <TextInput
                    value={lowText}
                    onChangeText={setLowText}
                    keyboardType="decimal-pad"
                    placeholder={t('labs.rangeLow', { defaultValue: 'Low' })}
                    placeholderTextColor={textMuted}
                    className={`${INPUT_CLASS} flex-1`}
                    accessibilityLabel={t('labs.rangeLow', {
                      defaultValue: 'Low',
                    })}
                  />
                  <TextInput
                    value={highText}
                    onChangeText={setHighText}
                    keyboardType="decimal-pad"
                    placeholder={t('labs.rangeHigh', { defaultValue: 'High' })}
                    placeholderTextColor={textMuted}
                    className={`${INPUT_CLASS} flex-1`}
                    accessibilityLabel={t('labs.rangeHigh', {
                      defaultValue: 'High',
                    })}
                  />
                </View>
                {sexSpecificHint && (
                  <Text className="text-xs text-text-muted">
                    {sex
                      ? t('labs.rangeForSex', {
                          defaultValue:
                            'Prefilled for {{sex}} adults from your profile. Labs differ, so edit it to match your report.',
                          sex:
                            sex === 'male'
                              ? t('labs.sex.male', { defaultValue: 'male' })
                              : t('labs.sex.female', {
                                  defaultValue: 'female',
                                }),
                        })
                      : t('labs.rangeNoSex', {
                          defaultValue:
                            'This marker differs by sex. Set your sex in your profile for a tailored range, or enter the range from your report.',
                        })}
                  </Text>
                )}
                {!rangeValid && (
                  <Text className="text-xs text-danger">
                    {t('labs.rangeInvalid', {
                      defaultValue:
                        'Enter numbers, with the low value not above the high value.',
                    })}
                  </Text>
                )}
              </View>
            )}

            <View className="gap-1.5">
              <Text className="text-text-secondary text-sm font-medium">
                {t('labs.date', { defaultValue: 'Date of test' })}
              </Text>
              <TouchableOpacity
                onPress={() => calendarRef.current?.present()}
                className="flex-row items-center px-3 py-2.5 rounded-lg border border-border-subtle bg-raised min-h-11"
                accessibilityRole="button"
                accessibilityLabel={t('labs.date', {
                  defaultValue: 'Date of test',
                })}
              >
                <Text className="text-base text-text-primary">
                  {formatDateLabel(date, t, dateLocale)}
                </Text>
              </TouchableOpacity>
              {!dateValid && (
                <Text className="text-xs text-danger">
                  {t('labs.dateFuture', {
                    defaultValue: 'The test date cannot be in the future.',
                  })}
                </Text>
              )}
              <Text className="text-xs text-text-muted">
                {t('labs.oneResultPerDay', {
                  defaultValue:
                    'Saving a second result for the same marker and day replaces the first.',
                })}
              </Text>
            </View>

            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder={t('labs.notesPlaceholder', {
                defaultValue: 'Add a note (optional)',
              })}
              placeholderTextColor={textMuted}
              multiline
              textAlignVertical="top"
              className={`${INPUT_CLASS} min-h-20`}
            />
          </>
        )}
      </ScrollView>
      {selection !== null && !usesNativeHeader && (
        <FooterSaveBar
          onPress={handleSave}
          busy={save.isPending}
          disabled={!canSave}
        />
      )}
      <CalendarSheet
        ref={calendarRef}
        selectedDate={date}
        onSelectDate={(d) => {
          setDate(d);
          calendarRef.current?.dismiss();
        }}
      />
    </View>
  );
};

export default LabResultAddScreen;
