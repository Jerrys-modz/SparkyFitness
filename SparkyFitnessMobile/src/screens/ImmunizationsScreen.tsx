import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { immunizationDueStatus } from '@workspace/shared';
import Button from '../components/ui/Button';
import Icon from '../components/Icon';
import { useRefetchOnFocus } from '../hooks/useRefetchOnFocus';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useImmunizations } from '../hooks/useImmunizations';
import { formatDateLabel, getTodayDate } from '../utils/dateUtils';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'Immunizations'>;

/** The vaccines the user has had, newest first, with what is due or overdue. */
const ImmunizationsScreen: React.FC<Props> = ({ navigation }) => {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const dateLocale = i18n.language.startsWith('pl') ? 'pl-PL' : 'en-US';
  const { data, isLoading, isError, refetch } = useImmunizations();
  // Today changes outside React, so it is read on focus rather than in render.
  const [today, setToday] = useState(getTodayDate);
  useRefetchOnFocus(() => {
    setToday(getTodayDate());
    void refetch();
  }, true);

  const records = data ?? [];

  const header = useScreenHeader({
    title: t('screens.immunizations', { defaultValue: 'Immunizations' }),
    left: { kind: 'back' },
    right: [
      {
        kind: 'icon',
        ionicon: 'add-outline',
        sfSymbol: 'plus',
        role: 'primary',
        accessibilityLabel: t('immunizations.add', {
          defaultValue: 'Add immunization',
        }),
        onPress: () => navigation.navigate('ImmunizationForm', {}),
      },
      {
        kind: 'menu',
        accessibilityLabel: t('immunizations.moreActions', {
          defaultValue: 'More actions',
        }),
        items: [
          {
            label: t('immunizations.import.cta', {
              defaultValue: 'Import from a record',
            }),
            sfSymbol: 'doc.text',
            icon: 'document-text',
            onPress: () => navigation.navigate('ImmunizationImport'),
          },
        ],
        identifier: 'immunizations-menu',
      },
    ],
  });

  return (
    <View className="flex-1 bg-background">
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
              {t('immunizations.loadFailed', {
                defaultValue: 'Could not load your immunizations.',
              })}
            </Text>
            <Button variant="secondary" onPress={() => void refetch()}>
              {t('common.retry', { defaultValue: 'Retry' })}
            </Button>
          </View>
        ) : records.length === 0 ? (
          <View className="items-center py-8 gap-4">
            <Text className="text-text-secondary text-base text-center">
              {t('immunizations.empty', {
                defaultValue:
                  'No immunizations yet. Add the vaccines you have had to keep them in one place.',
              })}
            </Text>
            <Button
              variant="primary"
              onPress={() => navigation.navigate('ImmunizationForm', {})}
            >
              {t('immunizations.add', { defaultValue: 'Add immunization' })}
            </Button>
            <Button
              variant="secondary"
              onPress={() => navigation.navigate('ImmunizationImport')}
            >
              {t('immunizations.import.cta', {
                defaultValue: 'Import from a record',
              })}
            </Button>
          </View>
        ) : (
          <View className="bg-surface rounded-xl overflow-hidden">
            {records.map((record, index) => {
              const status = immunizationDueStatus(record.next_due_on, today);
              return (
                <Pressable
                  key={record.id}
                  onPress={() =>
                    navigation.navigate('ImmunizationForm', {
                      immunization: record,
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
                      {record.vaccine_name}
                      {record.dose_number
                        ? ` · ${t('immunizations.doseShort', {
                            defaultValue: 'Dose {{n}}',
                            n: record.dose_number,
                          })}`
                        : ''}
                    </Text>
                    <Text className="text-xs text-text-muted mt-0.5">
                      {formatDateLabel(record.administered_on, t, dateLocale)}
                      {record.administered_by
                        ? ` · ${record.administered_by}`
                        : ''}
                    </Text>
                    {record.next_due_on && (
                      <Text
                        className={`text-xs mt-0.5 ${
                          status === 'overdue'
                            ? 'text-text-danger-subtle'
                            : status === 'due_soon'
                              ? 'text-text-warning'
                              : 'text-text-muted'
                        }`}
                      >
                        {status === 'overdue'
                          ? t('immunizations.status.overdue', {
                              defaultValue: 'Overdue',
                            })
                          : status === 'due_soon'
                            ? t('immunizations.status.dueSoon', {
                                defaultValue: 'Due soon',
                              })
                            : t('immunizations.nextDue', {
                                defaultValue: 'Next due',
                              })}
                        {' · '}
                        {formatDateLabel(record.next_due_on, t, dateLocale)}
                      </Text>
                    )}
                  </View>
                  <Icon name="chevron-forward" size={20} color="#999" />
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

export default ImmunizationsScreen;
