import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import type { AdminGlobalSettings } from '@workspace/shared';
import {
  deleteAdminUser,
  fetchAdminGlobalSettings,
  fetchAdminUsers,
  fetchBackupList,
  fetchSignedInIdentity,
  resetAdminUserMfa,
  resetAdminUserPassword,
  runManualBackup,
  saveAdminGlobalSettings,
  updateAdminUserFullName,
  updateAdminUserRole,
  updateAdminUserStatus,
} from '../services/api/adminApi';
import { getApiErrorMessage } from '../services/api/errors';
import { addLog } from '../services/LogService';
import type { ServerConfig } from '../services/storage';
import {
  adminBackupsQueryKey,
  adminGlobalSettingsQueryKey,
  adminUsersQueryKey,
  adminUsersRootQueryKey,
  preferencesQueryKey,
  signedInIdentityQueryKey,
} from './queryKeys';
import { startedOn } from './queryOwner';
import { serverOnScreen } from './serverOnScreen';

/** Who is signed in to the server on screen (`/api/identity/user`). */
export function useSignedInIdentity(enabled: boolean) {
  return useQuery({
    queryKey: signedInIdentityQueryKey,
    queryFn: fetchSignedInIdentity,
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Whether the signed-in account is an administrator of the server on screen.
 * False while it loads or when it cannot be read, so the admin rows only
 * appear once the server has said so; the server checks every admin request
 * itself either way.
 */
export function useIsAdmin(enabled: boolean): boolean {
  const { data } = useSignedInIdentity(enabled);
  return enabled && data?.role === 'admin';
}

/** The error text for a failed admin request: the server's own words when it
 * gave some (such as "Cannot delete the primary admin user."), else a
 * generic line. */
function useShowAdminError() {
  const { t } = useTranslation();
  return useCallback(
    (error: unknown, operation: string) => {
      addLog(`Admin: failed to ${operation}: ${error}`, 'ERROR');
      Toast.show({
        type: 'error',
        text1: t('admin.requestFailed', {
          defaultValue: 'That did not work. Please try again.',
        }),
        text2: getApiErrorMessage(error) ?? undefined,
      });
    },
    [t]
  );
}

/** The server on screen, or a toast saying there is none. */
function useServerForWrite() {
  const queryClient = useQueryClient();
  const showError = useShowAdminError();
  return useCallback((): ServerConfig | null => {
    const serverConfig = serverOnScreen(queryClient);
    if (!serverConfig) showError('no active server', 'find the server');
    return serverConfig;
  }, [queryClient, showError]);
}

export function useAdminGlobalSettings() {
  return useQuery({
    queryKey: adminGlobalSettingsQueryKey,
    queryFn: fetchAdminGlobalSettings,
  });
}

interface SettingsChange {
  settings: AdminGlobalSettings;
  serverConfig: ServerConfig;
  started: ReturnType<typeof startedOn>;
}

/**
 * Changes one server-wide setting. The server takes the whole object back,
 * so the change is applied to the settings last read. Saves run one at a
 * time, so quick taps land in order, and each one builds on the answer to
 * the one before.
 */
export function useUpdateAdminGlobalSetting() {
  const queryClient = useQueryClient();
  const showError = useShowAdminError();
  const serverForWrite = useServerForWrite();
  const { mutate, isPending } = useMutation({
    scope: { id: 'admin-global-settings' },
    mutationFn: ({ settings, serverConfig }: SettingsChange) =>
      saveAdminGlobalSettings(settings, serverConfig),
    onMutate: async () => {
      await queryClient.cancelQueries({
        queryKey: adminGlobalSettingsQueryKey,
      });
    },
    onSuccess: (data, change) => {
      if (!change.started.isCurrent()) return;
      queryClient.setQueryData(adminGlobalSettingsQueryKey, data);
      // Things the app reads that follow these switches (Challenges, AI
      // configuration, Open Food Facts contributions).
      void queryClient.invalidateQueries({ queryKey: preferencesQueryKey });
    },
    onError: (error) => {
      showError(error, 'save global settings');
      void queryClient.invalidateQueries({
        queryKey: adminGlobalSettingsQueryKey,
      });
    },
  });

  const setSetting = useCallback(
    <K extends keyof AdminGlobalSettings>(
      key: K,
      value: AdminGlobalSettings[K]
    ) => {
      const current = queryClient.getQueryData<AdminGlobalSettings>(
        adminGlobalSettingsQueryKey
      );
      if (!current) return;
      const serverConfig = serverForWrite();
      if (!serverConfig) return;
      const settings = { ...current, [key]: value };
      // Show the change at once; the answer replaces it.
      queryClient.setQueryData(adminGlobalSettingsQueryKey, settings);
      mutate({
        settings,
        serverConfig,
        started: startedOn(queryClient, adminGlobalSettingsQueryKey),
      });
    },
    [queryClient, serverForWrite, mutate]
  );

  return { setSetting, isPending };
}

export function useAdminUsers(searchTerm: string) {
  return useQuery({
    queryKey: adminUsersQueryKey(searchTerm),
    queryFn: () => fetchAdminUsers(searchTerm),
  });
}

type UserAction =
  | { kind: 'status'; userId: string; isActive: boolean }
  | { kind: 'role'; userId: string; role: 'user' | 'admin' }
  | { kind: 'fullName'; userId: string; fullName: string }
  | { kind: 'resetPassword'; userId: string }
  | { kind: 'resetMfa'; userId: string }
  | { kind: 'delete'; userId: string };

function runUserAction(action: UserAction, serverConfig: ServerConfig) {
  switch (action.kind) {
    case 'status':
      return updateAdminUserStatus(
        action.userId,
        action.isActive,
        serverConfig
      );
    case 'role':
      return updateAdminUserRole(action.userId, action.role, serverConfig);
    case 'fullName':
      return updateAdminUserFullName(
        action.userId,
        action.fullName,
        serverConfig
      );
    case 'resetPassword':
      return resetAdminUserPassword(action.userId, serverConfig);
    case 'resetMfa':
      return resetAdminUserMfa(action.userId, serverConfig);
    case 'delete':
      return deleteAdminUser(action.userId, serverConfig);
  }
}

/** One mutation for every change to a user; the list is read again after
 * each, so it always shows what the server holds. */
export function useAdminUserAction() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const showError = useShowAdminError();
  const serverForWrite = useServerForWrite();
  const { mutate, isPending } = useMutation({
    scope: { id: 'admin-user-actions' },
    mutationFn: ({
      action,
      serverConfig,
    }: {
      action: UserAction;
      serverConfig: ServerConfig;
      onDone?: () => void;
    }) => runUserAction(action, serverConfig),
    onSuccess: (_data, { action, onDone }) => {
      void queryClient.invalidateQueries({ queryKey: adminUsersRootQueryKey });
      const text1 = successText(t, action);
      if (text1) Toast.show({ type: 'success', text1 });
      onDone?.();
    },
    onError: (error, { action }) => showError(error, `${action.kind} user`),
  });

  const run = useCallback(
    (action: UserAction, onDone?: () => void) => {
      const serverConfig = serverForWrite();
      if (!serverConfig) return;
      mutate({ action, serverConfig, onDone });
    },
    [serverForWrite, mutate]
  );

  return { run, isPending };
}

function successText(
  t: ReturnType<typeof useTranslation>['t'],
  action: UserAction
): string | null {
  switch (action.kind) {
    case 'resetPassword':
      return t('admin.users.resetPasswordSent', {
        defaultValue: 'Password reset email sent.',
      });
    case 'resetMfa':
      return t('admin.users.resetMfaDone', {
        defaultValue: 'Two-factor authentication was reset.',
      });
    case 'delete':
      return t('admin.users.deleted', { defaultValue: 'User deleted.' });
    case 'fullName':
      return t('admin.users.nameSaved', { defaultValue: 'Name saved.' });
    case 'status':
    case 'role':
      return null;
  }
}

export function useAdminBackups() {
  return useQuery({
    queryKey: adminBackupsQueryKey,
    queryFn: fetchBackupList,
  });
}

export function useRunManualBackup() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const showError = useShowAdminError();
  const serverForWrite = useServerForWrite();
  const { mutate, isPending } = useMutation({
    mutationFn: (serverConfig: ServerConfig) => runManualBackup(serverConfig),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminBackupsQueryKey });
      Toast.show({
        type: 'success',
        text1: t('admin.backups.done', { defaultValue: 'Backup finished.' }),
      });
    },
    onError: (error) => showError(error, 'run backup'),
  });
  const run = useCallback(() => {
    const serverConfig = serverForWrite();
    if (serverConfig) mutate(serverConfig);
  }, [serverForWrite, mutate]);
  return { run, isPending };
}
