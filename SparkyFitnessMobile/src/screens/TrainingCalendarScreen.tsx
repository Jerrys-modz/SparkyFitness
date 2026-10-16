import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type {
  CalendarWeekTotals,
  CompletedItem,
  PlannedItem,
} from '@workspace/shared';
import { addDays, weekStartOf } from '@workspace/shared';
import StatusView from '../components/StatusView';
import Icon from '../components/Icon';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { usePreferences } from '../hooks/usePreferences';
import { useTrainingCalendar } from '../hooks/useTrainingCalendar';
import { formatLocalizedNumber, useAppLocale } from '../localization';
import { getCalendarWeekdayShortNames } from '../utils/calendarLocalization';
import { distanceFromKm } from '../utils/unitConversions';
import { formatDate, formatShortDate, getTodayDate } from '../utils/dateUtils';
import {
  SPORT_COLORS,
  STATUS_COLORS,
  itemsByDay,
  monthRange,
  weekDays,
  type DayItems,
} from '../utils/trainingCalendar';
import {
  plannedItemLabel,
  plannedStatusLabel,
  sportLoadLabel,
} from '../utils/trainingCalendarLabels';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'TrainingCalendar'>;
type ViewMode = 'month' | 'week';

const EMPTY_DAY: DayItems = { planned: [], completed: [] };

/**
 * A month and week calendar of what was planned (the run program and the
 * scheduled workout plans) against what was done (the diary's workouts), with
 * a status on every planned item, weekly totals and a day's detail.
 */
