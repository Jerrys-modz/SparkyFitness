import React, { useRef, useState } from 'react';
import {
  Alert,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useCSSVariable } from 'uniwind';
import Toast from 'react-native-toast-message';
import {
  COMMON_VACCINE_NAMES,
  compareDays,
  type CreateImmunizationBody,
} from '@workspace/shared';
import CalendarSheet, {
  type CalendarSheetRef,
} from '../components/CalendarSheet';
import { FooterSaveBar } from '../components/FormScreenChrome';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import {
  useDeleteImmunization,
  useSaveImmunization,
} from '../hooks/useImmunizations';
import { formatDateLabel, getTodayDate } from '../utils/dateUtils';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'ImmunizationForm'>;

const INPUT_CLASS =
  'bg-surface border border-border rounded-xl px-3.5 py-2.5 text-sm text-text-primary';
const SUGGESTION_LIMIT = 6;

const orNull = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

/** Add a vaccine, or edit the one passed as `immunization`. */
const ImmunizationFormScreen: React.FC<Props> = ({ navigation, route }) => {
  const { t, i18n } = useTranslation();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const [textMuted] = useCSSVariable(['--color-text-muted']) as [string];
  const dateLocale = i18n.language.startsWith('pl') ? 'pl-PL' : 'en-US';
  const record = route.params?.immunization ?? null;
  const save = useSaveImmunization();
  const remove = useDeleteImmunization();
  const dateRef = useRef<CalendarSheetRef>(null);
  const dueRef = useRef<CalendarSheetRef>(null);

  const [name, setName] = useState(record?.vaccine_name ?? '');
  const [date, setDate] = useState(record?.administered_on ?? getTodayDate());
  const [nextDue, setNextDue] = useState<string | null>(
    record?.next_due_on ?? null
  );
  const [dose, setDose] = useState(
    record?.dose_number != null ? String(record.dose_number) : ''
  );
  const [lot, setLot] = useState(record?.lot_number ?? '');
  const [administeredBy, setAdministeredBy] = useState(
    record?.administered_by ?? ''
  );
  const [site, setSite] = useState(record?.site ?? '');
  const [code, setCode] = useState(record?.vaccine_code ?? '');
  const [notes, setNotes] = useState(record?.notes ?? '');

  const typed = name.trim().toLowerCase();
  const suggestions =
    typed === ''
      ? []
      : COMMON_VACCINE_NAMES.filter(
          (vaccine) =>
            vaccine.toLowerCase().includes(typed) &&
            vaccine.toLowerCase() !== typed
        ).slice(0, SUGGESTION_LIMIT);

  const doseNumber = dose.trim() === '' ? null : Number(dose);
  const doseValid =
    doseNumber === null ||
    (Number.isInteger(doseNumber) && doseNumber >= 1 && doseNumber <= 20);
  // A saved record keeps the date it has (one a scan read can be dated ahead);
  // only a date typed now must not be in the future.
  const dateValid =
    date === record?.administered_on || compareDays(date, getTodayDate()) <= 0;
  const dueValid = nextDue === null || compareDays(nextDue, date) >= 0;
  const canSave =
    name.trim() !== '' && doseValid && dateValid && dueValid && !save.isPending;

  const handleSave = async () => {
    if (!canSave) return;
    const body: CreateImmunizationBody = {
      vaccine_name: name.trim(),
      vaccine_code: orNull(code),
      administered_on: date,
      dose_number: doseNumber,
      lot_number: orNull(lot),
      administered_by: orNull(administeredBy),
      site: orNull(site),
      next_due_on: nextDue,
      notes: orNull(notes),
    };
    try {
      await save.mutateAsync({ id: record?.id, body });
      navigation.goBack();
    } catch {
      Toast.show({
        type: 'error',
        text1: t('immunizations.saveFailed', {
          defaultValue: 'Could not save the immunization',
        }),
      });
    }
  };

  const confirmDelete = () => {
    if (!record) return;
    Alert.alert(
      t('immunizations.deleteTitle', { defaultValue: 'Delete immunization' }),
      t('immunizations.deleteMessage', {
        defaultValue: 'Delete this immunization record? This cannot be undone.',
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
            remove.mutate(record.id, {
              onSuccess: () => navigation.goBack(),
              onError: () =>
                Toast.show({
                  type: 'error',
                  text1: t('immunizations.deleteFailed', {
                    defaultValue: 'Could not delete the immunization',
                  }),
                }),
            }),
        },
      ]
    );
  };

  const header = useScreenHeader({
    title: record
      ? t('screens.immunizationEdit', { defaultValue: 'Edit immunization' })
      : t('screens.immunizationAdd', { defaultValue: 'Add immunization' }),
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
        identifier: 'immunization-save',
      },
      ...(record
        ? [
            {
              kind: 'menu' as const,
              accessibilityLabel: t('immunizations.moreActions', {
                defaultValue: 'More actions',
              }),
              items: [
                {
                  label: t('immunizations.deleteTitle', {
                    defaultValue: 'Delete immunization',
                  }),
                  sfSymbol: 'trash',
                  icon: 'trash' as const,
                  onPress: confirmDelete,
                },
              ],
              identifier: 'immunization-menu',
            },
          ]
        : []),
    ],
  });

  const field = (
    label: string,
    value: string,
    onChangeText: (text: string) => void,
    extra: { keyboard?: 'numeric'; maxLength?: number } = {}
  ) => (
    <View className="gap-1.5">
      <Text className="text-text-secondary text-sm font-medium">{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor={textMuted}
        keyboardType={extra.keyboard === 'numeric' ? 'number-pad' : 'default'}
        maxLength={extra.maxLength}
        className={INPUT_CLASS}
        accessibilityLabel={label}
      />
    </View>
  );

  return (
    <View className="flex-1 bg-background">
      {header}
      <ScrollView
        className="flex-1 px-4 py-3"
        contentContainerClassName="gap-4 pb-6"
        keyboardShouldPersistTaps="handled"
      >
        <View className="gap-1.5">
          <Text className="text-text-secondary text-sm font-medium">
            {t('immunizations.vaccine', { defaultValue: 'Vaccine' })}
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholderTextColor={textMuted}
            maxLength={200}
            className={INPUT_CLASS}
            accessibilityLabel={t('immunizations.vaccine', {
              defaultValue: 'Vaccine',
            })}
          />
          {suggestions.length > 0 && (
            <View className="bg-surface rounded-xl overflow-hidden">
              {suggestions.map((vaccine, index) => (
                <TouchableOpacity
                  key={vaccine}
                  onPress={() => setName(vaccine)}
                  className={`px-4 py-3 ${
                    index > 0 ? 'border-t border-border-subtle' : ''
                  }`}
                  accessibilityRole="button"
                >
                  <Text className="text-sm text-text-primary">{vaccine}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <View className="gap-1.5">
          <Text className="text-text-secondary text-sm font-medium">
            {t('immunizations.date', { defaultValue: 'Date given' })}
          </Text>
          <TouchableOpacity
            onPress={() => dateRef.current?.present()}
            className={INPUT_CLASS}
            accessibilityRole="button"
          >
            <Text className="text-base text-text-primary">
              {formatDateLabel(date, t, dateLocale)}
            </Text>
          </TouchableOpacity>
          {!dateValid && (
            <Text className="text-xs text-text-danger-subtle">
              {t('immunizations.dateFuture', {
                defaultValue: 'The date given cannot be in the future.',
              })}
            </Text>
          )}
        </View>

        <View className="gap-1.5">
          <Text className="text-text-secondary text-sm font-medium">
            {t('immunizations.nextDueOptional', {
              defaultValue: 'Next due (optional)',
            })}
          </Text>
          <View className="flex-row items-center gap-3">
            <TouchableOpacity
              onPress={() => dueRef.current?.present()}
              className={`${INPUT_CLASS} flex-1`}
              accessibilityRole="button"
            >
              <Text className="text-base text-text-primary">
                {nextDue
                  ? formatDateLabel(nextDue, t, dateLocale)
                  : t('immunizations.notSet', { defaultValue: 'Not set' })}
              </Text>
            </TouchableOpacity>
            {nextDue !== null && (
              <TouchableOpacity
                onPress={() => setNextDue(null)}
                accessibilityRole="button"
              >
                <Text className="text-sm font-semibold text-accent-primary">
                  {t('common.clear', { defaultValue: 'Clear' })}
                </Text>
              </TouchableOpacity>
            )}
          </View>
          {!dueValid && (
            <Text className="text-xs text-text-danger-subtle">
              {t('immunizations.dueBeforeGiven', {
                defaultValue:
                  'The next-due date cannot be before the date given.',
              })}
            </Text>
          )}
        </View>

        {field(
          t('immunizations.dose', { defaultValue: 'Dose number' }),
          dose,
          setDose,
          { keyboard: 'numeric', maxLength: 2 }
        )}
        {!doseValid && (
          <Text className="text-xs text-text-danger-subtle">
            {t('immunizations.doseInvalid', {
              defaultValue: 'Dose number must be from 1 to 20.',
            })}
          </Text>
        )}
        {field(
          t('immunizations.lot', { defaultValue: 'Lot number' }),
          lot,
          setLot,
          { maxLength: 80 }
        )}
        {field(
          t('immunizations.administeredBy', { defaultValue: 'Given by' }),
          administeredBy,
          setAdministeredBy,
          { maxLength: 200 }
        )}
        {field(
          t('immunizations.site', { defaultValue: 'Site' }),
          site,
          setSite,
          {
            maxLength: 80,
          }
        )}
        {field(
          t('immunizations.code', { defaultValue: 'Vaccine code (optional)' }),
          code,
          setCode,
          { maxLength: 40 }
        )}

        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder={t('immunizations.notesPlaceholder', {
            defaultValue: 'Add a note (optional)',
          })}
          placeholderTextColor={textMuted}
          multiline
          maxLength={2000}
          textAlignVertical="top"
          className={`${INPUT_CLASS} min-h-20`}
        />
      </ScrollView>
      {!usesNativeHeader && (
        <FooterSaveBar
          onPress={handleSave}
          busy={save.isPending}
          disabled={!canSave}
        />
      )}
      <CalendarSheet
        ref={dateRef}
        selectedDate={date}
        maxDate={getTodayDate()}
        onSelectDate={(d) => {
          setDate(d);
          dateRef.current?.dismiss();
        }}
      />
      <CalendarSheet
        ref={dueRef}
        selectedDate={nextDue ?? date}
        minDate={date}
        onSelectDate={(d) => {
          setNextDue(d);
          dueRef.current?.dismiss();
        }}
      />
    </View>
  );
};

export default ImmunizationFormScreen;
