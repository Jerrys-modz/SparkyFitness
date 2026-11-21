import { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SettingsRow, { SettingsRowGroup } from '../components/SettingsRow';
import FormInput from '../components/FormInput';
import Switch from '../components/ui/Switch';
import Button from '../components/ui/Button';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useAdminUserAction, useSignedInIdentity } from '../hooks/useAdmin';
import { formatDate } from '../utils/dateUtils';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import type { RootStackScreenProps } from '../types/navigation';

/**
 * Settings → Admin → Users → a user: name, active, admin, password and
 * two-factor resets, and deleting the account. The server refuses changes to
 * the primary admin (set by SPARKY_FITNESS_ADMIN_EMAIL) and says so; the
 * signed-in admin cannot deactivate, demote or delete themselves here.
 */
export default function AdminUserDetailScreen({
  navigation,
  route,
}: RootStackScreenProps<'AdminUserDetail'>) {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const [user, setUser] = useState(route.params.user);
  const [fullName, setFullName] = useState(user.full_name ?? '');
  const header = useScreenHeader({
    title: user.full_name || user.email,
    left: { kind: 'back' },
  });
  const identity = useSignedInIdentity(true);
  const isSelf = identity.data?.authenticatedUserId === user.id;
  // Until the server says who is signed in, this could be the admin's own
  // account, so the changes that would lock them out wait.
  const selfLocked = isSelf || identity.data === undefined;
  const { run, isPending } = useAdminUserAction();
  const name = user.full_name || user.email;

  const confirm = (
    title: string,
    message: string,
    action: string,
    onConfirm: () => void,
    destructive = false
  ) =>
    Alert.alert(title, message, [
      { text: t('common.cancel', { defaultValue: 'Cancel' }), style: 'cancel' },
      {
        text: action,
        style: destructive ? 'destructive' : 'default',
        onPress: onConfirm,
      },
    ]);

  const setActive = (isActive: boolean) =>
    run({ kind: 'status', userId: user.id, isActive }, () =>
      setUser((u) => ({ ...u, is_active: isActive }))
    );

  const setAdmin = (admin: boolean) =>
    confirm(
      admin
        ? t('admin.users.makeAdminTitle', { defaultValue: 'Make admin?' })
        : t('admin.users.removeAdminTitle', {
            defaultValue: 'Remove admin?',
          }),
      admin
        ? t('admin.users.makeAdminMessage', {
            defaultValue:
              '{{name}} will be able to change every setting on this server and manage all users.',
            name,
          })
        : t('admin.users.removeAdminMessage', {
            defaultValue: '{{name}} will no longer be an admin.',
            name,
          }),
      t('admin.users.confirm', { defaultValue: 'Confirm' }),
      () => {
        const role = admin ? 'admin' : 'user';
        run({ kind: 'role', userId: user.id, role }, () =>
          setUser((u) => ({ ...u, role }))
        );
      }
    );

  const trimmedName = fullName.trim();
  const saveName = () =>
    run({ kind: 'fullName', userId: user.id, fullName: trimmedName }, () =>
      setUser((u) => ({ ...u, full_name: trimmedName }))
    );

  const resetPassword = () =>
    confirm(
      t('admin.users.resetPasswordTitle', {
        defaultValue: 'Send a password reset?',
      }),
      t('admin.users.resetPasswordMessage', {
        defaultValue: 'An email with a reset link goes to {{email}}.',
        email: user.email,
      }),
      t('admin.users.send', { defaultValue: 'Send' }),
      () => run({ kind: 'resetPassword', userId: user.id })
    );

  const resetMfa = () =>
    confirm(
      t('admin.users.resetMfaTitle', {
        defaultValue: 'Reset two-factor authentication?',
      }),
      t('admin.users.resetMfaMessage', {
        defaultValue:
          '{{name}} can then sign in with their password alone and set it up again.',
        name,
      }),
      t('admin.users.reset', { defaultValue: 'Reset' }),
      () =>
        run({ kind: 'resetMfa', userId: user.id }, () =>
          setUser((u) => ({
            ...u,
            mfa_totp_enabled: false,
            mfa_email_enabled: false,
          }))
        ),
      true
    );

  const deleteUser = () =>
    confirm(
      t('admin.users.deleteTitle', { defaultValue: 'Delete this user?' }),
      t('admin.users.deleteMessage', {
        defaultValue:
          'Everything {{name}} has saved is deleted with the account. This cannot be undone.',
        name,
      }),
      t('common.delete', { defaultValue: 'Delete' }),
      () => run({ kind: 'delete', userId: user.id }, () => navigation.goBack()),
      true
    );

  const yes = t('admin.users.on', { defaultValue: 'On' });
  const no = t('admin.users.off', { defaultValue: 'Off' });
  const mfaOn =
    user.mfa_totp_enabled === true || user.mfa_email_enabled === true;

  return (
    <View className="flex-1 bg-background">
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
        <Text className="text-text-secondary text-sm mb-1">{user.email}</Text>
        <Text className="text-text-secondary text-sm mb-4">
          {[
            user.created_at
              ? t('admin.users.joined', {
                  defaultValue: 'Joined {{date}}',
                  date: formatDate(user.created_at, i18n.language),
                })
              : null,
            user.last_login_at
              ? t('admin.users.lastLogin', {
                  defaultValue: 'Last signed in {{date}}',
                  date: formatDate(user.last_login_at, i18n.language),
                })
              : null,
          ]
            .filter(Boolean)
            .join('\n')}
        </Text>

        <SettingsRowGroup
          title={t('admin.users.nameLabel', { defaultValue: 'Name' })}
        >
          <View className="px-4 py-3 gap-3">
            <FormInput
              value={fullName}
              onChangeText={setFullName}
              accessibilityLabel={t('admin.users.nameLabel', {
                defaultValue: 'Name',
              })}
              autoCapitalize="words"
              testID="admin-user-name"
            />
            <Button
              variant="secondary"
              onPress={saveName}
              disabled={
                isPending ||
                trimmedName.length === 0 ||
                trimmedName === (user.full_name ?? '')
              }
            >
              {t('admin.users.saveName', { defaultValue: 'Save name' })}
            </Button>
          </View>
        </SettingsRowGroup>

        <SettingsRowGroup>
          <SettingsRow
            title={t('admin.users.active', { defaultValue: 'Active' })}
            subtitle={t('admin.users.activeHint', {
              defaultValue: 'An inactive user cannot sign in.',
            })}
            subtitleNumberOfLines={0}
            rightAccessory={
              <Switch
                accessibilityLabel={t('admin.users.active', {
                  defaultValue: 'Active',
                })}
                value={user.is_active}
                disabled={isPending || selfLocked}
                onValueChange={setActive}
                testID="admin-user-active"
              />
            }
          />
          <SettingsRow
            title={t('admin.users.admin', { defaultValue: 'Admin' })}
            rightAccessory={
              <Switch
                accessibilityLabel={t('admin.users.admin', {
                  defaultValue: 'Admin',
                })}
                value={user.role === 'admin'}
                disabled={isPending || selfLocked}
                onValueChange={setAdmin}
                testID="admin-user-admin"
              />
            }
          />
          <SettingsRow
            title={t('admin.users.mfa', {
              defaultValue: 'Two-factor authentication',
            })}
            subtitle={mfaOn ? yes : no}
          />
        </SettingsRowGroup>

        {isSelf && (
          <Text className="text-text-secondary text-sm mb-4">
            {t('admin.users.selfHint', {
              defaultValue:
                'This is your own account, so it cannot be deactivated, demoted or deleted here.',
            })}
          </Text>
        )}

        <SettingsRowGroup>
          <SettingsRow
            icon="lock-closed"
            title={t('admin.users.resetPassword', {
              defaultValue: 'Send password reset',
            })}
            onPress={resetPassword}
            disabled={isPending}
          />
          {mfaOn && (
            <SettingsRow
              icon="shield-checkmark"
              title={t('admin.users.resetMfa', {
                defaultValue: 'Reset two-factor authentication',
              })}
              onPress={resetMfa}
              disabled={isPending}
            />
          )}
        </SettingsRowGroup>

        {!selfLocked && (
          <Button
            variant="destructive"
            onPress={deleteUser}
            disabled={isPending}
            testID="admin-user-delete"
          >
            {t('admin.users.delete', { defaultValue: 'Delete user' })}
          </Button>
        )}
      </ScrollView>
    </View>
  );
}