const TrainingCalendarScreen: React.FC<Props> = () => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const appLocale = useAppLocale();
  const { preferences } = usePreferences();
  const firstDayOfWeek =
    typeof preferences?.first_day_of_week === 'number' &&
    preferences.first_day_of_week >= 0 &&
    preferences.first_day_of_week <= 6
      ? preferences.first_day_of_week
      : 0;
  const today = getTodayDate();
  const [mode, setMode] = useState<ViewMode>('month');
  const [anchor, setAnchor] = useState(today);
  const [selected, setSelected] = useState(today);

  const month = anchor.slice(0, 7);
  const range = useMemo(
    () => monthRange(month, firstDayOfWeek),
    [month, firstDayOfWeek]
  );
  const { data, isLoading, isError, refetch } = useTrainingCalendar(
    range.start,
    range.end
  );
  const header = useScreenHeader({
    title: t('screens.trainingCalendar', { defaultValue: 'Training calendar' }),
    left: { kind: 'back' },
  });

  const days = useMemo(() => itemsByDay(data), [data]);
  const weekdayNames = useMemo(() => {
    const names = getCalendarWeekdayShortNames(appLocale);
    return Array.from(
      { length: 7 },
      (_, i) => names[(firstDayOfWeek + i) % 7]!
    );
  }, [appLocale, firstDayOfWeek]);

  const move = (direction: -1 | 1) => {
    const next =
      mode === 'week'
        ? addDays(anchor, 7 * direction)
        : addDays(`${month}-01`, direction === 1 ? 32 : -1).slice(0, 7) + '-01';
    setAnchor(next);
    setSelected(next);
  };

  const title =
    mode === 'month'
      ? new Intl.DateTimeFormat(appLocale, {
          month: 'long',
          year: 'numeric',
        }).format(
          new Date(Number(month.slice(0, 4)), Number(month.slice(5)) - 1, 1)
        )
      : t('trainingCalendar.weekOf', {
          date: formatShortDate(weekStartOf(anchor, firstDayOfWeek), appLocale),
          defaultValue: 'Week of {{date}}',
        });

  const minutes = (value: number) =>
    t('trainingCalendar.minutesShort', {
      value: formatLocalizedNumber(Math.round(value)),
      defaultValue: '{{value}} min',
    });

  const distanceUnit =
    preferences?.default_distance_unit === 'miles' ? 'miles' : 'km';
  const distance = (km: number) => {
    const value = formatLocalizedNumber(distanceFromKm(km, distanceUnit), {
      maximumFractionDigits: 1,
    });
    return distanceUnit === 'miles'
      ? t('trainingCalendar.distanceMiles', {
          value,
          defaultValue: '{{value}} mi',
        })
      : t('trainingCalendar.distanceKm', {
          value,
          defaultValue: '{{value}} km',
        });
  };

  const weekStart = weekStartOf(selected, firstDayOfWeek);
  const selectedWeek = data?.weeks.find((w) => w.start === weekStart);
  const detail = days.get(selected) ?? EMPTY_DAY;

  const renderChips = (day: string) => {
    const items = days.get(day) ?? EMPTY_DAY;
    return (
      <View className="flex-row flex-wrap justify-center" style={{ gap: 2 }}>
        {items.planned.slice(0, 3).map((item) => (
          <View
            key={item.id}
            testID={`planned-dot-${item.status}`}
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: STATUS_COLORS[item.status] }}
          />
        ))}
        {items.completed
          .filter((item) => item.plannedItemId === null)
          .slice(0, 2)
          .map((item) => (
            <View
              key={item.id}
              testID="extra-dot"
              className="w-2 h-2 border"
              style={{ borderColor: SPORT_COLORS[item.sport] }}
            />
          ))}
      </View>
    );
  };

  const renderDayCell = (day: string, compact: boolean) => (
    <Pressable
      key={day}
      testID={`calendar-day-${day}`}
      accessibilityRole="button"
      onPress={() => setSelected(day)}
      className={`flex-1 items-center py-2 rounded-lg ${
        day === selected ? 'bg-accent-primary/15' : ''
      }`}
      style={compact ? { minHeight: 48 } : undefined}
    >
      <Text
        className={`text-sm ${
          day === today
            ? 'text-accent-primary font-bold'
            : day.slice(0, 7) === month
              ? 'text-text-primary'
              : 'text-text-muted'
        }`}
      >
        {Number(day.slice(8))}
      </Text>
      {renderChips(day)}
    </Pressable>
  );

  const renderPlanned = (item: PlannedItem) => (
    <View key={item.id} className="flex-row items-center py-2">
      <View
        className="w-2 h-8 rounded-full mr-3"
        style={{ backgroundColor: STATUS_COLORS[item.status] }}
      />
      <View className="flex-1">
        <Text className="text-text-primary text-sm font-semibold">
          {plannedItemLabel(t, item)}
        </Text>
        <Text className="text-text-secondary text-xs">
          {plannedStatusLabel(t, item.status)}
          {' · '}
          {sportLoadLabel(t, item.sport)}
          {item.plannedMinutes != null
            ? ` · ${
                item.completedMinutes > 0
                  ? t('trainingCalendar.minutesOf', {
                      done: formatLocalizedNumber(item.completedMinutes),
                      planned: formatLocalizedNumber(
                        Math.round(item.plannedMinutes)
                      ),
                      defaultValue: '{{done}} of {{planned}} min',
                    })
                  : minutes(item.plannedMinutes)
              }`
            : ''}
        </Text>
      </View>
    </View>
  );

  const renderCompleted = (item: CompletedItem) => (
    <View key={item.id} className="flex-row items-center py-2">
      <View
        className="w-2 h-8 rounded-full mr-3"
        style={{ backgroundColor: SPORT_COLORS[item.sport] }}
      />
      <View className="flex-1">
        <Text className="text-text-primary text-sm font-semibold">
          {item.name ?? sportLoadLabel(t, item.sport)}
        </Text>
        <Text className="text-text-secondary text-xs">
          {sportLoadLabel(t, item.sport)} · {minutes(item.minutes)}
          {item.distanceKm != null ? ` · ${distance(item.distanceKm)}` : ''}
          {' · '}
          {t('trainingCalendar.loadValue', {
            value: formatLocalizedNumber(item.load),
            defaultValue: 'load {{value}}',
          })}
          {item.loadBasis === 'estimated'
            ? ` ${t('trainingCalendar.estimated', { defaultValue: '(estimated, no heart rate)' })}`
            : ''}
        </Text>
      </View>
      {item.plannedItemId === null ? (
        <Text className="text-text-muted text-xs">
          {t('trainingCalendar.extra', { defaultValue: 'Extra' })}
        </Text>
      ) : null}
    </View>
  );

  const renderTotals = (week: CalendarWeekTotals) => (
    <View key={week.start} className="mb-2">
      <Text className="text-text-secondary text-xs mb-0.5">
        {t('trainingCalendar.weekOf', {
          date: formatShortDate(week.start, appLocale),
          defaultValue: 'Week of {{date}}',
        })}
      </Text>
      <Text className="text-text-primary text-sm">
        {t('trainingCalendar.totals.sessions', {
          done: week.doneSessions + week.partialSessions,
          planned: week.plannedSessions,
          defaultValue: '{{done}} of {{planned}} planned sessions',
        })}
        {week.extraSessions > 0
          ? ` · ${t('trainingCalendar.totals.extra', {
              count: week.extraSessions,
              defaultValue: '{{count}} extra',
            })}`
          : ''}
      </Text>
      <Text className="text-text-secondary text-xs">
        {t('trainingCalendar.totals.minutes', {
          done: formatLocalizedNumber(Math.round(week.completedMinutes)),
          planned: formatLocalizedNumber(Math.round(week.plannedMinutes)),
          defaultValue: 'Time {{done}} of {{planned}} min',
        })}
        {' · '}
        {t('trainingCalendar.totals.load', {
          done: formatLocalizedNumber(Math.round(week.completedLoad)),
          planned: formatLocalizedNumber(Math.round(week.plannedLoad)),
          defaultValue: 'Load {{done}} of {{planned}}',
        })}
        {week.completedDistanceKm > 0
          ? ` · ${distance(week.completedDistanceKm)}`
          : ''}
      </Text>
    </View>
  );

  const body = () => {
    if (isLoading) return <StatusView loading />;
    if (!data) {
      return (
        <StatusView
          icon="alert-circle"
          iconTone="danger"
          title={t('trainingCalendar.loadFailed', {
            defaultValue: 'Could not load your training calendar.',
          })}
          action={{
            label: t('common.retry', { defaultValue: 'Retry' }),
            onPress: () => void refetch(),
          }}
        />
      );
    }
    const gridDays =
      mode === 'month' ? range.days : weekDays(anchor, firstDayOfWeek);
    const rows = Array.from({ length: gridDays.length / 7 }, (_, i) =>
      gridDays.slice(i * 7, i * 7 + 7)
    );
    const totalsWeeks =
      mode === 'month'
        ? data.weeks.filter((w) => w.plannedSessions + w.completedSessions > 0)
        : selectedWeek
          ? [selectedWeek]
          : [];
    return (
      <>
        <View className="bg-surface rounded-xl p-3 mb-4 shadow-sm">
          <View className="flex-row mb-1">
            {weekdayNames.map((name, i) => (
              <Text
                key={i}
                className="flex-1 text-center text-text-muted text-xs"
              >
                {name}
              </Text>
            ))}
          </View>
          {rows.map((row) => (
            <View key={row[0]} className="flex-row">
              {row.map((day) => renderDayCell(day, true))}
            </View>
          ))}
          <View className="flex-row flex-wrap mt-2" style={{ gap: 10 }}>
            {(['done', 'partial', 'missed', 'upcoming'] as const).map(
              (status) => (
                <View key={status} className="flex-row items-center">
                  <View
                    className="w-2 h-2 rounded-full mr-1"
                    style={{ backgroundColor: STATUS_COLORS[status] }}
                  />
                  <Text className="text-text-muted text-xs">
                    {plannedStatusLabel(t, status)}
                  </Text>
                </View>
              )
            )}
            <View className="flex-row items-center">
              <View className="w-2 h-2 border border-text-muted mr-1" />
              <Text className="text-text-muted text-xs">
                {t('trainingCalendar.extra', { defaultValue: 'Extra' })}
              </Text>
            </View>
          </View>
        </View>

        <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
          <Text className="text-text-primary text-base font-bold mb-1">
            {selected === today
              ? t('date.today', { defaultValue: 'Today' })
              : formatDate(selected, appLocale)}
          </Text>
          {detail.planned.length === 0 && detail.completed.length === 0 ? (
            <Text className="text-text-secondary text-sm">
              {t('trainingCalendar.emptyDay', {
                defaultValue: 'Nothing planned or logged this day.',
              })}
            </Text>
          ) : (
            <>
              {detail.planned.length > 0 ? (
                <Text className="text-text-muted text-xs mt-2">
                  {t('trainingCalendar.planned', { defaultValue: 'Planned' })}
                </Text>
              ) : null}
              {detail.planned.map(renderPlanned)}
              {detail.completed.length > 0 ? (
                <Text className="text-text-muted text-xs mt-2">
                  {t('trainingCalendar.completed', {
                    defaultValue: 'Completed',
                  })}
                </Text>
              ) : null}
              {detail.completed.map(renderCompleted)}
            </>
          )}
        </View>

        {totalsWeeks.length > 0 ? (
          <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
            <Text className="text-text-primary text-base font-bold mb-2">
              {t('trainingCalendar.totals.title', {
                defaultValue: 'Planned vs completed',
              })}
            </Text>
            {totalsWeeks.map(renderTotals)}
          </View>
        ) : null}
      </>
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
        }}
      >
        <View className="flex-row items-center justify-between mb-3">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('trainingCalendar.previous', {
              defaultValue: 'Previous',
            })}
            onPress={() => move(-1)}
            hitSlop={12}
          >
            <Icon name="chevron-back" size={22} color="#999" />
          </Pressable>
          <Text className="text-text-primary text-base font-bold">{title}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('trainingCalendar.next', {
              defaultValue: 'Next',
            })}
            onPress={() => move(1)}
            hitSlop={12}
          >
            <Icon name="chevron-forward" size={22} color="#999" />
          </Pressable>
        </View>
        <View className="flex-row mb-4" style={{ gap: 8 }}>
          {(['month', 'week'] as const).map((value) => (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityState={{ selected: mode === value }}
              onPress={() => setMode(value)}
              className={`flex-1 items-center py-2 rounded-lg ${
                mode === value ? 'bg-accent-primary' : 'bg-surface'
              }`}
            >
              <Text
                className={`text-sm font-semibold ${
                  mode === value ? 'text-white' : 'text-text-primary'
                }`}
              >
                {value === 'month'
                  ? t('trainingCalendar.month', { defaultValue: 'Month' })
                  : t('trainingCalendar.week', { defaultValue: 'Week' })}
              </Text>
            </Pressable>
          ))}
        </View>
        {isError && data ? (
          <Text className="text-text-secondary text-xs mb-2">
            {t('trainingCalendar.refreshFailed', {
              defaultValue: 'Could not refresh. Showing the last result.',
            })}
          </Text>
        ) : null}
        {body()}
      </ScrollView>
    </>
  );
};

export default TrainingCalendarScreen;
