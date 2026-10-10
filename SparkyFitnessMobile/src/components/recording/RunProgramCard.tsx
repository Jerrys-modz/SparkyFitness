import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import Button from '../ui/Button';
import Switch from '../ui/Switch';
import SegmentedControl from '../SegmentedControl';
import BottomSheetPicker, { type PickerSection } from '../BottomSheetPicker';
import { getAppLocale } from '../../localization';
import type { RunReminders } from '../../services/runReminderService';
import {
  planMinutes,
  type ProgramStatus,
  type RunProgramAdjustment,
} from '@workspace/shared';

export function programName(t: TFunction, id: string): string {
  switch (id) {
    case 'beginner5k':
      return t('recordActivity.program.name.beginner5k', {
        defaultValue: 'Beginner 5K',
      });
    default:
      return id;
  }
}

/** "Week 3, run 2" for a program workout. */
export function programWorkoutLabel(
  t: TFunction,
  status: ProgramStatus
): string {
  const workout = status.workout;
  if (!workout) return programName(t, status.program.id);
  return t('recordActivity.program.workoutLabel', {
    name: programName(t, status.program.id),
    week: workout.week + 1,
    run: workout.day + 1,
    defaultValue: '{{name}} · Week {{week}}, run {{run}}',
  });
}

const REMINDER_HOURS = [7, 12, 18] as const;

const weekdayLabel = (day: number, style: 'narrow' | 'long'): string =>
  // 2024-01-07 was a Sunday, so day 0 is Sunday.
  new Date(2024, 0, 7 + day).toLocaleDateString(getAppLocale(), {
    weekday: style,
  });

const hourLabel = (hour: number): string =>
  new Date(2024, 0, 1, hour).toLocaleTimeString(getAppLocale(), {
    hour: 'numeric',
  });

interface Props {
  /** The latest change to the plan, shown for a couple of weeks. */
  lastAdjustment?: RunProgramAdjustment | null;
  /** Epoch ms "now", from the screen, to judge whether a change is recent. */
  now: number;
  reminders: RunReminders;
  onReminders: (reminders: RunReminders) => void;
  /** Jump to any workout in the program (0-based index). */
  onPickWorkout: (index: number) => void;
  status: ProgramStatus | null;
  loaded: boolean;
  /** Whether today's program workout is the plan chosen for this recording. */
  selected: boolean;
  /** Whether the person is using the program. */
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  onSelect: () => void;
  onRestart: () => void;
  onSkip: () => void;
}

