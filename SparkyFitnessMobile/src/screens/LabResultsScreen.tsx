import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Button from '../components/ui/Button';
import Icon from '../components/Icon';
import LabStatusBadge from '../components/labs/LabStatusBadge';
import { useRefetchOnFocus } from '../hooks/useRefetchOnFocus';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useLabMarkers, useLatestLabValues } from '../hooks/useLabResults';
import { formatDateLabel } from '../utils/dateUtils';
import {
  formatLabRange,
  formatLabValue,
  labMarkerName,
  labStatus,
  parseLabValue,
} from '../utils/labResults';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'LabResults'>;

/** The user's lab markers with their latest result and range status. */
const LabResultsScreen: React.FC<Props> = ({ navigation }) => {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const dateLocale = i18n.language.startsWith('pl') ? 'pl-PL' : 'en-US';
  const { markers, isLoading, isError, refetch } = useLabMarkers();
  const latest = useLatestLabValues();
  useRefetchOnFocus(() => {
    void refetch();
    void latest.refetch();
  }, true);

  const header = useScreenHeader({
    title: t('screens.labResults', { defaultValue: 'Lab results' }),
    left: { kind: 'back' },
    right: {
      kind: 'icon',
      ionicon: 'add-outline',
      sfSymbol: 'plus',
      role: 'primary',
      accessibilityLabel: t('labs.add', { defaultValue: 'Add lab result' }),
      onPress: () => navigation.navigate('LabResultAdd', {}),
    },
  });

  return (
    <>
      {header}
      <ScrollView
        className="flex-1 bg-background"
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 24,
        }}
      >
        {isLoading ? (
          <ActivityIndicator />
        ) : isError ? (
          <View className="items-center py-8">
            <Text className="text-text-secondary text-base mb-3">
              {t('labs.loadFailed', {
                defaultValue: 'Could not load your lab results.',
              })}
            </Text>
            <Button variant="secondary" onPress={() => void refetch()}>
              {t('common.retry', { defaultValue: 'Retry' })}
            </Button>
          </View>
        ) : markers.length === 0 ? (
          <View className="items-center py-8 gap-4">
            <Text className="text-text-secondary text-base text-center">
              {t('labs.empty', {
                defaultValue:
                  'No lab results yet. Add a result like HbA1c, LDL or vitamin D and track it over time.',
              })}
            </Text>
            <Button
              variant="primary"
              onPress={() => navigation.navigate('LabResultAdd', {})}
            >
              {t('labs.add', { defaultValue: 'Add lab result' })}
            </Button>
          </View>
        ) : (
          <View className="bg-surface rounded-xl overflow-hidden">
            {markers.map((marker, index) => {
              const row = latest.byCategory.get(marker.id);
              const value = row ? parseLabValue(row.value) : null;
              const unit = marker.measurement_type;
              const range = formatLabRange(
                marker.ref_range_low,
                marker.ref_range_high,
                unit
              );
              return (
                <Pressable
                  key={marker.id}
                  onPress={() =>
                    navigation.navigate('LabResultDetail', {
                      categoryId: marker.id,
                    })
                  }
                  className={`px-4 py-3.5 flex-row items-center justify-between ${
                    index > 0 ? 'border-t border-border-subtle' : ''
                  }`}
                  style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
                  accessibilityRole="button"
                >
                  <View className="flex-1 mr-3">
                    <Text className="text-base font-semibold text-text-primary">
                      {labMarkerName(marker)}
                    </Text>
                    <Text className="text-xs text-text-muted mt-0.5">
                      {row
                        ? formatDateLabel(row.entry_date, t, dateLocale)
                        : t('labs.noResults', { defaultValue: 'No results' })}
                      {range ? ` · ${range}` : ''}
                    </Text>
                  </View>
                  <View className="items-end mr-2">
                    <Text className="text-base font-bold text-text-primary">
                      {value !== null ? formatLabValue(value, unit) : '-'}
                    </Text>
                    {value !== null && (
                      <LabStatusBadge status={labStatus(marker, value)} />
                    )}
                  </View>
                  <Icon name="chevron-forward" size={20} color="#999" />
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </>
  );
};

export default LabResultsScreen;
