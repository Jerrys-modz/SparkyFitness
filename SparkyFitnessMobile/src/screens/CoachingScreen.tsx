import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import {
  COACHING_GOAL_DIRECTIONS,
  type CoachingCheckInResponse,
  type CoachingGoalDirection,
  type CoachingTargets,
} from '@workspace/shared';

import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import WeightTrendChart from '../components/coaching/WeightTrendChart';
import Button from '../components/ui/Button';
import { formatLocalizedNumber, useAppLocale } from '../localization';
import {
  useCoachingCheckIn,
  useCoachingMutations,
} from '../hooks/useCoachingCheckIn';
import { usePreferences } from '../hooks/usePreferences';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { coachingDataNotes } from '@workspace/shared';
import { coachingSuggestionSignature } from '../utils/coachingCheckIn';
import {
  coachingDirectionLabel,
  coachingLimitText,
  coachingNoteText,
  coachingReasonBody,
  coachingReasonTitle,
} from '../utils/coachingCopy';
import {
  formatWeightDisplay,
  lbsToKg,
  weightFromKg,
} from '../utils/unitConversions';
import type { RootStackScreenProps } from '../types/navigation';

type CoachingScreenProps = RootStackScreenProps<'Coaching'>;

const RATE_OPTIONS = {
  kg: [0.1, 0.25, 0.5, 0.75, 1],
  lbs: [0.25, 0.5, 1, 1.5, 2],
} as const;

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
    <Text className="text-xs font-bold text-text-secondary uppercase tracking-wider mb-2">
      {title}
    </Text>
    {children}
  </View>
);

const Chip: React.FC<{
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
}> = ({ label, selected, onPress, disabled }) => (
  <TouchableOpacity
    onPress={onPress}
    disabled={disabled}
    accessibilityRole="button"
    accessibilityState={{ selected, disabled }}
    className={`px-3 py-2 rounded-lg mr-2 mb-2 ${
      selected ? 'bg-accent-primary' : 'bg-raised'
    }`}
  >
    <Text
      className={selected ? 'text-white font-semibold' : 'text-text-primary'}
    >
      {label}
    </Text>
  </TouchableOpacity>
);

const kcalText = (value: number) =>
  formatLocalizedNumber(Math.round(value), { maximumFractionDigits: 0 });

const TargetColumn: React.FC<{
  label: string;
  targets: CoachingTargets;
  emphasised?: boolean;
}> = ({ label, targets, emphasised }) => {
  const { t } = useTranslation();
  return (
    <View className="flex-1">
      <Text className="text-text-secondary text-xs mb-1">{label}</Text>
      <Text
        className={`text-xl ${emphasised ? 'font-bold text-text-primary' : 'text-text-secondary'}`}
      >
        {t('coaching.kcal', {
          value: kcalText(targets.calories),
          defaultValue: '{{value}} kcal',
        })}
      </Text>
      <Text className="text-text-secondary text-xs mt-1">
        {t('coaching.macros', {
          protein: kcalText(targets.protein),
          carbs: kcalText(targets.carbs),
          fat: kcalText(targets.fat),
          defaultValue: 'P {{protein}} g · C {{carbs}} g · F {{fat}} g',
        })}
      </Text>
    </View>
  );
};