/** Start, follow and leave a multi-week run program. */
const RunProgramCard: React.FC<Props> = ({
  lastAdjustment = null,
  now,
  reminders,
  onReminders,
  onPickWorkout,
  status,
  loaded,
  selected,
  enabled,
  onToggle,
  onSelect,
  onRestart,
  onSkip,
}) => {
  const { t } = useTranslation();
  if (!loaded) return null;

  const header = (
    <View className="flex-row items-center justify-between">
      <View className="flex-1 mr-3">
        <Text className="text-text-primary text-sm font-semibold">
          {t('recordActivity.program.title', {
            defaultValue: 'Training program',
          })}
        </Text>
        <Text className="text-text-secondary text-xs mt-1">
          {t('recordActivity.program.switchHint', {
            defaultValue:
              'Follow a plan that builds up week by week. Off by default.',
          })}
        </Text>
      </View>
      <Switch
        value={enabled}
        onValueChange={onToggle}
        accessibilityLabel={t('recordActivity.program.use', {
          defaultValue: 'Use a training program',
        })}
      />
    </View>
  );

  if (!enabled || !status) {
    return (
      <View className="bg-surface rounded-xl p-4 mt-4">
        {header}
        <Text className="text-text-secondary text-xs mt-3">
          {status
            ? t('recordActivity.program.paused', {
                name: programName(t, status.program.id),
                done: status.done,
                total: status.total,
                defaultValue:
                  '{{name}} is paused at {{done}} of {{total}} workouts. Switch it on to carry on.',
              })
            : t('recordActivity.program.beginner5kDescription', {
                defaultValue:
                  'Beginner 5K: nine weeks, three runs a week. You alternate running and walking, and build up to 30 minutes of running.',
              })}
        </Text>
      </View>
    );
  }

  const sections: PickerSection<number>[] = Array.from(
    { length: status.program.weeks },
    (_, week) => ({
      title: t('recordActivity.program.weekTitle', {
        week: week + 1,
        defaultValue: 'Week {{week}}',
      }),
      options: status.program.workouts
        .map((workout, index) => ({ workout, index }))
        .filter(({ workout }) => workout.week === week)
        .map(({ workout, index }) => ({
          label: t('recordActivity.program.pickOption', {
            run: workout.day + 1,
            minutes: planMinutes(workout.plan),
            mark: index < status.done ? '✓ ' : '',
            defaultValue: '{{mark}}Run {{run}} · {{minutes}} min',
          }),
          value: index,
        })),
    })
  );
  // A change older than this is history, not news.
  const recentChange =
    lastAdjustment &&
    now - Date.parse(lastAdjustment.at) < 14 * 24 * 3600 * 1000
      ? lastAdjustment
      : null;
  const changeDate = recentChange
    ? new Date(recentChange.at).toLocaleDateString(getAppLocale(), {
        month: 'short',
        day: 'numeric',
      })
    : '';
  const fraction = status.total > 0 ? status.done / status.total : 0;
  return (
    <View className="bg-surface rounded-xl p-4 mt-4">
      {header}
      <Text className="text-text-primary text-sm font-semibold mt-3">
        {status.finished
          ? t('recordActivity.program.finished', {
              name: programName(t, status.program.id),
              defaultValue: '{{name}} complete',
            })
          : programWorkoutLabel(t, status)}
      </Text>
      <Text className="text-text-secondary text-xs mt-1">
        {status.finished
          ? t('recordActivity.program.finishedHint', {
              defaultValue: 'Well done. You can start it again or move on.',
            })
          : t('recordActivity.program.progress', {
              done: status.done,
              total: status.total,
              minutes: status.workout ? planMinutes(status.workout.plan) : 0,
              defaultValue:
                'Workout {{done}} of {{total}} done · {{minutes}} min today',
            })}
      </Text>
      {recentChange ? (
        <Text className="text-text-secondary text-xs mt-2">
          {recentChange.source === 'assistant'
            ? t('recordActivity.program.changedBySparky', {
                date: changeDate,
                summary: recentChange.summary,
                defaultValue:
                  'Sparky changed your plan on {{date}}: {{summary}}',
              })
            : t('recordActivity.program.changed', {
                date: changeDate,
                summary: recentChange.summary,
                defaultValue: 'Plan changed on {{date}}: {{summary}}',
              })}
        </Text>
      ) : null}
      <View className="h-2 rounded-full bg-raised mt-3 overflow-hidden">
        <View
          className="h-2 rounded-full bg-accent-primary"
          style={{ width: `${Math.round(fraction * 100)}%` }}
        />
      </View>
      <View className="flex-row mt-3">
        {status.finished ? (
          <View className="flex-1 mr-2">
            <Button variant="outline" onPress={onRestart}>
              {t('recordActivity.program.restart', {
                defaultValue: 'Start again',
              })}
            </Button>
          </View>
        ) : (
          <View className="flex-1 mr-2">
            <Button
              variant={selected ? 'primary' : 'outline'}
              onPress={onSelect}
            >
              {selected
                ? t('recordActivity.program.using', {
                    defaultValue: 'Using this workout',
                  })
                : t('recordActivity.program.doThis', {
                    defaultValue: 'Do this workout',
                  })}
            </Button>
          </View>
        )}
      </View>
      {status.finished ? null : (
        <View className="mt-3">
          <Text className="text-text-primary text-sm font-semibold">
            {t('recordActivity.program.reminders', {
              defaultValue: 'Run reminders',
            })}
          </Text>
          <View className="flex-row justify-between mt-2">
            {Array.from({ length: 7 }, (_, day) => {
              const on = reminders.days.includes(day);
              return (
                <TouchableOpacity
                  key={day}
                  accessibilityRole="button"
                  accessibilityLabel={weekdayLabel(day, 'long')}
                  accessibilityState={{ selected: on }}
                  onPress={() =>
                    onReminders({
                      ...reminders,
                      days: on
                        ? reminders.days.filter((d) => d !== day)
                        : [...reminders.days, day].sort(),
                    })
                  }
                  className={`w-10 h-10 rounded-full items-center justify-center ${
                    on ? 'bg-accent-primary' : 'bg-raised'
                  }`}
                >
                  <Text
                    className={`text-sm font-semibold ${
                      on ? 'text-white' : 'text-text-primary'
                    }`}
                  >
                    {weekdayLabel(day, 'narrow')}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {reminders.days.length > 0 ? (
            <View className="mt-2">
              <SegmentedControl<string>
                segments={REMINDER_HOURS.map((hour) => ({
                  key: String(hour),
                  label: hourLabel(hour),
                }))}
                activeKey={String(reminders.hour)}
                onSelect={(key) =>
                  onReminders({ ...reminders, hour: Number(key) })
                }
              />
            </View>
          ) : (
            <Text className="text-text-muted text-xs mt-2">
              {t('recordActivity.program.remindersHint', {
                defaultValue:
                  'Pick the days you plan to run to get a reminder.',
              })}
            </Text>
          )}
        </View>
      )}
      <BottomSheetPicker<number>
        value={Math.min(status.done, status.total - 1)}
        sections={sections}
        onSelect={onPickWorkout}
        title={t('recordActivity.program.pickTitle', {
          defaultValue: 'Choose a workout',
        })}
        renderTrigger={({ onPress }) => (
          <Button variant="link" onPress={onPress}>
            {t('recordActivity.program.pick', {
              defaultValue: 'Choose a different workout',
            })}
          </Button>
        )}
      />
      <View className="flex-row mt-1">
        {status.finished ? null : (
          <Button variant="link" onPress={onSkip}>
            {t('recordActivity.program.skip', { defaultValue: 'Skip' })}
          </Button>
        )}
        {status.done > 0 ? (
          <Button variant="link" onPress={onRestart}>
            {t('recordActivity.program.startOver', {
              defaultValue: 'Start over',
            })}
          </Button>
        ) : null}
      </View>
    </View>
  );
};

export default RunProgramCard;
