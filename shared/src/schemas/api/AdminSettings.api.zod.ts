import { z } from 'zod';

const flag = z.boolean().nullable().optional();

/**
 * `GET /api/admin/global-settings`: the server-wide switches an administrator
 * changes. The server answers with the whole `global_settings` row, so the
 * object is loose and keeps fields this schema does not name. `PUT` takes the
 * same object back: a client sends what it read with only the changed field
 * altered, because `is_mfa_mandatory` is written as sent and leaving it out
 * would turn it off. The `*_env_configured` and `mcp_oauth_available` fields
 * are read-only facts about the server; while an `*_env_configured` field is
 * true the matching login switch is set by the server's environment and
 * cannot be changed here.
 */
export const adminGlobalSettingsSchema = z.looseObject({
  is_mfa_mandatory: z.boolean(),
  enable_email_password_login: flag,
  is_oidc_active: flag,
  allow_openfoodfacts_contributions: flag,
  allow_user_ai_config: flag,
  default_vision_ai_service_id: z.string().nullable().optional(),
  allow_private_network_ai: flag,
  allow_private_network_food_providers: flag,
  public_api_docs: flag,
  mcp_oauth_enabled: flag,
  mcp_oauth_allowed_redirect_uris: z.array(z.string()).nullable().optional(),
  mcp_oauth_available: flag,
  mcp_oauth_unavailable_reason: z.string().nullable().optional(),
  dev_tools_enabled: flag,
  mock_data_enabled: flag,
  enable_version_check: flag,
  enable_challenges: flag,
  enable_passkey_login: flag,
  enable_magic_link_login: flag,
  is_email_login_env_configured: flag,
  is_passkey_login_env_configured: flag,
  is_magic_link_login_env_configured: flag,
  is_oidc_active_env_configured: flag,
});

/** One row of `GET /api/admin/users` (`?searchTerm=&limit=&offset=`). */
export const adminUserSchema = z.object({
  id: z.string(),
  full_name: z.string().nullable(),
  email: z.string(),
  // 'admin' or 'user'; kept open so a role a newer server adds still lists.
  role: z.string().nullable(),
  is_active: z.boolean(),
  created_at: z.string().nullable(),
  last_login_at: z.string().nullable(),
  mfa_totp_enabled: z.boolean().nullable(),
  mfa_email_enabled: z.boolean().nullable(),
});

export const adminUserListSchema = z.array(adminUserSchema);

export type AdminGlobalSettings = z.infer<typeof adminGlobalSettingsSchema>;
export type AdminUser = z.infer<typeof adminUserSchema>;
