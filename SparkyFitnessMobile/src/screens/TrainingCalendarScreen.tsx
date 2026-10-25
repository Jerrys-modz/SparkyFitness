import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type {
  CalendarWeekTotals,
  CompletedItem,
  PlannedItem,
} from '@workspace/shared';
import { LOAD_SPORT_GROUPS, addDays, weekStartOf } from '@workspace/shared';
import DayMarks from '../components/trainingCalendar/DayMarks';
import WeekProgressBar from '../components/trainingCalendar/WeekProgressBar';
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
  EXTRA_COLOR,
  REST_DAY_AHEAD_DAYS,
  SPORT_ICONS,
  STATUS_COLORS,
  dayMarks,
  itemsByDay,
  monthRange,
  orderWeeks,
  weekDays,
  weekSummary,
  type DayItems,
} from '../utils/trainingCalendar';
import {
  markA11yLabel,
  plannedItemLabel,
  plannedStatusLabel,
  sportLoadLabel,
} from '../utils/trainingCalendarLabels';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'TrainingCalendar'>;
type ViewMode = 'month' | 'week';

const EMPTY_DAY: DayItems = { planned: [], completed: [] };
const SPORTS = LOAD_SPORT_GROUPS;
/** Width of the week total at the end of each row of the grid. */
const WEEK_TOTAL_WIDTH = 44;

/**
 * A month and week calendar of what was planned (the run program and the
 * scheduled workout plans) against what was done (the diary's workouts), with
 * a status on every planned item, weekly totals and a day's detail.
 */
