import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCSSVariable } from 'uniwind';
import Toast from 'react-native-toast-message';
import { isValidTimeZone } from '@workspace/shared';

import Icon from '../components/Icon';
import BottomSheetPicker from '../components/BottomSheetPicker';
import CalendarSheet, {
  type CalendarSheetRef,
} from '../components/CalendarSheet';
import FormInput from '../components/FormInput';
import SafeImage from '../components/SafeImage';
import SettingsRow, { SettingsRowGroup } from '../components/SettingsRow';
import StatusView from '../components/StatusView';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { FooterSaveBar } from '../components/FormScreenChrome';
import { useProfile } from '../hooks/useProfile';
import { usePreferences } from '../hooks/usePreferences';
import { useServerConfigs } from '../hooks';
import { useAuthedImageSource } from '../hooks/useAuthedImageSource';
import { useScreenHeader } from '../hooks/useScreenHeader';
import {
  accountEmailQueryKey,
  preferencesQueryKey,
  profileQueryKey,
} from '../hooks/queryKeys';
import { updatePreferences } from '../services/api/preferencesApi';
import {
  fetchAccountEmail,
  updateProfile,
  uploadAvatar,
} from '../services/api/profileApi';
import { requestPasswordReset } from '../services/api/authService';
import { getApiErrorMessage } from '../services/api/errors';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { pickImageFromCamera, pickImagesFromLibrary } from '../utils/pickImage';
import {
  formatDate,
  getDeviceTimezone,
  normalizeDate,
} from '../utils/dateUtils';
import type { UserProfile } from '../types/profile';
import type { RootStackScreenProps } from '../types/navigation';

type ProfileScreenProps = RootStackScreenProps<'Profile'>;

const AVATAR_SIZE = 96;
// Calendar starting point when no birth date is set yet.
const DEFAULT_BIRTH_DATE = '1990-01-01';
// Used where the runtime has no Intl.supportedValuesOf (older Hermes builds).
const FALLBACK_TIMEZONES = [
  'UTC',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Warsaw',
  'Europe/Moscow',
  'Africa/Cairo',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Bangkok',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Auckland',
];

function listTimezones(extra: (string | null | undefined)[]): string[] {
  let zones: string[];
  try {
    zones = Intl.supportedValuesOf('timeZone');
  } catch {
    zones = FALLBACK_TIMEZONES;
  }
  const set = new Set(zones);
  set.add('UTC');
  for (const tz of extra) {
    if (tz && isValidTimeZone(tz)) set.add(tz);
  }
  return [...set].sort();
}

