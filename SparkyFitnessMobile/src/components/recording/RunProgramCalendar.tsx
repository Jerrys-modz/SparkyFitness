import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useCSSVariable } from 'uniwind';
import {
  catchUpFor,
  daysBetween,
  planMinutes,
  projectRuns,
  projectedFinishDay,
  type ProgramStatus,
} from '@workspace/shared';
import { formatDayLabel } from '../../utils/dayLabel';
import {
  workoutFocus,
  workoutFocusLabel,
} from '../../utils/programWorkoutFocus';
import Button from '../ui/Button';
import Icon from '../Icon';
import { workoutTitle } from './RunProgramCard';
import { useCSSVariable } from 'uniwind';

/** Runs listed before "Show all". */
const PREVIEW_RUNS = 4;

const dayText = (day: string, style: 'long' | 'short'): string =>
  formatDayLabel(day, style);

/**
 * When each remaining workout falls, from the person's place, their run days,
 * first day and goal day. Worked out afresh from the next workout due, so a
 * missed run moves everything after it. Says whether the program fits before
 * the goal day.
 */
const RunProgramCalendar: React.FC<{
  status: ProgramStatus;
  schedule: {
    days: number[];
    startDay: string | null;
    endDay: string | null;
  };
  doneDay: string | null;
  /** Today, YYYY-MM-DD. */
  today: string;
  /** Moves the place in the program to this workout (a catch-up). */
  onCatchUp?: (next: number) => void;
}> = ({ status, schedule, doneDay, today, onCatchUp }) => {
  const { t } = useTranslation();
  const successGlyph = useCSSVariable('--color-icon-success') as string;
  const accent = useCSSVariable('--color-accent-primary') as string;
  const [showAll, setShowAll] = useState(false);
  if (status.finished) return null;

  const base = {
    total: status.total,
    next: status.done,
    today,
    doneToday: doneDay === today,
  };
  const plan = {
    runDays: schedule.days,
    startDay: schedule.startDay,
    endDay: schedule.endDay,
  };
  const runs = projectRuns({ ...base, schedule: plan });
  const finish = projectedFinishDay({ ...base, schedule: plan });
  const left = status.total - status.done;

  let fit: string | null = null;
  let badge: { text: string; late: boolean } | null = null;
  if (finish && schedule.endDay) {
    const gap = daysBetween(finish, schedule.endDay);
    badge =
      gap >= 0
        ? {
            late: false,
            text: t('runPrograms.calendar.onTrackBadge', {
              count: gap,
              defaultValue: 'On track (+{{count}} days)',
              defaultValue_one: 'On track (+{{count}} day)',
              defaultValue_other: 'On track (+{{count}} days)',
            }),
          }
        : {
            late: true,
            text: t('runPrograms.calendar.lateBadge', {
              count: -gap,
              defaultValue: '{{count}} days late',
              defaultValue_one: '{{count}} day late',
              defaultValue_other: '{{count}} days late',
            }),
          };
    fit =
      gap >= 0
        ? t('runPrograms.calendar.fitsBefore', {
            count: gap,
            date: dayText(finish, 'long'),
            defaultValue:
              'On track: you finish on {{date}}, {{count}} days before your goal date.',
            defaultValue_one:
              'On track: you finish on {{date}}, {{count}} day before your goal date.',
            defaultValue_other:
              'On track: you finish on {{date}}, {{count}} days before your goal date.',
          })
        : t('runPrograms.calendar.fitsAfter', {
            count: -gap,
            date: dayText(finish, 'long'),
            defaultValue:
              'At this pace you finish on {{date}}, {{count}} days after your goal date. Add a workout day or move the date.',
            defaultValue_one:
              'At this pace you finish on {{date}}, {{count}} day after your goal date. Add a workout day or move the date.',
            defaultValue_other:
              'At this pace you finish on {{date}}, {{count}} days after your goal date. Add a workout day or move the date.',
          });
  }

  const movesNote = t('runPrograms.calendar.moves', {
    defaultValue:
      'A workout you miss is not skipped: the dates after it move along.',
  });
  const catchUp = catchUpFor({ ...base, schedule: plan });

  const shown = showAll ? runs : runs.slice(0, PREVIEW_RUNS);
  return (
    <View
      className="bg-surface rounded-2xl p-4 mt-4 border border-border-subtle"
      testID="run-program-calendar"
    >
      <View className="flex-row items-center justify-between">
        <Text className="text-text-primary text-base font-bold">
          {t('runPrograms.calendar.timelineTitle', {
            defaultValue: 'Workout timeline',
          })}
        </Text>
        {badge ? (
          <View
            testID="run-program-fit-badge"
            className={`px-2 py-0.5 rounded border ${
              badge.late
                ? 'bg-icon-danger/10 border-icon-danger/20'
                : 'bg-exercise/10 border-exercise/20'
            }`}
          >
            <Text
              className={`text-xs font-semibold ${
                badge.late ? 'text-icon-danger' : 'text-exercise'
              }`}
            >
              {badge.text}
            </Text>
          </View>
        ) : null}
      </View>
      {schedule.days.length === 0 ? (
        <Text className="text-text-secondary text-sm mt-2">
          {t('runPrograms.calendar.noDays', {
            count: left,
            defaultValue:
              '{{count}} workouts left. Pick your workout days to see when each one falls; until then the Diary offers the next one every day.',
            defaultValue_one:
              '{{count}} workout left. Pick your workout days to see when each one falls; until then the Diary offers the next one every day.',
            defaultValue_other:
              '{{count}} workouts left. Pick your workout days to see when each one falls; until then the Diary offers the next one every day.',
          })}
        </Text>
      ) : (
        <>
          {finish ? (
            <Text className="text-text-secondary text-sm mt-1">
              {t('runPrograms.calendar.finish', {
                date: dayText(finish, 'long'),
                defaultValue: 'Finishes on {{date}}.',
              })}
            </Text>
          ) : null}
          {fit ? (
            <View
              className="bg-raised rounded-lg px-3 py-2.5 mt-3"
              testID="run-program-fit"
            >
              <View className="flex-row items-start">
                <View
                  className="w-2 h-2 rounded-full mt-1.5 mr-2"
                  style={{ backgroundColor: successGlyph }}
                />
                <Text className="text-text-primary text-sm flex-1">{fit}</Text>
              </View>
              <Text className="text-text-muted text-xs mt-1">{movesNote}</Text>
            </View>
          {fit && badge?.late ? (
            <Text className="text-text-secondary text-sm mt-1">{fit}</Text>
          ) : null}
          {catchUp.state === 'skip' && onCatchUp ? (
            <View className="mt-2" testID="run-program-catch-up">
              <Text className="text-text-secondary text-sm">
                {t('runPrograms.calendar.catchUp', {
                  count: catchUp.skip,
                  date: dayText(catchUp.finishDay, 'long'),
                  defaultValue:
                    'Skip the next {{count}} workouts to finish on {{date}}, in time for your goal. The last workout is never skipped.',
                  defaultValue_one:
                    'Skip the next {{count}} workout to finish on {{date}}, in time for your goal. The last workout is never skipped.',
                  defaultValue_other:
                    'Skip the next {{count}} workouts to finish on {{date}}, in time for your goal. The last workout is never skipped.',
                })}
              </Text>
              <View className="mt-2">
                <Button
                  variant="outline"
                  onPress={() => onCatchUp(catchUp.next)}
                  testID="run-program-catch-up-button"
                >
                  {t('runPrograms.calendar.catchUpButton', {
                    count: catchUp.skip,
                    defaultValue: 'Skip {{count}} workouts',
                    defaultValue_one: 'Skip {{count}} workout',
                    defaultValue_other: 'Skip {{count}} workouts',
                  })}
                </Button>
              </View>
            </View>
          ) : null}
          {catchUp.state === 'tooFar' ? (
            <Text
              className="text-text-secondary text-sm mt-1"
              testID="run-program-too-far"
            >
              {t('runPrograms.calendar.tooFar', {
                count: catchUp.late,
                defaultValue:
                  'You are too far behind to catch up by skipping: {{count}} workouts will not fit. Add workout days or move your goal date.',
                defaultValue_one:
                  'You are too far behind to catch up by skipping: {{count}} workout will not fit. Add workout days or move your goal date.',
                defaultValue_other:
                  'You are too far behind to catch up by skipping: {{count}} workouts will not fit. Add workout days or move your goal date.',
              })}
            </Text>
          ) : null}
          {fit ? null : (
            <Text className="text-text-muted text-xs mt-1">{movesNote}</Text>
          )}
          <View className="mt-3">
            {shown.map((run) => {
          <Text className="text-text-muted text-xs mt-1">
            {t('runPrograms.calendar.moves', {
              defaultValue:
                'A workout you miss is not skipped: the dates after it move along.',
            })}
          </Text>
          <View className="mt-3.5 pl-5" testID="run-program-timeline">
            <View
              className="absolute bg-border-subtle"
              style={{ left: 7, top: 8, bottom: 8, width: 2 }}
            />
            {shown.map((run, position) => {
              const workout = status.program.workouts[run.index];
              if (!workout) return null;
              const minutes = planMinutes(workout.plan);
              const title = workoutTitle(t, status.program, workout);
              const focus = workoutFocusLabel(
                t,
                workoutFocus(workout.plan).focus
              );
              const date =
                run.day === today
                  ? t('runPrograms.calendar.todayDate', {
                      date: dayText(run.day, 'short'),
                      defaultValue: 'Today · {{date}}',
                    })
                  : dayText(run.day, 'short');
              const minutesText = t('runPrograms.hero.minutes', {
                minutes,
                defaultValue: '{{minutes}} min',
              });
              if (position === 0) {
                return (
                  <View
                    key={run.index}
                    className="mb-3.5 pl-3"
                    testID={`run-program-timeline-${run.index}`}
                  >
                    <View
                      className="absolute rounded-full bg-accent-primary"
                      style={{ left: -18, top: 6, width: 12, height: 12 }}
                    />
                    <View className="p-3 bg-raised rounded-xl border border-accent-primary/30">
                      <View className="flex-row items-center justify-between">
                        <Text className="text-accent-primary text-xs font-bold uppercase tracking-wider">
                          {date}
                        </Text>
                        <Text className="text-text-primary text-xs font-semibold">
                          {minutesText}
                        </Text>
                      </View>
                      <Text className="text-text-primary text-sm font-semibold mt-1">
                        {title}
                      </Text>
                      <Text className="text-text-secondary text-xs mt-0.5">
                        {focus}
                      </Text>
                    </View>
                  </View>
                );
              }
              return (
                <View
                  key={run.index}
                  className="mb-3.5 pl-3 flex-row items-center justify-between"
                  testID={`run-program-timeline-${run.index}`}
                >
                  <View className="flex-row items-center">
                    {run.day === today ? (
                      <View className="w-1.5 h-1.5 rounded-full bg-accent-primary mr-2" />
                    ) : null}
                    <Text className="text-text-primary text-sm">
                      {dayText(run.day, 'short')}
                      {run.day === today
                        ? ` · ${t('date.today', { defaultValue: 'Today' })}`
                        : ''}
                    </Text>
                  </View>
                  <Text className="text-text-secondary text-sm">
                    {status.program.activity === 'walk'
                      ? t('runPrograms.calendar.rowWalk', {
                          week: workout.week + 1,
                          walk: workout.day + 1,
                          minutes: planMinutes(workout.plan),
                          defaultValue:
                            'Week {{week}}, walk {{walk}} · {{minutes}} min',
                        })
                      : t('runPrograms.calendar.row', {
                          week: workout.week + 1,
                          run: workout.day + 1,
                          minutes: planMinutes(workout.plan),
                          defaultValue:
                            'Week {{week}}, run {{run}} · {{minutes}} min',
                        })}
                  <View
                    className="absolute rounded-full bg-text-muted"
                    style={{ left: -16, top: 6, width: 8, height: 8 }}
                  />
                  <View className="flex-1 mr-3">
                    <Text className="text-text-primary text-xs font-semibold">
                      {date}
                    </Text>
                    <Text className="text-text-secondary text-xs mt-0.5">
                      {title} · {focus}
                    </Text>
                  </View>
                  <Text className="text-text-muted text-xs font-medium">
                    {minutesText}
                  </Text>
                </View>
              );
            })}
          </View>
          {runs.length > PREVIEW_RUNS ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => setShowAll((value) => !value)}
              className="mt-1 py-2 bg-raised rounded-lg border border-border-subtle flex-row items-center justify-center"
            >
              <Text className="text-accent-primary text-xs font-semibold mr-1">
                {showAll
                  ? t('runPrograms.calendar.showLess', {
                      defaultValue: 'Show fewer',
                    })
                  : t('runPrograms.calendar.showAll', {
                      count: runs.length,
                      defaultValue: 'Show all {{count}}',
                      defaultValue_one: 'Show {{count}}',
                      defaultValue_other: 'Show all {{count}}',
                    })}
              </Text>
              <Icon
                name={showAll ? 'chevron-up' : 'chevron-down'}
                size={14}
                color={accent}
              />
            </Pressable>
          ) : null}
          {runs.length < left ? (
            <Text className="text-text-muted text-xs mt-2">
              {t('runPrograms.calendar.cutOff', {
                count: left - runs.length,
                defaultValue:
                  '{{count}} workouts do not fit before your goal date.',
                defaultValue_one:
                  '{{count}} workout does not fit before your goal date.',
                defaultValue_other:
                  '{{count}} workouts do not fit before your goal date.',
              })}
            </Text>
          ) : null}
        </>
      )}
    </View>
  );
};

export default RunProgramCalendar;
