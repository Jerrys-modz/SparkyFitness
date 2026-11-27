import React, { useEffect, useRef, useState } from 'react';
import {
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
  bloodPressureBodyPositionSchema,
  instantHourMinute,
  instantToDay,
  isBloodPressureInFuture,
  localDateTimeToUtc,
  type BloodPressureArm,
  type BloodPressureBodyPosition,
} from '@workspace/shared';
import CalendarSheet, {
  type CalendarSheetRef,
} from '../components/CalendarSheet';
import { FooterSaveBar } from '../components/FormScreenChrome';
import TimeSheet, { type TimeSheetRef } from '../components/TimeSheet';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useMobileFeatures } from '../hooks/useMobileFeatures';
import { usePreferences } from '../hooks/usePreferences';
import { formatTimeLabel } from '../utils/entryTimeDisplay';
import {
  useCreateBloodPressure,
  useUpdateBloodPressure,
} from '../hooks/useBloodPressure';
import {
  formatDateLabel,
  getDateRelationToToday,
  getDeviceTimezone,
  getTodayDate,
} from '../utils/dateUtils';
import { ApiError } from '../services/api/errors';
import {
  bloodPressureArmLabel,
  bloodPressurePositionLabel,
} from '../utils/bloodPressureCopy';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'BloodPressureAdd'>;

const INPUT_CLASS =
  'bg-surface border border-border rounded-xl px-3.5 py-2.5 text-sm text-text-primary';

const parseWhole = (text: string): number | null => {
  const trimmed = text.trim();
  if (trimmed === '' || !/^\d+$/.test(trimmed)) return null;
  return Number(trimmed);
};

