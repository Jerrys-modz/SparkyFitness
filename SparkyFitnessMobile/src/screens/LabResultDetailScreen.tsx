import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import Button from '../components/ui/Button';
import Icon from '../components/Icon';
import LabHistoryChart from '../components/labs/LabHistoryChart';
import LabRangeBar from '../components/labs/LabRangeBar';
import LabStatusBadge from '../components/labs/LabStatusBadge';
import { useRefetchOnFocus } from '../hooks/useRefetchOnFocus';
import { useScreenHeader } from '../hooks/useScreenHeader';
import {
  useDeleteLabResult,
  useLabHistory,
  useLabMarkers,
} from '../hooks/useLabResults';
import { formatDateLabel } from '../utils/dateUtils';
import {
  formatLabRange,
  formatLabValue,
  labHistoryPoints,
  labMarkerName,
  labStatus,
  parseLabValue,
} from '../utils/labResults';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'LabResultDetail'>;

/** One marker: its range, a chart over time, and every result with delete. */
const LabResultDetailScreen: React.FC<Props> = ({ navigation, route }) => {
  const { categoryId, name } = route.params;
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const dateLocale = i18n.language.startsWith('pl') ? 'pl-PL' : 'en-US';
  const { markers } = useLabMarkers();
  const marker = markers.find((m) => m.id === categoryId);
  const history = useLabHistory(categoryId);
  const deleteResult = useDeleteLabResult(categoryId);
  useRefetchOnFocus(() => void history.refetch(), true);

  const header = useScreenHeader({
    title: marker
      ? labMarkerName(marker)
      : (name ?? t('screens.labResultDetail', { defaultValue: 'Lab result' })),
    left: { kind: 'back' },
    right: {
      kind: 'icon',
      ionicon: 'add-outline',
      sfSymbol: 'plus',
      role: 'primary',
      accessibilityLabel: t('labs.add', { defaultValue: 'Add lab result' }),
      onPress: () => navigation.navigate('LabResultAdd', { categoryId }),
    },
  });

  const entries = useMemo(() => history.data ?? [], [history.data]);
  const points = useMemo(() => labHistoryPoints(entries), [entries]);
  const newestFirst = useMemo(
    () => [...entries].sort((a, b) => b.entry_date.localeCompare(a.entry_date)),
    [entries]
  );

  const unit = marker?.measurement_type ?? '';
  const low = marker?.ref_range_low ?? null;
  const high = marker?.ref_range_high ?? null;
  const range = formatLabRange(low, high, unit);
  const latest = points.length > 0 ? points[points.length - 1] : null;

  const confirmDelete = (entryId: string) => {
    Alert.alert(
      t('labs.deleteTitle', { defaultValue: 'Delete result' }),
      t('labs.deleteMessage', {
        defaultValue: 'Delete this lab result?',
      }),
      [
        {
          text: t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
        {
          text: t('common.delete', { defaultValue: 'Delete' }),
          style: 'destructive',
          onPress: () =>
            deleteResult.mutate(entryId, {
              onError: () =>
                Toast.show({
                  type: 'error',
                  text1: t('labs.deleteFailed', {
                    defaultValue: 'Could not delete the result',
                  }),
                }),
            }),
        },
      ]
    );
  };

  return (
    <>
      {header}
      <ScrollView
        className="flex-1 bg-background"
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 24,
          gap: 16,
        }}
      >
        {history.isLoading ? (
          <ActivityIndicator />
        ) : history.isError ? (
          <View className="items-center py-8">
            <Text className="text-text-secondary text-base mb-3">
              {t('labs.loadFailed', {
                defaultValue: 'Could not load your lab results.',
              })}
            </Text>
            <Button variant="secondary" onPress={() => void history.refetch()}>
              {t('common.retry', { defaultValue: 'Retry' })}
            </Button>
          </View>
        ) : (
          <>
            <View className="bg-surface rounded-xl p-4 gap-3">
              <View className="flex-row items-end justify-between">
                <View>
                  <Text className="text-text-muted text-xs">
                    {t('labs.latest', { defaultValue: 'Latest' })}
                  </Text>
                  <Text className="text-text-primary text-2xl font-bold">
                    {latest ? formatLabValue(latest.value, unit) : '-'}
                  </Text>
                </View>
                {latest && marker && (
                  <LabStatusBadge status={labStatus(marker, latest.value)} />
                )}
              </View>
              {range && (
                <Text className="text-text-secondary text-sm">
                  {t('labs.referenceRange', {
                    defaultValue: 'Reference range: {{range}}',
                    range,
                  })}
                </Text>
              )}
              {points.length === 1 && low != null && high != null ? (
                <LabRangeBar
                  value={points[0].value}
                  low={low}
                  high={high}
                  unit={unit}
                />
              ) : (
                <LabHistoryChart
                  points={points}
                  refRangeLow={low}
                  refRangeHigh={high}
                />
              )}
            </View>

            {newestFirst.length > 0 && (
              <View className="bg-surface rounded-xl overflow-hidden">
                {newestFirst.map((entry, index) => {
                  const value = parseLabValue(entry.value);
                  return (
                    <View
                      key={entry.id}
                      className={`px-4 py-3 flex-row items-center justify-between ${
                        index > 0 ? 'border-t border-border-subtle' : ''
                      }`}
                    >
                      <View className="flex-1 mr-3">
                        <Text className="text-text-primary text-base font-semibold">
                          {value !== null
                            ? formatLabValue(value, unit)
                            : entry.value}
                        </Text>
                        <Text className="text-text-muted text-xs mt-0.5">
                          {formatDateLabel(entry.entry_date, t, dateLocale)}
                          {entry.notes ? ` · ${entry.notes}` : ''}
                        </Text>
                      </View>
                      {value !== null && marker && (
                        <View className="mr-3">
                          <LabStatusBadge status={labStatus(marker, value)} />
                        </View>
                      )}
                      <TouchableOpacity
                        onPress={() => confirmDelete(entry.id)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={{ marginLeft: 4 }}
                        accessibilityRole="button"
                        accessibilityLabel={t('common.delete', {
                          defaultValue: 'Delete',
                        })}
                      >
                        <Icon name="trash" size={20} color="#999" />
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </>
  );
};

export default LabResultDetailScreen;
