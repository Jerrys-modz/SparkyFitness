import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import Toast from 'react-native-toast-message';
import {
  CHECKIN_COACH_IDS,
  COACH_CHECKINS_MAX_PER_DAY,
  findBuiltinCoach,
} from '@workspace/shared';
import BottomSheetPicker from './BottomSheetPicker';
import SettingsRow, { SettingsRowGroup } from './SettingsRow';
import Button from './ui/Button';
import Switch from './ui/Switch';
import { BUILTIN_COACH_NAMES } from '../constants/coaches';
import { useCoachCheckinSettings } from '../hooks/useCoachCheckins';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

/**
 * Coach check-ins (#2013): let chosen built-in coaches leave a short message
 * when the rules find something worth saying. Off until switched on.
 */
const CoachCheckinSettingsSection: React.FC = () => {
  const { t } = useTranslation();
  const { settings, isError, save, checkNow } = useCoachCheckinSettings();
  const notifyOnPhone = useAppPreferencesStore(
    (s) => s.coachMessageNotificationsEnabled
  );
  const setNotifyOnPhone = useAppPreferencesStore(
    (s) => s.setCoachMessageNotificationsEnabled
  );
  const locked = !settings || save.isPending;

  const hourOptions = useMemo(
    () =>
      HOURS.map((hour) => ({
        value: hour,
        label: `${String(hour).padStart(2, '0')}:00`,
      })),
    []
  );

  const showSaveError = () =>
    Toast.show({
      type: 'error',
      text1: t('coachCheckins.saveFailed', {
        defaultValue: 'Could not save the check-in settings. Try again.',
      }),
    });

  const toggleCoach = (coachId: string, on: boolean) => {
    if (!settings) return;
    const without = settings.coach_ids.filter((id) => id !== coachId);
    save.mutate(
      {
        // Keep the canonical order whatever order they were switched on in.
        coach_ids: CHECKIN_COACH_IDS.filter(
          (id) => without.includes(id) || (on && id === coachId)
        ),
      },
      { onError: showSaveError }
    );
  };

  const runCheckNow = () =>
    checkNow.mutate(undefined, {
      onSuccess: ({ created }) =>
        Toast.show({
          type: 'success',
          text1:
            created > 0
              ? t('coachCheckins.checkNowCreated', {
                  defaultValue: '{{count}} new messages on the Dashboard.',
                  defaultValue_one: '{{count}} new message on the Dashboard.',
                  defaultValue_other:
                    '{{count}} new messages on the Dashboard.',
                  count: created,
                })
              : t('coachCheckins.checkNowNone', {
                  defaultValue: 'Nothing to say right now.',
                }),
        }),
      onError: showSaveError,
    });

  return (
    <View>
      <SettingsRowGroup>
        <SettingsRow
          title={t('coachCheckins.title', { defaultValue: 'Coach check-ins' })}
          subtitleNumberOfLines={0}
          subtitle={
            isError
              ? t('coachCheckins.loadFailed', {
                  defaultValue: 'Could not load the check-in settings.',
                })
              : t('coachCheckins.help', {
                  defaultValue:
                    'Once a day your coaches look at your finished days and leave a short message on the Dashboard when something is worth saying, at most {{max}} a day. They stay quiet otherwise. This applies on web and mobile.',
                  max: COACH_CHECKINS_MAX_PER_DAY,
                })
          }
          rightAccessory={
            <Switch
              accessibilityLabel={t('coachCheckins.title', {
                defaultValue: 'Coach check-ins',
              })}
              value={settings?.enabled ?? false}
              disabled={locked}
              onValueChange={(enabled) =>
                save.mutate({ enabled }, { onError: showSaveError })
              }
            />
          }
        />
      </SettingsRowGroup>

      {settings?.enabled && (
        <View className="mt-3 gap-3">
          <Text className="text-text-primary font-semibold">
            {t('coachCheckins.coaches', {
              defaultValue: 'Coaches that may check in',
            })}
          </Text>
          <SettingsRowGroup>
            {CHECKIN_COACH_IDS.map((coachId) => {
              const coach = findBuiltinCoach(coachId);
              if (!coach) return null;
              const name = BUILTIN_COACH_NAMES[coach.key](t);
              return (
                <SettingsRow
                  key={coachId}
                  title={name}
                  rightAccessory={
                    <Switch
                      accessibilityLabel={name}
                      value={settings.coach_ids.includes(coachId)}
                      disabled={locked}
                      onValueChange={(on) => toggleCoach(coachId, on)}
                    />
                  }
                />
              );
            })}
          </SettingsRowGroup>

          <View className="flex-row items-center justify-between">
            <Text className="text-text-primary">
              {t('coachCheckins.hour', { defaultValue: 'Check in from' })}
            </Text>
            <BottomSheetPicker
              value={settings.checkin_hour}
              options={hourOptions}
              title={t('coachCheckins.hour', { defaultValue: 'Check in from' })}
              onSelect={(checkin_hour) =>
                save.mutate({ checkin_hour }, { onError: showSaveError })
              }
            />
          </View>

          <SettingsRowGroup>
            <SettingsRow
              title={t('coachCheckins.aiWording', {
                defaultValue: 'Let my AI service word them',
              })}
              subtitleNumberOfLines={0}
              subtitle={t('coachCheckins.aiWordingHint', {
                defaultValue:
                  'Off: messages use ready-made sentences and no AI request is made. On: each message is one request to your AI service, made in the background, and it respects what Sparky remembers.',
              })}
              rightAccessory={
                <Switch
                  accessibilityLabel={t('coachCheckins.aiWording', {
                    defaultValue: 'Let my AI service word them',
                  })}
                  value={settings.ai_wording}
                  disabled={locked}
                  onValueChange={(ai_wording) =>
                    save.mutate({ ai_wording }, { onError: showSaveError })
                  }
                />
              }
            />
            <SettingsRow
              title={t('coachCheckins.notify', {
                defaultValue: 'Notify me on this phone',
              })}
              subtitleNumberOfLines={0}
              subtitle={t('coachCheckins.notifyHint', {
                defaultValue:
                  'A new message raises a notification the next time the app syncs in the background, so it can arrive some time after it was written. Needs notifications and background sync to be on.',
              })}
              rightAccessory={
                <Switch
                  accessibilityLabel={t('coachCheckins.notify', {
                    defaultValue: 'Notify me on this phone',
                  })}
                  value={notifyOnPhone}
                  onValueChange={setNotifyOnPhone}
                />
              }
            />
          </SettingsRowGroup>

          <Button
            variant="outline"
            disabled={checkNow.isPending || settings.coach_ids.length === 0}
            onPress={runCheckNow}
          >
            {t('coachCheckins.checkNow', { defaultValue: 'Check now' })}
          </Button>
        </View>
      )}
    </View>
  );
};

export default CoachCheckinSettingsSection;
