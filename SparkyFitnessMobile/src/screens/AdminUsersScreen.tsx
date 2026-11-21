import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import SettingsRow, { SettingsRowGroup } from '../components/SettingsRow';
import LibrarySearchBar from '../components/LibrarySearchBar';
import Button from '../components/ui/Button';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useDebounce } from '../hooks/useDebounce';
import { useAdminUsers } from '../hooks/useAdmin';
import { ADMIN_USERS_PAGE_SIZE } from '../services/api/adminApi';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import type { RootStackScreenProps } from '../types/navigation';

/** Settings → Admin → Users: everyone with an account on the server. */
export default function AdminUsersScreen({
  navigation,
}: RootStackScreenProps<'AdminUsers'>) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const header = useScreenHeader({
    title: t('admin.users.title', { defaultValue: 'Users' }),
    left: { kind: 'back' },
  });
  const [search, setSearch] = useState('');
  const searchTerm = useDebounce(search.trim(), 300);
  const users = useAdminUsers(searchTerm);
  const [accent] = useCSSVariable(['--color-accent-primary']) as [string];

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
        <View className="mb-4">
          <LibrarySearchBar
            value={search}
            onChangeText={setSearch}
            placeholder={t('admin.users.search', {
              defaultValue: 'Search by name or email',
            })}
            isSearching={users.isFetching && !users.isPending}
          />
        </View>

        {users.isPending ? (
          <View className="py-6 items-center">
            <ActivityIndicator color={accent} />
          </View>
        ) : users.isError ? (
          <View className="py-3 gap-3 items-start">
            <Text className="text-sm text-text-secondary">
              {t('admin.users.loadError', {
                defaultValue: 'Could not load the users.',
              })}
            </Text>
            <Button variant="secondary" onPress={() => void users.refetch()}>
              {t('common.retry', { defaultValue: 'Retry' })}
            </Button>
          </View>
        ) : users.data.length === 0 ? (
          <Text className="text-sm text-text-secondary">
            {t('admin.users.none', { defaultValue: 'No users found.' })}
          </Text>
        ) : (
          <>
            <SettingsRowGroup>
              {users.data.map((user) => {
                const tags = [
                  user.role === 'admin'
                    ? t('admin.users.roleAdmin', { defaultValue: 'Admin' })
                    : null,
                  user.is_active
                    ? null
                    : t('admin.users.inactive', { defaultValue: 'Inactive' }),
                ].filter((tag): tag is string => tag !== null);
                return (
                  <SettingsRow
                    key={user.id}
                    title={user.full_name || user.email}
                    subtitle={[user.full_name ? user.email : null, ...tags]
                      .filter(Boolean)
                      .join(' · ')}
                    onPress={() =>
                      navigation.navigate('AdminUserDetail', { user })
                    }
                    testID={`admin-user-${user.id}`}
                  />
                );
              })}
            </SettingsRowGroup>
            {users.data.length >= ADMIN_USERS_PAGE_SIZE && (
              <Text className="text-sm text-text-secondary">
                {t('admin.users.more', {
                  defaultValue:
                    'Showing the newest {{limit}} accounts. Search to find someone else.',
                  limit: ADMIN_USERS_PAGE_SIZE,
                })}
              </Text>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}
