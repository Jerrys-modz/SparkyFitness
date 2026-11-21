import {
  ActivityIndicator,
  Linking,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import * as WebBrowser from 'expo-web-browser';
import type { AdminGlobalSettings } from '@workspace/shared';
import SettingsRow, { SettingsRowGroup } from '../components/SettingsRow';
import Switch from '../components/ui/Switch';
import Button from '../components/ui/Button';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useServerConfigs } from '../hooks';
import {
  useAdminBackups,
  useAdminGlobalSettings,
  useRunManualBackup,
  useUpdateAdminGlobalSetting,
} from '../hooks/useAdmin';
import { addLog } from '../services/LogService';
import { normalizeUrl } from '../utils/serverUrl';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import type { RootStackScreenProps } from '../types/navigation';

/** The settings shown as switches. The settings object is loose (it keeps
 * fields this app does not know), so the keys are listed. */
type BooleanSettingKey =
  | 'enable_email_password_login'
  | 'enable_passkey_login'
  | 'enable_magic_link_login'
  | 'is_oidc_active'
  | 'is_mfa_mandatory'
  | 'enable_challenges'
  | 'allow_openfoodfacts_contributions'
  | 'allow_user_ai_config'
  | 'allow_private_network_ai'
  | 'allow_private_network_food_providers'
  | 'mcp_oauth_enabled'
  | 'public_api_docs'
  | 'enable_version_check'
  | 'dev_tools_enabled'
  | 'mock_data_enabled'
  | 'is_email_login_env_configured'
  | 'is_passkey_login_env_configured'
  | 'is_magic_link_login_env_configured'
  | 'is_oidc_active_env_configured';

interface ToggleSpec {
  key: BooleanSettingKey;
  title: string;
  subtitle?: string;
  /** The value shown when the server stores none. */
  fallback: boolean;
  /** Set by the server's environment, so it cannot be changed here. */
  envKey?: BooleanSettingKey;
  disabled?: boolean;
}

