import {
  adminGlobalSettingsSchema,
  adminUserListSchema,
  backupListResponseSchema,
  type AdminGlobalSettings,
  type AdminUser,
  type BackupListResponse,
} from '@workspace/shared';
import type { ServerConfig } from '../storage';
import { apiFetch } from './apiClient';

const SERVICE = 'Admin API';

/** How many users the Users screen asks for at once. The server's own
 * default is 10. */
export const ADMIN_USERS_PAGE_SIZE = 100;

/** A full backup can take a while on a large database. */
const BACKUP_TIMEOUT_MS = 5 * 60 * 1000;

interface IdentityResponse {
  authenticatedUserId?: string;
  role?: string | null;
}

/** Who is signed in. `role` is the signed-in account's, never the context
 * switched to, as the server's admin check. */
export const fetchSignedInIdentity = (): Promise<IdentityResponse> =>
  apiFetch<IdentityResponse>({
    endpoint: '/api/identity/user',
    serviceName: SERVICE,
    operation: 'fetch signed-in user',
  });

export const fetchAdminGlobalSettings =
  async (): Promise<AdminGlobalSettings> => {
    const data = await apiFetch<unknown>({
      endpoint: '/api/admin/global-settings',
      serviceName: SERVICE,
      operation: 'fetch global settings',
    });
    return adminGlobalSettingsSchema.parse(data);
  };

/** Saves the whole settings object, as read with one field changed. */
export const saveAdminGlobalSettings = async (
  settings: AdminGlobalSettings,
  serverConfig: ServerConfig
): Promise<AdminGlobalSettings> => {
  const data = await apiFetch<unknown>({
    endpoint: '/api/admin/global-settings',
    serviceName: SERVICE,
    operation: 'save global settings',
    method: 'PUT',
    body: settings,
    serverConfig,
  });
  return adminGlobalSettingsSchema.parse(data);
};

export const fetchAdminUsers = async (
  searchTerm: string
): Promise<AdminUser[]> => {
  const params = new URLSearchParams({
    searchTerm,
    limit: String(ADMIN_USERS_PAGE_SIZE),
    offset: '0',
  });
  const data = await apiFetch<unknown>({
    endpoint: `/api/admin/users?${params.toString()}`,
    serviceName: SERVICE,
    operation: 'fetch users',
  });
  return adminUserListSchema.parse(data);
};

const userPath = (userId: string) =>
  `/api/admin/users/${encodeURIComponent(userId)}`;

export const updateAdminUserStatus = (
  userId: string,
  isActive: boolean,
  serverConfig: ServerConfig
): Promise<void> =>
  apiFetch<void>({
    endpoint: `${userPath(userId)}/status`,
    serviceName: SERVICE,
    operation: 'update user status',
    method: 'PUT',
    body: { isActive },
    serverConfig,
  });

export const updateAdminUserRole = (
  userId: string,
  role: 'user' | 'admin',
  serverConfig: ServerConfig
): Promise<void> =>
  apiFetch<void>({
    endpoint: `${userPath(userId)}/role`,
    serviceName: SERVICE,
    operation: 'update user role',
    method: 'PUT',
    body: { role },
    serverConfig,
  });

export const updateAdminUserFullName = (
  userId: string,
  fullName: string,
  serverConfig: ServerConfig
): Promise<void> =>
  apiFetch<void>({
    endpoint: `${userPath(userId)}/full-name`,
    serviceName: SERVICE,
    operation: 'update user name',
    method: 'PUT',
    body: { fullName },
    serverConfig,
  });

export const resetAdminUserPassword = (
  userId: string,
  serverConfig: ServerConfig
): Promise<void> =>
  apiFetch<void>({
    endpoint: `${userPath(userId)}/reset-password`,
    serviceName: SERVICE,
    operation: 'send password reset',
    method: 'POST',
    serverConfig,
  });

export const resetAdminUserMfa = (
  userId: string,
  serverConfig: ServerConfig
): Promise<void> =>
  apiFetch<void>({
    endpoint: `${userPath(userId)}/mfa/reset`,
    serviceName: SERVICE,
    operation: 'reset user MFA',
    method: 'POST',
    serverConfig,
  });

export const deleteAdminUser = (
  userId: string,
  serverConfig: ServerConfig
): Promise<void> =>
  apiFetch<void>({
    endpoint: userPath(userId),
    serviceName: SERVICE,
    operation: 'delete user',
    method: 'DELETE',
    serverConfig,
  });

export const fetchBackupList = async (): Promise<BackupListResponse> => {
  const data = await apiFetch<unknown>({
    endpoint: '/api/admin/backup/list',
    serviceName: SERVICE,
    operation: 'list backups',
  });
  return backupListResponseSchema.parse(data);
};

export const runManualBackup = (
  serverConfig: ServerConfig
): Promise<{ message?: string; fileName?: string }> =>
  apiFetch<{ message?: string; fileName?: string }>({
    endpoint: '/api/admin/backup/manual',
    serviceName: SERVICE,
    operation: 'run backup',
    method: 'POST',
    timeoutMs: BACKUP_TIMEOUT_MS,
    serverConfig,
  });