const CoachingScreen: React.FC<CoachingScreenProps> = ({ navigation }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();
  const appLocale = useAppLocale();
  const { preferences } = usePreferences();
  const { checkIn, isLoading, isError, refetch } = useCoachingCheckIn();
  const { acceptCheckIn, isAccepting, saveSettings, isSavingSettings } =
    useCoachingMutations();
  const setDismissed = useAppPreferencesStore(
    (s) => s.setCoachingDismissedSignature
  );
  const reminderEnabled = useAppPreferencesStore(
    (s) => s.coachingReminderEnabled
  );
  const notificationsEnabled = useAppPreferencesStore(
    (s) => s.notificationsEnabled
  );

  const weightMode = preferences?.default_weight_unit ?? 'kg';
  const rateUnit: 'kg' | 'lbs' = weightMode === 'kg' ? 'kg' : 'lbs';

  const header = useScreenHeader({
    title: t('coaching.title', { defaultValue: 'Weekly Coaching' }),
    left: { kind: 'back' },
  });

  const weekdayNames = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) =>
        // 2024-01-07 was a Sunday.
        new Date(2024, 0, 7 + i).toLocaleDateString(appLocale, {
          weekday: 'short',
        })
      ),
    [appLocale]
  );

  const showError = useCallback(
    (message: string) => Toast.show({ type: 'error', text1: message }),
    []
  );

  const handleAccept = useCallback(
    async (data: CoachingCheckInResponse) => {
      if (!data.suggested) return;
      try {
        await acceptCheckIn(data.suggested.calories);
        Toast.show({
          type: 'success',
          text1: t('coaching.accepted', {
            defaultValue: 'Targets updated from today',
          }),
        });
        navigation.goBack();
      } catch {
        showError(
          t('coaching.acceptFailed', {
            defaultValue:
              'Could not apply the change. Your data may have changed, so review the new suggestion.',
          })
        );
      }
    },
    [acceptCheckIn, navigation, showError, t]
  );

  const handleNotNow = useCallback(
    (data: CoachingCheckInResponse) => {
      if (data.suggested) {
        setDismissed(
          coachingSuggestionSignature(data.asOf, data.suggested.calories)
        );
      }
      navigation.goBack();
    },
    [navigation, setDismissed]
  );

  const handleSettings = useCallback(
    async (body: {
      direction?: CoachingGoalDirection;
      rateKgPerWeek?: number;
      checkInWeekday?: number;
    }) => {
      try {
        await saveSettings(body);
      } catch {
        showError(
          t('coaching.settingsFailed', {
            defaultValue: 'Could not save your coaching goal.',
          })
        );
      }
    },
    [saveSettings, showError, t]
  );

  const body = (() => {
    if (isLoading) {
      return (
        <View className="py-16 items-center">
          <ActivityIndicator />
        </View>
      );
    }
    if (isError || !checkIn) {
      return (
        <View className="py-16 items-center px-6">
          <Text className="text-text-secondary text-center mb-4">
            {t('coaching.loadFailed', {
              defaultValue: 'Could not load your check-in.',
            })}
          </Text>
          <Button variant="outline" onPress={() => void refetch()}>
            {t('common.retry', { defaultValue: 'Retry' })}
          </Button>
        </View>
      );
    }

    const data = checkIn;
    const notes = coachingDataNotes(data.dataQuality, data.reason);
    const trendDisplay =
      data.trend.currentKg !== null
        ? formatWeightDisplay(data.trend.currentKg, weightMode)
        : null;
    const rateDisplay =
      data.trend.weeklyRateKg !== null
        ? `${data.trend.weeklyRateKg > 0 ? '+' : ''}${formatLocalizedNumber(
            weightFromKg(data.trend.weeklyRateKg, rateUnit),
            { minimumFractionDigits: 2, maximumFractionDigits: 2 }
          )} ${rateUnit}`
        : null;
    const margin = data.expenditure.marginKcal;
    const history = data.expenditure.history;
    const historyMax = Math.max(...history.map((h) => h.smoothedKcal), 1);

    return (
      <>
        <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
          <Text className="text-lg font-bold text-text-primary">
            {coachingReasonTitle(t, data.reason)}
          </Text>
          <Text className="text-text-secondary mt-1">
            {coachingReasonBody(t, data.reason, data.goal.direction)}
          </Text>
          {data.checkInDue ? (
            <Text className="text-text-secondary text-xs mt-2">
              {t('coaching.checkInToday', {
                defaultValue: 'Today is your check-in day.',
              })}
            </Text>
          ) : null}
        </View>

        {data.trend.series.length > 0 ? (
          <Section
            title={t('coaching.trend.title', {
              defaultValue: "This week's trend",
            })}
          >
            <WeightTrendChart series={data.trend.series} unit={rateUnit} />
            <View className="flex-row justify-between mt-3">
              <View>
                <Text className="text-text-secondary text-xs">
                  {t('coaching.trend.current', {
                    defaultValue: 'Trend weight',
                  })}
                </Text>
                <Text className="text-text-primary font-semibold">
                  {trendDisplay ?? '—'}
                </Text>
              </View>
              <View>
                <Text className="text-text-secondary text-xs">
                  {t('coaching.trend.rate', {
                    defaultValue: 'Change per week',
                  })}
                </Text>
                <Text className="text-text-primary font-semibold">
                  {rateDisplay ?? '—'}
                </Text>
              </View>
            </View>
            <Text className="text-text-secondary text-xs mt-2">
              {t('coaching.trend.legend', {
                defaultValue:
                  'Dots are your weigh-ins and the line is the smoothed trend. Hollow dots were ignored as out of line.',
              })}
            </Text>
          </Section>
        ) : null}

        <Section
          title={t('coaching.expenditure.title', {
            defaultValue: 'Estimated expenditure',
          })}
        >
          {data.expenditure.kcal !== null ? (
            <>
              <Text className="text-2xl font-bold text-text-primary">
                {t('coaching.expenditure.value', {
                  kcal: kcalText(data.expenditure.kcal),
                  defaultValue: '{{kcal}} kcal a day',
                })}
              </Text>
              {margin !== null ? (
                <Text className="text-text-secondary text-sm mt-1">
                  {t('coaching.expenditure.margin', {
                    margin: kcalText(margin),
                    defaultValue:
                      'Give or take about {{margin}} kcal from weigh-in noise alone',
                  })}
                </Text>
              ) : null}
              {data.expenditure.avgIntakeKcal !== null ? (
                <Text className="text-text-secondary text-sm mt-1">
                  {t('coaching.expenditure.intake', {
                    kcal: kcalText(data.expenditure.avgIntakeKcal),
                    defaultValue:
                      'Based on an average of {{kcal}} kcal on the days you logged food',
                  })}
                </Text>
              ) : null}
              {history.length > 1 ? (
                <View
                  className="flex-row items-end mt-3"
                  style={{ height: 40 }}
                  accessibilityLabel={t('coaching.expenditure.historyA11y', {
                    defaultValue: 'Estimated expenditure over recent weeks',
                  })}
                >
                  {history.map((h) => (
                    <View
                      key={h.date}
                      className="flex-1 mx-0.5 rounded-sm bg-accent-primary"
                      style={{
                        height: Math.max(4, (h.smoothedKcal / historyMax) * 40),
                      }}
                    />
                  ))}
                </View>
              ) : null}
            </>
          ) : (
            <Text className="text-text-secondary">
              {t('coaching.expenditure.none', {
                defaultValue: 'Not enough data to estimate yet.',
              })}
            </Text>
          )}
        </Section>

        <Section
          title={t('coaching.targets.title', { defaultValue: 'Daily targets' })}
        >
          <View className="flex-row gap-4">
            <TargetColumn
              label={t('coaching.targets.now', { defaultValue: 'Now' })}
              targets={data.current}
              emphasised={!data.suggested}
            />
            {data.suggested ? (
              <TargetColumn
                label={t('coaching.targets.suggested', {
                  defaultValue: 'Suggested',
                })}
                targets={data.suggested}
                emphasised
              />
            ) : null}
          </View>
          {data.suggested ? (
            <>
              <Text className="text-text-secondary text-sm mt-3">
                {t('coaching.targets.change', {
                  change: `${data.changeKcal > 0 ? '+' : ''}${kcalText(data.changeKcal)}`,
                  defaultValue:
                    'A change of {{change}} kcal a day, starting today.',
                })}
              </Text>
              {data.limits.map((limit) => (
                <Text key={limit} className="text-text-secondary text-xs mt-1">
                  {coachingLimitText(t, limit)}
                </Text>
              ))}
              {data.proteinFloorApplied ? (
                <Text className="text-text-secondary text-xs mt-1">
                  {t('coaching.limit.proteinFloor', {
                    defaultValue:
                      'Protein is kept up and carbs and fat take the reduction.',
                  })}
                </Text>
              ) : null}
              {data.goalManagedBySettings ? (
                <Text className="text-text-warning text-sm mt-3">
                  {t('coaching.managedBySettings', {
                    defaultValue:
                      'Your calorie target is set by Calorie Settings (adaptive or goal mode), so it cannot be changed here. Switch to a fixed target to use coaching.',
                  })}
                </Text>
              ) : (
                <View className="flex-row gap-3 mt-4">
                  <View className="flex-1">
                    <Button
                      variant="outline"
                      onPress={() => handleNotNow(data)}
                      disabled={isAccepting}
                    >
                      {t('coaching.notNow', { defaultValue: 'Not now' })}
                    </Button>
                  </View>
                  <View className="flex-1">
                    <Button
                      variant="primary"
                      onPress={() => void handleAccept(data)}
                      loading={isAccepting}
                    >
                      {t('coaching.accept', { defaultValue: 'Accept' })}
                    </Button>
                  </View>
                </View>
              )}
            </>
          ) : null}
        </Section>

        {notes.length > 0 ? (
          <Section
            title={t('coaching.dataQuality.title', {
              defaultValue: 'Data quality',
            })}
          >
            {notes.map((note) => (
              <Text key={note.kind} className="text-text-primary mb-1">
                {coachingNoteText(t, note)}
              </Text>
            ))}
          </Section>
        ) : null}

        <Section
          title={t('coaching.goal.title', { defaultValue: 'Your goal' })}
        >
          <View className="flex-row flex-wrap">
            {COACHING_GOAL_DIRECTIONS.map((direction) => (
              <Chip
                key={direction}
                label={coachingDirectionLabel(t, direction)}
                selected={data.settings.direction === direction}
                disabled={isSavingSettings}
                onPress={() => void handleSettings({ direction })}
              />
            ))}
          </View>
          {data.settings.direction !== 'maintain' ? (
            <>
              <Text className="text-text-secondary text-xs mt-2 mb-1">
                {t('coaching.goal.rate', { defaultValue: 'Rate per week' })}
              </Text>
              <View className="flex-row flex-wrap">
                {RATE_OPTIONS[rateUnit].map((option) => {
                  const kg = rateUnit === 'kg' ? option : lbsToKg(option);
                  return (
                    <Chip
                      key={option}
                      label={`${formatLocalizedNumber(option)} ${rateUnit}`}
                      selected={
                        Math.abs(data.settings.rateKgPerWeek - kg) < 0.02
                      }
                      disabled={isSavingSettings}
                      onPress={() =>
                        void handleSettings({
                          rateKgPerWeek: Math.round(kg * 100) / 100,
                        })
                      }
                    />
                  );
                })}
              </View>
            </>
          ) : null}
          <Text className="text-text-secondary text-xs mt-2 mb-1">
            {t('coaching.goal.checkInDay', {
              defaultValue: 'Weekly check-in day',
            })}
          </Text>
          <View className="flex-row flex-wrap">
            {weekdayNames.map((name, weekday) => (
              <Chip
                key={weekday}
                label={name}
                selected={data.settings.checkInWeekday === weekday}
                disabled={isSavingSettings}
                onPress={() => void handleSettings({ checkInWeekday: weekday })}
              />
            ))}
          </View>
          {notificationsEnabled && !reminderEnabled ? (
            <Text className="text-text-secondary text-xs mt-2">
              {t('coaching.goal.reminderOff', {
                defaultValue:
                  'The check-in reminder is off. Turn it on in Notification settings.',
              })}
            </Text>
          ) : null}
        </Section>

        <Text className="text-text-secondary text-xs px-1">
          {t('coaching.disclaimer', {
            defaultValue:
              'These are estimates from your logged food and weigh-ins, not medical advice. Missing or inaccurate logs make them less reliable. Nothing changes until you accept.',
          })}
        </Text>
      </>
    );
  })();

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
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
        {body}
      </ScrollView>
    </View>
  );
};

export default CoachingScreen;
