import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useCSSVariable } from 'uniwind';
import FamilyDashboardSummary from './FamilyDashboardSummary';
import StatusView from './StatusView';
import { useFamilyDailySummary } from '../hooks';
import { familyUsersQueryKey } from '../hooks/queryKeys';
import { ApiError } from '../services/api/errors';
import type { FamilyDiaryUser } from '../types/familyDiary';
import { familyDiaryUserName } from '../utils/familyDiary';

interface FamilyDashboardViewProps {
  familyUser: FamilyDiaryUser;
  date: string;
  bottomPadding: number;
}

/**
 * The Dashboard tab's read-only view of a family member's day, shown in place
 * of the own cards while the profile toggle is on. It never changes the global
 * profile context: it only reads the member's daily summary.
 */
const FamilyDashboardView: React.FC<FamilyDashboardViewProps> = ({
  familyUser,
  date,
  bottomPadding,
}) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const accentColor = useCSSVariable('--color-accent-primary') as string;
  const [refreshing, setRefreshing] = useState(false);
  const { data, error, isError, isLoading, refetch } = useFamilyDailySummary({
    familyUserId: familyUser.userId,
    date,
  });
  const displayName = familyDiaryUserName(
    familyUser,
    t('familyDiary.unnamedMember', { defaultValue: 'Family member' })
  );

  // Revoked access: refresh the member list so the Dashboard drops the toggle.
  useEffect(() => {
    if (isError && error instanceof ApiError && error.statusCode === 403) {
      void queryClient.invalidateQueries({ queryKey: familyUsersQueryKey });
    }
  }, [error, isError, queryClient]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  if (isLoading) {
    return (
      <StatusView
        loading
        title={t('familyDiary.loadingDashboard', {
          defaultValue: 'Loading family dashboard…',
        })}
      />
    );
  }

  if (isError || !data) {
    return (
      <StatusView
        icon="alert-circle"
        iconTone="danger"
        title={t('familyDiary.loadDashboardFailed', {
          defaultValue: 'Family dashboard unavailable',
        })}
        action={{
          label: t('common.retry', { defaultValue: 'Retry' }),
          onPress: () => void refetch(),
          variant: 'primary',
        }}
      />
    );
  }

  return (
    <ScrollView
      testID="family-dashboard-view"
      className="flex-1 bg-background"
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingBottom: bottomPadding,
      }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={accentColor || '#3B82F6'}
        />
      }
    >
      <View className="mb-3 rounded-xl bg-surface px-4 py-3">
        <Text className="text-sm font-semibold text-text-primary">
          {t('familyDiary.viewingDashboard', {
            name: displayName,
            defaultValue: "Viewing {{name}}'s dashboard",
          })}
        </Text>
        <Text className="text-xs text-text-secondary">
          {t('familyDiary.viewingDashboardHint', {
            defaultValue: 'Read-only',
          })}
        </Text>
      </View>
      <FamilyDashboardSummary data={data} date={date} />
    </ScrollView>
  );
};

export default FamilyDashboardView;
