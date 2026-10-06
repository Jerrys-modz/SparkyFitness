import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import { useCSSVariable } from 'uniwind';
import { APPOINTMENT_TYPES } from '@workspace/shared';
import {
  useAppointmentMutations,
  useAppointments,
} from '../../../hooks/useAppointments';
import { usePreferences } from '../../../hooks/usePreferences';
import { getApiErrorMessage } from '../../../services/api/errors';
import { getTodayDate } from '../../../utils/dateUtils';
import { formatDateTime } from '../../../utils/fasting';
import CalendarSheet, { type CalendarSheetRef } from '../../CalendarSheet';
import TimeSheet, { type TimeSheetRef } from '../../TimeSheet';
import FormInput from '../../FormInput';
import Icon from '../../Icon';
import Button from '../../ui/Button';

const DEFAULT_TIME = '09:00';

const AppointmentsPanel: React.FC = () => {
  const { t } = useTranslation();
  const { preferences } = usePreferences();
  const { appointments, isLoading } = useAppointments();
  const { createAppointmentAsync, isCreating, deleteAppointmentAsync } =
    useAppointmentMutations();
  const [mutedColor] = useCSSVariable(['--color-text-muted']) as [string];
  const calendarRef = useRef<CalendarSheetRef>(null);
  const timeRef = useRef<TimeSheetRef>(null);

  const [adding, setAdding] = useState(false);
  const [date, setDate] = useState(getTodayDate);
  const [time, setTime] = useState(DEFAULT_TIME);
  const [type, setType] = useState<string>('checkup');
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');

  const typeLabels: Record<string, string> = {
    checkup: t('appointments.types.checkup', {
      defaultValue: 'Prenatal checkup',
    }),
    ultrasound: t('appointments.types.ultrasound', {
      defaultValue: 'Ultrasound / scan',
    }),
    glucose_test: t('appointments.types.glucose_test', {
      defaultValue: 'Glucose screening',
    }),
    bloodwork: t('appointments.types.bloodwork', {
      defaultValue: 'Bloodwork',
    }),
    specialist: t('appointments.types.specialist', {
      defaultValue: 'Specialist',
    }),
    class: t('appointments.types.class', {
      defaultValue: 'Birth / parenting class',
    }),
    other: t('appointments.types.other', { defaultValue: 'Other' }),
  };

  const typeLabel = (value: string | null) =>
    (value && typeLabels[value]) ||
    t('appointments.appointment', { defaultValue: 'Appointment' });

  const reportError = (error: unknown) => {
    Toast.show({
      type: 'error',
      text1: t('appointments.error', {
        defaultValue: 'Could not update appointments',
      }),
      text2: getApiErrorMessage(error) ?? undefined,
    });
  };

  const submit = async () => {
    const scheduled = new Date(`${date}T${time}:00`);
    if (Number.isNaN(scheduled.getTime())) return;
    try {
      await createAppointmentAsync({
        scheduled_at: scheduled.toISOString(),
        appointment_type: type,
        title: title.trim() || null,
        location: location.trim() || null,
      });
      setAdding(false);
      setTitle('');
      setLocation('');
      setTime(DEFAULT_TIME);
      setType('checkup');
    } catch (error) {
      reportError(error);
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteAppointmentAsync(id);
    } catch (error) {
      reportError(error);
    }
  };

  return (
    <View className="bg-surface rounded-xl p-4 shadow-sm gap-3">
      <View className="flex-row items-center justify-between">
        <Text className="text-base font-bold text-text-secondary">
          {t('appointments.title', { defaultValue: 'Appointments' })}
        </Text>
        <Button variant="ghost" onPress={() => setAdding((value) => !value)}>
          {adding
            ? t('common.cancel', { defaultValue: 'Cancel' })
            : t('appointments.add', { defaultValue: 'Add' })}
        </Button>
      </View>

      {adding && (
        <View className="gap-3">
          <View className="flex-row gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onPress={() => calendarRef.current?.present()}
            >
              {date}
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onPress={() => timeRef.current?.present()}
            >
              {time}
            </Button>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-2">
              {APPOINTMENT_TYPES.map((item) => (
                <TouchableOpacity
                  key={item.value}
                  onPress={() => setType(item.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: type === item.value }}
                  className={`rounded-full px-3 py-1.5 ${
                    type === item.value ? 'bg-accent-primary' : 'bg-raised'
                  }`}
                >
                  <Text
                    className={`text-sm ${
                      type === item.value
                        ? 'text-white font-semibold'
                        : 'text-text-primary'
                    }`}
                  >
                    {typeLabel(item.value)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
          <FormInput
            value={title}
            onChangeText={setTitle}
            placeholder={t('appointments.titlePlaceholder', {
              defaultValue: 'Title (optional)',
            })}
          />
          <FormInput
            value={location}
            onChangeText={setLocation}
            placeholder={t('appointments.locationPlaceholder', {
              defaultValue: 'Location (optional)',
            })}
          />
          <Button variant="primary" onPress={submit} loading={isCreating}>
            {t('appointments.save', { defaultValue: 'Save appointment' })}
          </Button>
        </View>
      )}

      {!isLoading && appointments.length === 0 && (
        <Text className="text-text-secondary text-sm text-center py-2">
          {t('appointments.empty', { defaultValue: 'No appointments yet.' })}
        </Text>
      )}

      {appointments.map((appointment) => (
        <View
          key={appointment.id}
          className="flex-row items-center justify-between bg-raised rounded-lg px-3 py-2"
        >
          <View className="flex-1 mr-2">
            <Text className="text-text-primary text-sm font-semibold">
              {appointment.title || typeLabel(appointment.appointment_type)}
            </Text>
            <Text className="text-text-secondary text-xs">
              {formatDateTime(
                new Date(appointment.scheduled_at),
                preferences?.time_format
              )}
              {appointment.location ? ` · ${appointment.location}` : ''}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => remove(appointment.id)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('appointments.delete', {
              defaultValue: 'Delete appointment',
            })}
          >
            <Icon name="trash" size={18} color={mutedColor} />
          </TouchableOpacity>
        </View>
      ))}

      <CalendarSheet
        ref={calendarRef}
        selectedDate={date}
        onSelectDate={setDate}
      />
      <TimeSheet ref={timeRef} value={time} onSelectTime={setTime} />
    </View>
  );
};

export default AppointmentsPanel;