const TrainingCalendarScreen: React.FC<Props> = ({ navigation }) => {
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
  const [showEarlier, setShowEarlier] = useState(false);
  const [loadHelpOpen, setLoadHelpOpen] = useState(false);

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
    setShowEarlier(false);
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

  const dayA11yLabel = (day: string) => {
    const items = days.get(day) ?? EMPTY_DAY;
    const marks = dayMarks(items);
    const date =
      day === today
        ? t('date.today', { defaultValue: 'Today' })
        : formatDate(day, appLocale);
    if (marks.length === 0) {
      return t('trainingCalendar.dayA11yNone', {
        date,
        defaultValue: '{{date}}, nothing planned or logged',
      });
    }
    return t('trainingCalendar.dayA11y', {
      date,
      marks: marks.map((m) => markA11yLabel(t, m.sport, m.status)).join('; '),
      defaultValue: '{{date}}: {{marks}}',
    });
  };

  const renderDayCell = (day: string) => {
    const items = days.get(day) ?? EMPTY_DAY;
    const marks = dayMarks(items);
    const isToday = day === today;
    const inMonth = mode === 'week' || day.slice(0, 7) === month;
    return (
      <Pressable
        key={day}
        testID={`calendar-day-${day}`}
        accessibilityRole="button"
        accessibilityLabel={dayA11yLabel(day)}
        accessibilityState={{ selected: day === selected }}
        onPress={() => setSelected(day)}
        className={`flex-1 items-center py-1.5 rounded-lg ${
          day === selected ? 'bg-accent-primary/20' : ''
        }`}
        style={{ minHeight: 52 }}
      >
        <View
          testID={isToday ? 'calendar-today-ring' : undefined}
          className={`items-center justify-center rounded-full ${
            isToday ? 'border-2 border-accent-primary' : ''
          }`}
          style={{ width: 26, height: 26 }}
        >
          <Text
            className={`text-sm ${
              !inMonth
                ? 'text-text-muted'
                : marks.length > 0
                  ? 'text-text-primary font-semibold'
                  : 'text-text-secondary'
            }`}
          >
            {Number(day.slice(8))}
          </Text>
        </View>
        <DayMarks marks={marks} />
      </Pressable>
    );
  };

  const renderWeekTotal = (weekStartDay: string) => {
    const week = data?.weeks.find((w) => w.start === weekStartDay);
    const summary = weekSummary(week);
    return (
      <Pressable
        key={`total-${weekStartDay}`}
        testID={`week-total-${weekStartDay}`}
        accessibilityRole="button"
        accessibilityLabel={
          summary
            ? summary.planned > 0
              ? t('trainingCalendar.weekTotalA11y', {
                  done: summary.done,
                  planned: summary.planned,
                  defaultValue: '{{done}} of {{planned}} planned sessions done',
                })
              : t('trainingCalendar.weekLoggedA11y', {
                  count: summary.done,
                  defaultValue: '{{count}} sessions logged',
                })
            : t('trainingCalendar.weekEmptyA11y', {
                defaultValue: 'No sessions this week',
              })
        }
        onPress={() => setSelected(weekStartDay)}
        className="items-center justify-center"
        style={{ width: WEEK_TOTAL_WIDTH }}
      >
        {summary ? (
          <Text className="text-text-secondary text-xs font-semibold">
            {summary.planned > 0
              ? t('trainingCalendar.weekTotalShort', {
                  done: summary.done,
                  planned: summary.planned,
                  defaultValue: '{{done}}/{{planned}}',
                })
              : formatLocalizedNumber(summary.done)}
          </Text>
        ) : null}
      </Pressable>
    );
  };

  // A run program workout opens its own screen (steps, the run it was done as,
  // repeat or skip); a workout plan item has no screen of its own.
  const renderPlanned = (item: PlannedItem) => {
    const programIndex =
      item.source === 'runProgram' && item.workoutNumber != null
        ? item.workoutNumber - 1
        : null;
    return (
      <Pressable
        key={item.id}
        testID={`planned-${item.id}`}
        disabled={programIndex === null}
        accessibilityRole={programIndex === null ? undefined : 'button'}
        onPress={() =>
          programIndex === null
            ? undefined
            : navigation.navigate('RunProgramWorkout', { index: programIndex })
        }
        className="flex-row items-center py-2"
      >
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
      </Pressable>
    );
  };

  // A completed row wears the colour of the planned item it counted for, or
  // the extra colour when nothing was planned: sport is in the text.
  const plannedStatus = new Map(detail.planned.map((p) => [p.id, p.status]));
  const renderCompleted = (item: CompletedItem) => (
    <View key={item.id} className="flex-row items-center py-2">
      <View
        className="w-2 h-8 rounded-full mr-3"
        style={{
          backgroundColor:
            item.plannedItemId !== null && plannedStatus.has(item.plannedItemId)
              ? STATUS_COLORS[plannedStatus.get(item.plannedItemId)!]
              : EXTRA_COLOR,
        }}
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
    <View
      key={week.start}
      testID={`week-row-${week.start}`}
      className={`mb-3 ${
        week.start === weekStart ? 'border-l-2 border-accent-primary pl-2' : ''
      }`}
    >
      <Text className="text-text-secondary text-xs mb-0.5">
        {t('trainingCalendar.weekOf', {
          date: formatShortDate(week.start, appLocale),
          defaultValue: 'Week of {{date}}',
        })}
      </Text>
      <Text className="text-text-primary text-sm">
        {week.plannedSessions > 0
          ? t('trainingCalendar.totals.sessions', {
              done: week.doneSessions + week.partialSessions,
              planned: week.plannedSessions,
              defaultValue: '{{done}} of {{planned}} planned sessions',
            })
          : t('trainingCalendar.totals.sessionsLogged', {
              count: week.completedSessions,
              defaultValue: '{{count}} sessions logged',
            })}
        {week.plannedSessions > 0 && week.extraSessions > 0
          ? ` · ${t('trainingCalendar.totals.extra', {
              count: week.extraSessions,
              defaultValue: '{{count}} extra',
            })}`
          : ''}
      </Text>
      <WeekProgressBar week={week} />
      <View className="flex-row flex-wrap items-center">
        <Text className="text-text-secondary text-xs">
          {week.plannedMinutes > 0
            ? t('trainingCalendar.totals.minutes', {
                done: formatLocalizedNumber(Math.round(week.matchedMinutes)),
                planned: formatLocalizedNumber(Math.round(week.plannedMinutes)),
                defaultValue: 'Time {{done}} of {{planned}} min',
              }) +
              (week.completedMinutes - week.matchedMinutes >= 1
                ? ` ${t('trainingCalendar.totals.minutesExtra', {
                    extra: formatLocalizedNumber(
                      Math.round(week.completedMinutes - week.matchedMinutes)
                    ),
                    defaultValue: '(+{{extra}} min extra)',
                  })}`
                : '')
            : t('trainingCalendar.totals.minutesDone', {
                done: formatLocalizedNumber(Math.round(week.completedMinutes)),
                defaultValue: 'Time {{done}} min',
              })}
          {' · '}
        </Text>
        <Pressable
          testID={`load-help-${week.start}`}
          accessibilityRole="button"
          accessibilityLabel={t('trainingCalendar.loadHelpA11y', {
            defaultValue: 'What is training load?',
          })}
          accessibilityState={{ expanded: loadHelpOpen }}
          onPress={() => setLoadHelpOpen((open) => !open)}
          hitSlop={8}
          className="flex-row items-center"
        >
          <Text className="text-text-secondary text-xs">
            {week.plannedLoad > 0
              ? t('trainingCalendar.totals.load', {
                  done: formatLocalizedNumber(Math.round(week.matchedLoad)),
                  planned: formatLocalizedNumber(Math.round(week.plannedLoad)),
                  defaultValue: 'Training load {{done}} of {{planned}}',
                }) +
                (week.completedLoad - week.matchedLoad >= 1
                  ? ` ${t('trainingCalendar.totals.loadExtra', {
                      extra: formatLocalizedNumber(
                        Math.round(week.completedLoad - week.matchedLoad)
                      ),
                      defaultValue: '(+{{extra}} extra)',
                    })}`
                  : '')
              : t('trainingCalendar.totals.loadDone', {
                  done: formatLocalizedNumber(Math.round(week.completedLoad)),
                  defaultValue: 'Training load {{done}}',
                })}
          </Text>
          <Icon
            name="info-circle"
            size={13}
            color="#999"
            style={{ marginLeft: 3 }}
          />
        </Pressable>
        {week.completedDistanceKm > 0 ? (
          <Text className="text-text-secondary text-xs">
            {` · ${distance(week.completedDistanceKm)}`}
          </Text>
        ) : null}
      </View>
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
    const { visible, earlier } =
      mode === 'month'
        ? orderWeeks(
            data.weeks.filter(
              (w) => w.plannedSessions + w.completedSessions > 0
            ),
            today
          )
        : { visible: selectedWeek ? [selectedWeek] : [], earlier: [] };
    const totalsWeeks = showEarlier ? [...visible, ...earlier] : visible;
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
            <View style={{ width: WEEK_TOTAL_WIDTH }} />
          </View>
          {rows.map((row) => (
            <View key={row[0]} className="flex-row">
              {row.map((day) => renderDayCell(day))}
              {renderWeekTotal(row[0]!)}
            </View>
          ))}
          <View
            testID="calendar-legend"
            className="flex-row flex-wrap mt-2"
            style={{ gap: 10 }}
          >
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
              <View
                className="w-2 h-2 rounded-full mr-1"
                style={{ backgroundColor: EXTRA_COLOR, opacity: 0.5 }}
              />
              <Text className="text-text-muted text-xs">
                {t('trainingCalendar.extra', { defaultValue: 'Extra' })}
              </Text>
            </View>
          </View>
          <View className="flex-row flex-wrap mt-2" style={{ gap: 10 }}>
            {SPORTS.map((sport) => (
              <View key={sport} className="flex-row items-center">
                <View className="mr-1">
                  <Icon name={SPORT_ICONS[sport]} size={13} color="#999" />
                </View>
                <Text className="text-text-muted text-xs">
                  {sportLoadLabel(t, sport)}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
          <Text className="text-text-primary text-base font-bold mb-1">
            {selected === today
              ? t('date.today', { defaultValue: 'Today' })
              : formatDate(selected, appLocale)}
          </Text>
          {detail.planned.length === 0 && detail.completed.length === 0 ? (
            <Text testID="empty-day" className="text-text-muted text-sm">
              {selected <= addDays(today, REST_DAY_AHEAD_DAYS)
                ? t('trainingCalendar.restDay', { defaultValue: 'Rest day' })
                : t('trainingCalendar.emptyDay', {
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
            {loadHelpOpen ? (
              <View
                testID="load-help"
                className="bg-background rounded-lg p-3 mb-3"
              >
                <Text className="text-text-primary text-xs font-semibold mb-1">
                  {t('exerciseStatistics.load.title', {
                    defaultValue: 'Training Load',
                  })}
                </Text>
                <Text className="text-text-secondary text-xs">
                  {t('exerciseStatistics.load.subtitle', {
                    defaultValue:
                      'Workout minutes weighted by heart rate, this week against the last four.',
                  })}{' '}
                  {t('trainingCalendar.load.method', {
                    defaultValue:
                      'Load is minutes weighted by your average heart rate (1 to 5, from how close it was to your maximum). A workout with no heart rate counts at a moderate weight of 2, so a strength session with no watch still counts by its time. Effort ratings are not used.',
                  })}
                </Text>
              </View>
            ) : null}
            {totalsWeeks.map(renderTotals)}
            {earlier.length > 0 ? (
              <Pressable
                testID="toggle-earlier-weeks"
                accessibilityRole="button"
                onPress={() => setShowEarlier((open) => !open)}
                className="items-center py-1"
              >
                <Text className="text-accent-primary text-sm font-semibold">
                  {showEarlier
                    ? t('trainingCalendar.hideEarlier', {
                        defaultValue: 'Hide earlier weeks',
                      })
                    : t('trainingCalendar.showEarlier', {
                        count: earlier.length,
                        defaultValue: 'Show earlier weeks ({{count}})',
                      })}
                </Text>
              </Pressable>
            ) : null}
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