const ProfileScreen: React.FC<ProfileScreenProps> = () => {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();
  const queryClient = useQueryClient();
  const [accent, textMuted] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
  ]) as [string, string];

  const { profile, isLoading, isError, refetch } = useProfile();
  const { preferences } = usePreferences();
  const { activeConfig } = useServerConfigs();
  const { getPhotoSource } = useAuthedImageSource('/uploads/avatars/');
  const { data: accountEmail } = useQuery({
    queryKey: accountEmailQueryKey,
    queryFn: fetchAccountEmail,
    staleTime: Infinity,
  });

  const calendarSheetRef = useRef<CalendarSheetRef>(null);
  const [fullName, setFullName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const hydratedFor = useRef<string | null>(null);

  // Seed the form once per loaded profile; a later refetch must not clobber
  // what the user is typing.
  useEffect(() => {
    if (!profile || hydratedFor.current === profile.id) return;
    hydratedFor.current = profile.id;
    setFullName(profile.full_name ?? '');
    setBirthDate(
      profile.date_of_birth ? normalizeDate(profile.date_of_birth) : ''
    );
  }, [profile]);

  const savedName = profile?.full_name ?? '';
  const savedBirthDate = profile?.date_of_birth
    ? normalizeDate(profile.date_of_birth)
    : '';
  const isDirty =
    !!profile &&
    (fullName.trim() !== savedName || birthDate !== savedBirthDate);

  const syncProfileCache = useCallback(
    (next: UserProfile) => queryClient.setQueryData(profileQueryKey, next),
    [queryClient]
  );

  const saveMutation = useMutation({
    mutationFn: () =>
      updateProfile({
        // The server COALESCEs, so an unchanged field is simply omitted.
        ...(fullName.trim() !== savedName && fullName.trim() !== ''
          ? { full_name: fullName.trim() }
          : {}),
        ...(birthDate !== savedBirthDate && birthDate !== ''
          ? { date_of_birth: birthDate }
          : {}),
      }),
    onSuccess: (next) => {
      syncProfileCache(next);
      void queryClient.invalidateQueries({ queryKey: profileQueryKey });
      Toast.show({
        type: 'success',
        text1: t('profile.saved', { defaultValue: 'Profile updated' }),
      });
    },
    onError: (err) => {
      Toast.show({
        type: 'error',
        text1: t('profile.saveFailed', {
          defaultValue: 'Could not update your profile',
        }),
        text2: getApiErrorMessage(err) ?? undefined,
      });
    },
  });

  const avatarMutation = useMutation({
    mutationFn: uploadAvatar,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: profileQueryKey });
    },
    onError: (err) => {
      Toast.show({
        type: 'error',
        text1: t('profile.avatarFailed', {
          defaultValue: 'Could not update your photo',
        }),
        text2: getApiErrorMessage(err) ?? undefined,
      });
    },
  });

  const timezoneMutation = useMutation({
    mutationFn: (timezone: string) => updatePreferences({ timezone }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: preferencesQueryKey });
    },
    onError: (err) => {
      Toast.show({
        type: 'error',
        text1: t('profile.timezoneFailed', {
          defaultValue: 'Could not update your timezone',
        }),
        text2: getApiErrorMessage(err) ?? undefined,
      });
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      if (!activeConfig || !accountEmail) {
        throw new Error('Account email unavailable.');
      }
      await requestPasswordReset(activeConfig.url, accountEmail);
    },
    onSuccess: () => {
      Toast.show({
        type: 'success',
        text1: t('profile.resetSent', { defaultValue: 'Reset link sent' }),
        text2: t('profile.resetSentHint', {
          defaultValue:
            'Check {{email}} and open the link to choose a new password.',
          email: accountEmail,
        }),
      });
    },
    onError: (err) => {
      Toast.show({
        type: 'error',
        text1: t('profile.resetFailed', {
          defaultValue: 'Could not send the reset email',
        }),
        text2: getApiErrorMessage(err) ?? undefined,
      });
    },
  });

  const pickerBusy = useRef(false);
  const pickAvatar = useCallback(
    async (source: 'camera' | 'library') => {
      if (pickerBusy.current) return;
      pickerBusy.current = true;
      try {
        let uri: string | undefined;
        if (source === 'camera') {
          const result = await pickImageFromCamera();
          if (result.status === 'denied') {
            Toast.show({
              type: 'error',
              text1: t('profile.cameraPermission', {
                defaultValue: 'Camera permission is required',
              }),
              text2: t('profile.cameraPermissionHint', {
                defaultValue:
                  'Enable camera access for SparkyFitness in Settings.',
              }),
            });
            return;
          }
          if (result.status === 'cancelled') return;
          uri = result.image.uri;
        } else {
          uri = (await pickImagesFromLibrary(1))[0]?.uri;
        }
        if (uri) await avatarMutation.mutateAsync(uri).catch(() => undefined);
      } finally {
        pickerBusy.current = false;
      }
    },
    [avatarMutation, t]
  );

  const handleChangePhoto = useCallback(() => {
    Alert.alert(
      t('profile.changePhoto', { defaultValue: 'Change photo' }),
      undefined,
      [
        {
          text: t('profile.takePhoto', { defaultValue: 'Take photo' }),
          onPress: () => void pickAvatar('camera'),
        },
        {
          text: t('profile.chooseFromLibrary', {
            defaultValue: 'Choose from library',
          }),
          onPress: () => void pickAvatar('library'),
        },
        {
          text: t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
      ]
    );
  }, [pickAvatar, t]);

  const handleSave = useCallback(() => {
    if (!isDirty || saveMutation.isPending) return;
    saveMutation.mutate();
  }, [isDirty, saveMutation]);

  const handleResetPassword = useCallback(() => {
    Alert.alert(
      t('profile.resetPassword', { defaultValue: 'Reset password' }),
      t('profile.resetConfirm', {
        defaultValue: 'Send a password reset link to {{email}}?',
        email: accountEmail,
      }),
      [
        {
          text: t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
        {
          text: t('profile.sendLink', { defaultValue: 'Send link' }),
          onPress: () => resetMutation.mutate(),
        },
      ]
    );
  }, [accountEmail, resetMutation, t]);

  const currentTimezone = preferences?.timezone ?? getDeviceTimezone();
  const timezoneOptions = useMemo(
    () =>
      listTimezones([currentTimezone, getDeviceTimezone()]).map((tz) => ({
        label: tz.replaceAll('_', ' '),
        value: tz,
      })),
    [currentTimezone]
  );

  const avatarFile = profile?.avatar_url?.split('/').pop() ?? '';
  const avatarSource = avatarFile ? getPhotoSource(avatarFile) : null;

  const header = useScreenHeader({
    title: t('screens.profile', { defaultValue: 'Profile' }),
    left: { kind: 'back' },
    right: {
      kind: 'primary',
      label: t('common.save', { defaultValue: 'Save' }),
      busyLabel: t('common.saving', { defaultValue: 'Saving…' }),
      busy: saveMutation.isPending,
      disabled: !isDirty || saveMutation.isPending,
      placement: 'native-only',
      onPress: handleSave,
      identifier: 'profile-save',
    },
  });

  const locale = i18n.language;
  const avatarFallback = (
    <View
      className="items-center justify-center bg-raised"
      style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}
    >
      <Icon name="person" size={48} color={textMuted} />
    </View>
  );

  const renderBody = () => {
    if (isLoading) return <StatusView inline loading />;
    if (isError || !profile) {
      return (
        <StatusView
          inline
          title={t('profile.loadFailed', {
            defaultValue: 'Could not load your profile',
          })}
          action={{
            label: t('common.retry', { defaultValue: 'Retry' }),
            onPress: () => void refetch(),
          }}
        />
      );
    }

    return (
      <>
        <View className="items-center mb-6">
          <Pressable
            onPress={handleChangePhoto}
            disabled={avatarMutation.isPending}
            accessibilityRole="button"
            accessibilityLabel={t('profile.changePhoto', {
              defaultValue: 'Change photo',
            })}
            className="rounded-full overflow-hidden"
            style={{
              width: AVATAR_SIZE,
              height: AVATAR_SIZE,
              opacity: avatarMutation.isPending ? 0.5 : 1,
            }}
          >
            <SafeImage
              source={avatarSource}
              style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}
              contentFit="cover"
              fallback={avatarFallback}
            />
          </Pressable>
          <Pressable
            onPress={handleChangePhoto}
            disabled={avatarMutation.isPending}
            className="mt-2 py-1"
            accessibilityRole="button"
          >
            <Text style={{ color: accent }} className="text-sm font-medium">
              {t('profile.changePhoto', { defaultValue: 'Change photo' })}
            </Text>
          </Pressable>
        </View>

        <View className="mb-4">
          <Text className="text-sm mb-2 text-text-secondary">
            {t('profile.name', { defaultValue: 'Name' })}
          </Text>
          <FormInput
            value={fullName}
            onChangeText={setFullName}
            placeholder={t('profile.namePlaceholder', {
              defaultValue: 'Your name',
            })}
            autoComplete="name"
            textContentType="name"
            returnKeyType="done"
            maxLength={100}
          />
        </View>

        <View className="mb-4">
          <Text className="text-sm mb-2 text-text-secondary">
            {t('profile.birthDate', { defaultValue: 'Birth date' })}
          </Text>
          <Pressable
            onPress={() => calendarSheetRef.current?.present()}
            accessibilityRole="button"
            accessibilityLabel={t('profile.birthDate', {
              defaultValue: 'Birth date',
            })}
            className="flex-row items-center justify-between px-3 py-2.5 rounded-lg border border-border-subtle bg-raised min-h-11"
          >
            <Text
              className={`text-base ${birthDate ? 'text-text-primary' : 'text-text-muted'}`}
            >
              {birthDate
                ? formatDate(birthDate, locale)
                : t('profile.birthDateUnset', { defaultValue: 'Not set' })}
            </Text>
            <Icon name="chevron-down" size={16} color={textMuted} />
          </Pressable>
        </View>

        <View className="mb-6">
          <Text className="text-sm mb-2 text-text-secondary">
            {t('profile.timezone', { defaultValue: 'Timezone' })}
          </Text>
          <BottomSheetPicker
            value={currentTimezone}
            options={timezoneOptions}
            onSelect={(tz) => {
              if (tz !== preferences?.timezone) timezoneMutation.mutate(tz);
            }}
            title={t('profile.timezone', { defaultValue: 'Timezone' })}
            placeholder={currentTimezone}
          />
        </View>

        {accountEmail ? (
          <SettingsRowGroup>
            <SettingsRow
              icon="link"
              title={t('profile.resetPassword', {
                defaultValue: 'Reset password',
              })}
              subtitle={t('profile.resetPasswordSubtitle', {
                defaultValue: 'Email me a link to choose a new password',
              })}
              onPress={handleResetPassword}
              disabled={resetMutation.isPending}
            />
          </SettingsRowGroup>
        ) : null}
      </>
    );
  };

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
        contentInsetAdjustmentBehavior={
          usesNativeHeader ? 'automatic' : 'never'
        }
      >
        {renderBody()}
      </ScrollView>

      {!usesNativeHeader && profile ? (
        <FooterSaveBar
          onPress={handleSave}
          busy={saveMutation.isPending}
          disabled={!isDirty || saveMutation.isPending}
        />
      ) : null}

      <CalendarSheet
        ref={calendarSheetRef}
        selectedDate={birthDate || DEFAULT_BIRTH_DATE}
        onSelectDate={setBirthDate}
      />
    </View>
  );
};

export default ProfileScreen;