const BloodPressureAddScreen: React.FC<Props> = ({ navigation, route }) => {
  const { t, i18n } = useTranslation();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const [textMuted] = useCSSVariable(['--color-text-muted']) as [string];
  const dateLocale = i18n.language.startsWith('pl') ? 'pl-PL' : 'en-US';
  const calendarRef = useRef<CalendarSheetRef>(null);
  const timeSheetRef = useRef<TimeSheetRef>(null);
  const { preferences } = usePreferences();
  const { isEnabled } = useMobileFeatures();
  const featureOn = isEnabled('bloodPressure');
  // A screen reached after the feature was turned off (an old navigation
  // state or link) closes instead of letting readings be added.
  useEffect(() => {
    if (!featureOn) navigation.goBack();
  }, [featureOn, navigation]);
  const create = useCreateBloodPressure();
  const update = useUpdateBloodPressure();

  const editing = route.params?.reading ?? null;
  // A reading from a device keeps its values and time (the next sync would
  // write them back); only the context the person adds can change.
  const editingSynced = editing?.synced === true;
  const timezone = getDeviceTimezone();
  const originalDate = editing ? instantToDay(editing.at, timezone) : null;
  const clock = (at: number | Date): string => {
    const { hour, minute } = instantHourMinute(at, timezone);
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  };
  const originalTime = editing ? clock(editing.at) : null;

  const [systolicText, setSystolicText] = useState(
    editing ? String(editing.systolic) : ''
  );
  const [diastolicText, setDiastolicText] = useState(
    editing ? String(editing.diastolic) : ''
  );
  const [pulseText, setPulseText] = useState(
    editing?.pulse != null ? String(editing.pulse) : ''
  );
  const [arm, setArm] = useState<BloodPressureArm | null>(
    editing?.arm === 'left' || editing?.arm === 'right' ? editing.arm : null
  );
  const [position, setPosition] = useState<BloodPressureBodyPosition | null>(
    bloodPressureBodyPositionSchema.safeParse(editing?.bodyPosition).success
      ? (editing?.bodyPosition as BloodPressureBodyPosition)
      : null
  );
  const [note, setNote] = useState(editing?.note ?? '');
  const [date, setDate] = useState(originalDate ?? getTodayDate());
  // The time of the reading: now for a new one, its own time when editing.
  const [time, setTime] = useState(originalTime ?? clock(new Date()));

  const systolic = parseWhole(systolicText);
  const diastolic = parseWhole(diastolicText);
  const pulse = pulseText.trim() === '' ? null : parseWhole(pulseText);
  const pulseValid =
    pulseText.trim() === '' || (pulse !== null && pulse >= 20 && pulse <= 300);
  const valuesValid =
    systolic !== null &&
    diastolic !== null &&
    systolic >= 30 &&
    systolic <= 300 &&
    diastolic >= 10 &&
    diastolic <= 200 &&
    systolic > diastolic;
  const dateValid = getDateRelationToToday(date) !== 'future';
  const takenAt = localDateTimeToUtc(`${date}T${time}`, timezone);
  const timeValid = !isBloodPressureInFuture(takenAt);
  const saving = create.isPending || update.isPending;
  const canSave = editingSynced
    ? pulseValid && !saving
    : valuesValid && pulseValid && dateValid && timeValid && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    const context = {
      pulse_bpm: pulse,
      arm,
      body_position: position,
      note: note.trim() === '' ? null : note.trim(),
    };
    try {
      if (editing && editingSynced) {
        await update.mutateAsync({ id: editing.id, body: context });
      } else if (editing && systolic !== null && diastolic !== null) {
        await update.mutateAsync({
          id: editing.id,
          body: {
            ...context,
            systolic_mmhg: systolic,
            diastolic_mmhg: diastolic,
            // Only a changed day or time moves the reading.
            ...(date !== originalDate || time !== originalTime
              ? { timestamp: takenAt.toISOString() }
              : {}),
          },
        });
      } else if (systolic !== null && diastolic !== null) {
        await create.mutateAsync({
          ...context,
          systolic_mmhg: systolic,
          diastolic_mmhg: diastolic,
          timestamp: takenAt.toISOString(),
        });
      }
      navigation.goBack();
    } catch (error) {
      Toast.show({
        type: 'error',
        text1:
          error instanceof ApiError && error.statusCode === 409
            ? t('bloodPressure.duplicate', {
                defaultValue: 'A reading already exists at this exact time',
              })
            : t('bloodPressure.saveFailed', {
                defaultValue: 'Could not save the reading',
              }),
      });
    }
  };

  const header = useScreenHeader({
    title: editing
      ? t('screens.bloodPressureEdit', { defaultValue: 'Edit reading' })
      : t('screens.bloodPressureAdd', { defaultValue: 'Add reading' }),
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
        busy: saving,
        disabled: !canSave,
        placement: 'native-only',
        identifier: 'blood-pressure-save',
      },
    ],
  });

  const chip = (
    label: string,
    selected: boolean,
    onPress: () => void,
    key: string
  ) => (
    <TouchableOpacity
      key={key}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={`px-3 py-1.5 rounded-full border ${
        selected
          ? 'bg-accent-primary border-accent-primary'
          : 'border-border-subtle'
      }`}
    >
      <Text
        className={`text-sm ${
          selected ? 'text-white font-semibold' : 'text-text-secondary'
        }`}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <View className="flex-1 bg-background">
      {header}
      <ScrollView
        className="flex-1 px-4 py-3"
        contentContainerClassName="gap-4 pb-6"
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-row gap-3">
          <View className="flex-1 gap-1.5">
            <Text className="text-text-secondary text-sm font-medium">
              {t('bloodPressure.systolic', { defaultValue: 'Systolic' })}
            </Text>
            <TextInput
              value={systolicText}
              editable={!editingSynced}
              onChangeText={setSystolicText}
              keyboardType="number-pad"
              placeholder="120"
              placeholderTextColor={textMuted}
              className={INPUT_CLASS}
              accessibilityLabel={t('bloodPressure.systolic', {
                defaultValue: 'Systolic',
              })}
            />
          </View>
          <View className="flex-1 gap-1.5">
            <Text className="text-text-secondary text-sm font-medium">
              {t('bloodPressure.diastolic', { defaultValue: 'Diastolic' })}
            </Text>
            <TextInput
              value={diastolicText}
              editable={!editingSynced}
              onChangeText={setDiastolicText}
              keyboardType="number-pad"
              placeholder="80"
              placeholderTextColor={textMuted}
              className={INPUT_CLASS}
              accessibilityLabel={t('bloodPressure.diastolic', {
                defaultValue: 'Diastolic',
              })}
            />
          </View>
        </View>
        {editingSynced && (
          <Text className="text-xs text-text-secondary">
            {t('bloodPressure.syncedEditNote', {
              defaultValue:
                'This reading came from a device or health app. Its values and time stay as measured; you can add the arm, position, pulse and a note.',
            })}
          </Text>
        )}
        {!editingSynced &&
          systolicText !== '' &&
          diastolicText !== '' &&
          !valuesValid && (
            <Text className="text-xs text-text-danger-subtle">
              {t('bloodPressure.valuesInvalid', {
                defaultValue:
                  'Enter whole numbers in mmHg, with the systolic value above the diastolic one.',
              })}
            </Text>
          )}

        <View className="gap-1.5">
          <Text className="text-text-secondary text-sm font-medium">
            {t('bloodPressure.pulse', { defaultValue: 'Pulse (bpm)' })}
          </Text>
          <TextInput
            value={pulseText}
            onChangeText={setPulseText}
            keyboardType="number-pad"
            placeholder={t('bloodPressure.optional', {
              defaultValue: 'Optional',
            })}
            placeholderTextColor={textMuted}
            className={INPUT_CLASS}
          />
          {!pulseValid && (
            <Text className="text-xs text-text-danger-subtle">
              {t('bloodPressure.pulseInvalid', {
                defaultValue: 'Enter a pulse between 20 and 300.',
              })}
            </Text>
          )}
        </View>

        <View className="gap-1.5">
          <Text className="text-text-secondary text-sm font-medium">
            {t('bloodPressure.arm', { defaultValue: 'Arm' })}
          </Text>
          <View className="flex-row gap-2">
            {(['left', 'right'] as const).map((option) =>
              chip(
                bloodPressureArmLabel(t, option),
                arm === option,
                () => setArm(arm === option ? null : option),
                option
              )
            )}
          </View>
        </View>

        <View className="gap-1.5">
          <Text className="text-text-secondary text-sm font-medium">
            {t('bloodPressure.position', { defaultValue: 'Position' })}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {bloodPressureBodyPositionSchema.options.map((option) =>
              chip(
                bloodPressurePositionLabel(t, option),
                position === option,
                () => setPosition(position === option ? null : option),
                option
              )
            )}
          </View>
        </View>

        <View className="gap-1.5">
          <Text className="text-text-secondary text-sm font-medium">
            {t('bloodPressure.date', { defaultValue: 'Date' })}
          </Text>
          <TouchableOpacity
            onPress={() => calendarRef.current?.present()}
            disabled={editingSynced}
            className="flex-row items-center px-3 py-2.5 rounded-lg border border-border-subtle bg-raised min-h-11"
            accessibilityRole="button"
            accessibilityLabel={t('bloodPressure.date', {
              defaultValue: 'Date',
            })}
          >
            <Text className="text-base text-text-primary">
              {formatDateLabel(date, t, dateLocale)}
            </Text>
          </TouchableOpacity>
          {!dateValid && (
            <Text className="text-xs text-text-danger-subtle">
              {t('bloodPressure.dateFuture', {
                defaultValue: 'The date cannot be in the future.',
              })}
            </Text>
          )}
        </View>

        <View className="gap-1.5">
          <Text className="text-text-secondary text-sm font-medium">
            {t('bloodPressure.time', { defaultValue: 'Time' })}
          </Text>
          <TouchableOpacity
            onPress={() => timeSheetRef.current?.present()}
            disabled={editingSynced}
            className="flex-row items-center px-3 py-2.5 rounded-lg border border-border-subtle bg-raised min-h-11"
            accessibilityRole="button"
            accessibilityLabel={t('bloodPressure.time', {
              defaultValue: 'Time',
            })}
          >
            <Text className="text-base text-text-primary">
              {formatTimeLabel(time, preferences?.time_format) ?? time}
            </Text>
          </TouchableOpacity>
          {!timeValid && (
            <Text className="text-xs text-text-danger-subtle">
              {t('bloodPressure.timeFuture', {
                defaultValue: 'The time cannot be in the future.',
              })}
            </Text>
          )}
        </View>

        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder={t('bloodPressure.notePlaceholder', {
            defaultValue: 'Add a note (optional)',
          })}
          placeholderTextColor={textMuted}
          multiline
          maxLength={500}
          textAlignVertical="top"
          className={`${INPUT_CLASS} min-h-20`}
        />
      </ScrollView>
      {!usesNativeHeader && (
        <FooterSaveBar onPress={handleSave} busy={saving} disabled={!canSave} />
      )}
      <TimeSheet ref={timeSheetRef} value={time} onSelectTime={setTime} />
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

export default BloodPressureAddScreen;
