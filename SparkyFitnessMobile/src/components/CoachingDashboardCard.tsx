import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, TouchableOpacity, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import Icon from './Icon';
import { formatLocalizedNumber } from '../localization';
import { useCoachingCheckIn } from '../hooks/useCoachingCheckIn';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { coachingDataNotes } from '@workspace/shared';
import { coachingSuggestionSignature } from '../utils/coachingCheckIn';
import { coachingNoteText, coachingReasonTitle } from '../utils/coachingCopy';
import type { RootStackParamList, TabParamList } from '../types/navigation';

type CoachingDashboardCardNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'Dashboard'>,
  NativeStackNavigationProp<RootStackParamList>
>;

interface CoachingDashboardCardProps {
  navigation: CoachingDashboardCardNavigation;
}

/**
 * The Dashboard's short take on the weekly check-in: the verdict, and either the
 * suggested calorie target or what is missing before one can be given. A tap
 * opens the Coaching screen, where the trend, the working and the Accept button
 * live. Nothing changes from here.
 */
const CoachingDashboardCard: React.FC<CoachingDashboardCardProps> = ({
  navigation,
}) => {
  const { t } = useTranslation();
  const accentPrimary = useCSSVariable('--color-accent-primary') as string;
  const visible = useAppPreferencesStore((s) => s.coachingCardVisible);
  const dismissedSignature = useAppPreferencesStore(
    (s) => s.coachingDismissedSignature
  );
  const { checkIn, isError } = useCoachingCheckIn(visible);

  const title = t('coaching.title', { defaultValue: 'Weekly Coaching' });

  if (!checkIn && isError) {
    return (
      <View
        testID="coaching-dashboard-card-error"
        className="bg-surface rounded-xl p-4 mb-3 shadow-sm"
      >
        <Text className="font-bold text-text-secondary">{title}</Text>
        <Text className="text-text-secondary text-sm mt-1">
          {t('coaching.loadFailed', {
            defaultValue: 'Could not load your check-in.',
          })}
        </Text>
      </View>
    );
  }
  if (!checkIn) return null;

  const suggested = checkIn.suggested;
  const postponed =
    suggested !== null &&
    dismissedSignature ===
      coachingSuggestionSignature(checkIn.asOf, suggested.calories);
  const notes = coachingDataNotes(checkIn.dataQuality, checkIn.reason);
  const kcal = (value: number) =>
    formatLocalizedNumber(Math.round(value), { maximumFractionDigits: 0 });

  const detail = (() => {
    if (suggested && !postponed) {
      return t('coaching.card.suggestion', {
        suggested: kcal(suggested.calories),
        current: kcal(checkIn.current.calories),
        defaultValue: 'Suggested {{suggested}} kcal (now {{current}})',
      });
    }
    if (suggested && postponed) {
      return t('coaching.card.postponed', {
        defaultValue: 'You postponed this suggestion. Tap to review.',
      });
    }
    if (checkIn.reason === 'on-track') {
      return t('coaching.card.unchanged', {
        defaultValue: 'Targets unchanged',
      });
    }
    const note = notes[0];
    return note ? coachingNoteText(t, note) : null;
  })();

  return (
    <TouchableOpacity
      testID="coaching-dashboard-card"
      className="bg-surface rounded-xl p-4 mb-3 shadow-sm"
      onPress={() => navigation.navigate('Coaching')}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={t('coaching.openA11y', {
        defaultValue: 'Open weekly coaching',
      })}
    >
      <View className="flex-row items-center justify-between">
        <Text className="font-bold text-text-primary">{title}</Text>
        <View className="flex-row items-center gap-1">
          <Text className="text-xs" style={{ color: accentPrimary }}>
            {t('coaching.details', { defaultValue: 'Details' })}
          </Text>
          <Icon name="chevron-forward" size={14} color={accentPrimary} />
        </View>
      </View>
      <Text className="text-text-primary mt-2">
        {coachingReasonTitle(t, checkIn.reason)}
      </Text>
      {detail ? (
        <Text className="text-text-secondary text-sm mt-1">{detail}</Text>
      ) : null}
      {checkIn.expenditure.kcal !== null ? (
        <Text className="text-text-secondary text-xs mt-2">
          {t('coaching.card.expenditure', {
            kcal: kcal(checkIn.expenditure.kcal),
            defaultValue: 'Estimated burn about {{kcal}} kcal a day',
          })}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
};

export default CoachingDashboardCard;