function ToggleRows({
  specs,
  settings,
  onChange,
}: {
  specs: ToggleSpec[];
  settings: AdminGlobalSettings;
  onChange: (key: BooleanSettingKey, value: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      {specs.map((spec) => {
        const envManaged = spec.envKey ? settings[spec.envKey] === true : false;
        const lines = [
          spec.subtitle,
          envManaged
            ? t('admin.settings.envManaged', {
                defaultValue: "Set by the server's environment variables.",
              })
            : undefined,
        ].filter((line): line is string => Boolean(line));
        return (
          <SettingsRow
            key={spec.key}
            title={spec.title}
            subtitle={lines.length > 0 ? lines.join('\n') : undefined}
            subtitleNumberOfLines={0}
            testID={`admin-row-${spec.key}`}
            rightAccessory={
              <Switch
                accessibilityLabel={spec.title}
                value={(settings[spec.key] ?? spec.fallback) === true}
                disabled={envManaged || spec.disabled === true}
                onValueChange={(value) => onChange(spec.key, value)}
                testID={`admin-switch-${spec.key}`}
              />
            }
          />
        );
      })}
    </>
  );
}

function formatBytes(bytes: number, locale: string): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toLocaleString(locale, { maximumFractionDigits: 1 })} ${units[unit]}`;
}

function BackupRows() {
  const { t, i18n } = useTranslation();
  const backups = useAdminBackups();
  const backup = useRunManualBackup();
  const latest = backups.data?.backups
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5);

  return (
    <SettingsRowGroup
      title={t('admin.backups.title', { defaultValue: 'Backups' })}
    >
      <View className="px-4 py-3 gap-3">
        <Button
          variant="secondary"
          onPress={backup.run}
          disabled={backup.isPending}
          testID="admin-backup-now"
        >
          {backup.isPending
            ? t('admin.backups.running', { defaultValue: 'Backing up…' })
            : t('admin.backups.runNow', { defaultValue: 'Back up now' })}
        </Button>
        {backups.isPending ? (
          <ActivityIndicator />
        ) : backups.isError ? (
          <Text className="text-sm text-text-secondary">
            {t('admin.backups.loadError', {
              defaultValue: 'Could not load the list of backups.',
            })}
          </Text>
        ) : latest && latest.length > 0 ? (
          latest.map((file) => (
            <View key={file.fileName}>
              <Text className="text-sm text-text-primary" numberOfLines={1}>
                {new Date(file.createdAt).toLocaleString(i18n.language, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </Text>
              <Text className="text-xs text-text-secondary" numberOfLines={1}>
                {`${file.fileName} · ${formatBytes(file.size, i18n.language)}`}
              </Text>
            </View>
          ))
        ) : (
          <Text className="text-sm text-text-secondary">
            {t('admin.backups.none', { defaultValue: 'No backups yet.' })}
          </Text>
        )}
      </View>
    </SettingsRowGroup>
  );
}

/**
 * Settings → Admin: the server-wide switches, users and backups, for an
 * administrator of the server on screen. The rest of the web's admin page
 * (sign-in providers, shared AI services and data providers, the backup
 * schedule and restore) is reached through "Open on the website".
 */
export default function AdminSettingsScreen({
  navigation,
}: RootStackScreenProps<'AdminSettings'>) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const header = useScreenHeader({
    title: t('admin.title', { defaultValue: 'Admin' }),
    left: { kind: 'back' },
  });
  const { activeConfig } = useServerConfigs();
  const query = useAdminGlobalSettings();
  const { setSetting } = useUpdateAdminGlobalSetting();
  const [accent, catTeal, catSlate] = useCSSVariable([
    '--color-accent-primary',
    '--color-cat-teal',
    '--color-cat-slate',
  ]) as [string, string, string];

  const openWebAdmin = async () => {
    if (!activeConfig) return;
    const url = `${normalizeUrl(activeConfig.url)}/admin`;
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch (error) {
      addLog(
        `In-app browser failed, falling back to Linking: ${error}`,
        'WARNING'
      );
      await Linking.openURL(url);
    }
  };

  const settings = query.data;
  const onChange = (key: BooleanSettingKey, value: boolean) =>
    setSetting(key, value);

  const loginSpecs: ToggleSpec[] = [
    {
      key: 'enable_email_password_login',
      title: t('admin.settings.emailLogin', {
        defaultValue: 'Email and password sign-in',
      }),
      fallback: true,
      envKey: 'is_email_login_env_configured',
    },
    {
      key: 'enable_passkey_login',
      title: t('admin.settings.passkeyLogin', {
        defaultValue: 'Passkey sign-in',
      }),
      fallback: true,
      envKey: 'is_passkey_login_env_configured',
    },
    {
      key: 'enable_magic_link_login',
      title: t('admin.settings.magicLinkLogin', {
        defaultValue: 'Magic link sign-in',
      }),
      fallback: true,
      envKey: 'is_magic_link_login_env_configured',
    },
    {
      key: 'is_oidc_active',
      title: t('admin.settings.oidcLogin', {
        defaultValue: 'OIDC sign-in',
      }),
      subtitle: t('admin.settings.oidcLoginHint', {
        defaultValue: 'Providers are set up on the website.',
      }),
      fallback: false,
      envKey: 'is_oidc_active_env_configured',
    },
    {
      key: 'is_mfa_mandatory',
      title: t('admin.settings.mfaMandatory', {
        defaultValue: 'Require two-factor authentication',
      }),
      subtitle: t('admin.settings.mfaMandatoryHint', {
        defaultValue: 'Everyone must set it up before using the server.',
      }),
      fallback: false,
    },
  ];

  const featureSpecs: ToggleSpec[] = [
    {
      key: 'enable_challenges',
      title: t('admin.settings.challenges', {
        defaultValue: 'Challenges and group leaderboards',
      }),
      subtitle: t('admin.settings.challengesHint', {
        defaultValue:
          'Turned off, challenges are hidden and scoring stops; nothing is deleted.',
      }),
      fallback: true,
    },
    {
      key: 'allow_openfoodfacts_contributions',
      title: t('admin.settings.openFoodFacts', {
        defaultValue: 'Open Food Facts contributions',
      }),
      subtitle: t('admin.settings.openFoodFactsHint', {
        defaultValue:
          'Lets people send a product and their own photo to Open Food Facts after confirming it.',
      }),
      fallback: false,
    },
    {
      key: 'allow_user_ai_config',
      title: t('admin.settings.userAiConfig', {
        defaultValue: 'People can add their own AI services',
      }),
      subtitle: t('admin.settings.userAiConfigHint', {
        defaultValue: 'Turned off, everyone uses the shared AI services.',
      }),
      fallback: true,
    },
    {
      key: 'allow_private_network_ai',
      title: t('admin.settings.privateNetworkAi', {
        defaultValue: 'AI services on a private network',
      }),
      subtitle: t('admin.settings.privateNetworkAiHint', {
        defaultValue:
          'Lets people who are not admins connect AI services (such as Ollama) at private LAN addresses.',
      }),
      fallback: false,
    },
    {
      key: 'allow_private_network_food_providers',
      title: t('admin.settings.privateNetworkProviders', {
        defaultValue: 'Recipe providers on a private network',
      }),
      subtitle: t('admin.settings.privateNetworkProvidersHint', {
        defaultValue:
          'Lets people who are not admins connect recipe providers (such as Mealie or Tandoor) at private LAN addresses.',
      }),
      fallback: false,
    },
  ];

  const serverSpecs: ToggleSpec[] = [
    {
      key: 'mcp_oauth_enabled',
      title: t('admin.settings.mcpOAuth', {
        defaultValue: 'Remote MCP sign-in (OAuth)',
      }),
      subtitle:
        settings?.mcp_oauth_available === false
          ? (settings.mcp_oauth_unavailable_reason ??
            t('admin.settings.mcpOAuthHttps', {
              defaultValue: 'Needs the server on public HTTPS.',
            }))
          : t('admin.settings.mcpOAuthHint', {
              defaultValue:
                'An approved application gets full MCP access, including tools that change or delete data. The allowed redirect addresses are set on the website.',
            }),
      fallback: false,
      disabled: settings?.mcp_oauth_available === false,
    },
    {
      key: 'public_api_docs',
      title: t('admin.settings.publicApiDocs', {
        defaultValue: 'Public API documentation',
      }),
      subtitle: t('admin.settings.publicApiDocsHint', {
        defaultValue: 'Anyone can open /api/api-docs without signing in.',
      }),
      fallback: false,
    },
    {
      key: 'enable_version_check',
      title: t('admin.settings.versionCheck', {
        defaultValue: 'Check for new releases',
      }),
      subtitle: t('admin.settings.versionCheckHint', {
        defaultValue:
          'Asks GitHub for the latest release and tells people when a newer version is out.',
      }),
      fallback: true,
    },
    {
      key: 'dev_tools_enabled',
      title: t('admin.settings.devTools', {
        defaultValue: 'Developer diagnostic tools',
      }),
      subtitle: t('admin.settings.devToolsHint', {
        defaultValue: 'MCP and database inspection tools for admins.',
      }),
      fallback: false,
    },
    {
      key: 'mock_data_enabled',
      title: t('admin.settings.mockData', {
        defaultValue: 'Provider response capture',
      }),
      subtitle: t('admin.settings.mockDataHint', {
        defaultValue:
          "Lets admins save a provider's raw answers on the server and replay them, to troubleshoot a sync. Turn it back off when done.",
      }),
      fallback: false,
    },
  ];

  return (
    <View className="flex-1 bg-background">
      {header}
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
        contentInsetAdjustmentBehavior={
          usesNativeHeader ? 'automatic' : 'never'
        }
      >
        <Text className="text-text-secondary text-sm mb-4">
          {t('admin.description', {
            defaultValue:
              'These settings change the server for everyone who uses it.',
          })}
        </Text>

        <SettingsRowGroup>
          <SettingsRow
            icon="people"
            title={t('admin.users.title', { defaultValue: 'Users' })}
            onPress={() => navigation.navigate('AdminUsers')}
            iconColor={catTeal}
            testID="admin-open-users"
          />
        </SettingsRowGroup>

        {query.isPending ? (
          <View className="py-6 items-center">
            <ActivityIndicator color={accent} />
          </View>
        ) : !settings ? (
          <View className="py-3 gap-3 items-start">
            <Text className="text-sm text-text-secondary">
              {t('admin.settings.loadError', {
                defaultValue: 'Could not load the server settings.',
              })}
            </Text>
            <Button variant="secondary" onPress={() => void query.refetch()}>
              {t('common.retry', { defaultValue: 'Retry' })}
            </Button>
          </View>
        ) : (
          <>
            <SettingsRowGroup
              title={t('admin.settings.loginGroup', {
                defaultValue: 'Sign-in',
              })}
            >
              <ToggleRows
                specs={loginSpecs}
                settings={settings}
                onChange={onChange}
              />
            </SettingsRowGroup>
            <SettingsRowGroup
              title={t('admin.settings.featuresGroup', {
                defaultValue: 'Features',
              })}
            >
              <ToggleRows
                specs={featureSpecs}
                settings={settings}
                onChange={onChange}
              />
            </SettingsRowGroup>
            <SettingsRowGroup
              title={t('admin.settings.serverGroup', {
                defaultValue: 'Server',
              })}
            >
              <ToggleRows
                specs={serverSpecs}
                settings={settings}
                onChange={onChange}
              />
            </SettingsRowGroup>
          </>
        )}

        <BackupRows />

        <SettingsRowGroup>
          <SettingsRow
            icon="globe"
            title={t('admin.openWeb', { defaultValue: 'Open on the website' })}
            subtitle={t('admin.openWebHint', {
              defaultValue:
                'Sign-in providers, shared AI services and data providers, the backup schedule and restoring a backup.',
            })}
            subtitleNumberOfLines={0}
            onPress={() => void openWebAdmin()}
            iconColor={catSlate}
            disabled={!activeConfig}
          />
        </SettingsRowGroup>

        <Text className="text-text-secondary text-sm">
          {t('admin.lockoutHint', {
            defaultValue:
              'Locked out after turning a sign-in method off? Set SPARKY_FITNESS_FORCE_EMAIL_LOGIN=true on the server and restart it.',
          })}
        </Text>
      </ScrollView>
    </View>
  );
}
