import React, { useRef } from 'react';
import { Pressable, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useCSSVariable } from 'uniwind';
import Button from '../ui/Button';
import Icon from '../Icon';
import Switch from '../ui/Switch';
import BottomSheetPicker, {
  type PickerOption,
  type PickerSection,
} from '../BottomSheetPicker';
import { formatLocalizedNumber, getAppLocale } from '../../localization';
import CalendarSheet, { type CalendarSheetRef } from '../CalendarSheet';
import ZoneCheckNote from './ZoneCheckNote';
import type { ProgramScheduleChange } from '../../services/runProgramService';
import { toLocalDateString } from '../../utils/dateUtils';
import { formatDayLabel } from '../../utils/dayLabel';
import {
  workoutFocus,
  workoutFocusLabel,
} from '../../utils/programWorkoutFocus';
import {
  addDays,
  findProgram,
  planMinutes,
  programOutline,
  RUN_PROGRAMS,
  runMinutes,
  type IntervalPlan,
  type ProgramStatus,
  type ProgramWorkout,
  type RunProgram,
  type RunProgramAdjustment,
} from '@workspace/shared';

/** A program's name: the person's own for a custom one, else the built-in's. */
export function programTitle(t: TFunction, program: RunProgram): string {
  return program.custom?.name || programName(t, program.id);
}

/** Walking programs quote brisk time; run programs quote the whole workout. */
function workoutMinutes(program: RunProgram, plan: IntervalPlan): number {
  return program.activity === 'walk' ? runMinutes(plan) : planMinutes(plan);
}

/** "Workout 4" or the person's own name for a workout of a custom program. */
export function customWorkoutTitle(
  t: TFunction,
  workout: ProgramWorkout
): string {
  return (
    workout.title ||
    t('runPrograms.custom.workoutNumber', {
      number: workout.week * 7 + workout.day + 1,
      defaultValue: 'Workout {{number}}',
    })
  );
}

export function programName(t: TFunction, id: string): string {
  switch (id) {
    case 'walkFit':
      return t('recordActivity.program.name.walkFit', {
        defaultValue: 'Walk for fitness',
      });
    case 'beginner5k':
      return t('recordActivity.program.name.beginner5k', {
        defaultValue: 'Beginner 5K',
      });
    case 'fiveToTenK':
      return t('recordActivity.program.name.fiveToTenK', {
        defaultValue: '5K to 10K',
      });
    case 'zone2Base':
      return t('recordActivity.program.name.zone2Base', {
        defaultValue: 'Zone 2 base',
      });
    case 'zone2Base4':
      return t('recordActivity.program.name.zone2Base4', {
        defaultValue: 'Zone 2 base (4 runs a week)',
      });
    case 'faster5k':
      return t('recordActivity.program.name.faster5k', {
        defaultValue: 'Faster 5K',
      });
    case 'halfMarathon':
      return t('recordActivity.program.name.halfMarathon', {
        defaultValue: 'Half marathon',
      });
    case 'marathon':
      return t('recordActivity.program.name.marathon', {
        defaultValue: 'Marathon',
      });
    case 'walk10k':
      return t('recordActivity.program.name.walk10k', {
        defaultValue: 'Brisk walk 10K',
      });
    case 'returnToRunning':
      return t('recordActivity.program.name.returnToRunning', {
        defaultValue: 'Return to running',
      });
    case 'gentle5k':
      return t('recordActivity.program.name.gentle5k', {
        defaultValue: 'Gentle 5K',
      });
    case 'beginner10k':
      return t('recordActivity.program.name.beginner10k', {
        defaultValue: 'Beginner 10K',
      });
    case 'faster10k':
      return t('recordActivity.program.name.faster10k', {
        defaultValue: 'Faster 10K',
      });
    case 'tenKToHalf':
      return t('recordActivity.program.name.tenKToHalf', {
        defaultValue: '10K to half marathon',
      });
    case 'fasterHalf':
      return t('recordActivity.program.name.fasterHalf', {
        defaultValue: 'Faster half marathon',
      });
    case 'beginnerMarathon':
      return t('recordActivity.program.name.beginnerMarathon', {
        defaultValue: 'Beginner marathon',
      });
    case 'advancedMarathon':
      return t('recordActivity.program.name.advancedMarathon', {
        defaultValue: 'Advanced marathon',
      });
    case 'halfMarathon4':
      return t('recordActivity.program.name.halfMarathon4', {
        defaultValue: 'Half marathon (4 runs a week)',
      });
    case 'tenKToHalf4':
      return t('recordActivity.program.name.tenKToHalf4', {
        defaultValue: '10K to half marathon (4 runs a week)',
      });
    case 'fasterHalf4':
      return t('recordActivity.program.name.fasterHalf4', {
        defaultValue: 'Faster half marathon (4 runs a week)',
      });
    case 'beginnerMarathon4':
      return t('recordActivity.program.name.beginnerMarathon4', {
        defaultValue: 'Beginner marathon (4 runs a week)',
      });
    case 'halfMarathon2':
      return t('recordActivity.program.name.halfMarathon2', {
        defaultValue: 'Half marathon (2 runs a week)',
      });
    case 'marathon2':
      return t('recordActivity.program.name.marathon2', {
        defaultValue: 'Marathon (2 runs a week)',
      });
    case 'trailMarathon':
      return t('recordActivity.program.name.trailMarathon', {
        defaultValue: 'Trail marathon',
      });
    case 'trail50k':
      return t('recordActivity.program.name.trail50k', {
        defaultValue: 'Trail 50K',
      });
    case 'fiftyK':
      return t('recordActivity.program.name.fiftyK', {
        defaultValue: '50K',
      });
    case 'fiftyK2':
      return t('recordActivity.program.name.fiftyK2', {
        defaultValue: '50K (2 runs a week)',
      });
    case 'hundredK':
      return t('recordActivity.program.name.hundredK', {
        defaultValue: '100K',
      });
    case 'hundredK2':
      return t('recordActivity.program.name.hundredK2', {
        defaultValue: '100K (2 runs a week)',
      });
    default:
      return id;
  }
}

/** A sentence on who a program is for and what it does. */
export function programDescription(t: TFunction, id: string): string {
  switch (id) {
    case 'walkFit':
      return t('recordActivity.program.walkFitDescription', {
        defaultValue:
          'Walk for fitness: eight weeks, three walks a week, with no running. You alternate brisk and easy walking and build up to 30 minutes of brisk walking.',
      });
    case 'beginner5k':
      return t('recordActivity.program.beginner5kDescription', {
        defaultValue:
          'Beginner 5K: nine weeks, three runs a week. You alternate running and walking, and build up to 30 minutes of running.',
      });
    case 'fiveToTenK':
      return t('recordActivity.program.fiveToTenKDescription', {
        defaultValue:
          '5K to 10K: eight weeks, three runs a week, for when you can run 30 minutes. It builds to a 65 minute long run.',
      });
    case 'faster5k':
      return t('recordActivity.program.faster5kDescription', {
        defaultValue:
          'Faster 5K: six weeks of speed sessions, easy runs and tempo runs, for when you already run 5K.',
      });
    case 'halfMarathon':
      return t('recordActivity.program.halfMarathonDescription', {
        defaultValue:
          'Half marathon: twelve weeks, three runs a week, with long runs building to about two hours. For when you run 30 minutes comfortably.',
      });
    case 'marathon':
      return t('recordActivity.program.marathonDescription', {
        defaultValue:
          'Marathon: sixteen weeks, four runs a week, with long runs building to about 2¾ hours and a taper. For people who already run regularly.',
      });
    case 'walk10k':
      return t('recordActivity.program.walk10kDescription', {
        defaultValue:
          'Brisk walk 10K: ten weeks, three walks a week, with no running. You build up to a 10K walk of about an hour and three quarters.',
      });
    case 'returnToRunning':
      return t('recordActivity.program.returnToRunningDescription', {
        defaultValue:
          'Return to running: four weeks, three runs a week, for easing back in after a break. You build from one-minute runs to about 20 minutes of running. Leave a day or two between runs and keep the pace easy. If you are coming back from an injury, check with a physio or doctor first.',
      });
    case 'gentle5k':
      return t('recordActivity.program.gentle5kDescription', {
        defaultValue:
          'Gentle 5K: twelve weeks, three runs a week. A slower start than Beginner 5K, with very short runs between long walks, building to 30 minutes of running.',
      });
    case 'beginner10k':
      return t('recordActivity.program.beginner10kDescription', {
        defaultValue:
          'Beginner 10K: twelve weeks, three runs a week, starting from walking. You build up to running for an hour.',
      });
    case 'faster10k':
      return t('recordActivity.program.faster10kDescription', {
        defaultValue:
          'Faster 10K: eight weeks of speed sessions, easy runs and tempo runs, for when you already run 10K.',
      });
    case 'tenKToHalf':
      return t('recordActivity.program.tenKToHalfDescription', {
        defaultValue:
          '10K to half marathon: ten weeks, three runs a week, for when you can run 10K. Long runs build from 65 to 115 minutes.',
      });
    case 'fasterHalf':
      return t('recordActivity.program.fasterHalfDescription', {
        defaultValue:
          'Faster half marathon: ten weeks of speed sessions, easy runs and long runs with tempo work, for when you have run a half marathon before.',
      });
    case 'beginnerMarathon':
      return t('recordActivity.program.beginnerMarathonDescription', {
        defaultValue:
          'Beginner marathon: eighteen weeks, three runs a week, with long runs building to 2½ hours and a taper. For when you can run 10K.',
      });
    case 'advancedMarathon':
      return t('recordActivity.program.advancedMarathonDescription', {
        defaultValue:
          'Advanced marathon: sixteen weeks, five runs a week, with speed or tempo work and long runs building to three hours. For experienced runners.',
      });
    case 'zone2Base':
      return t('recordActivity.program.zone2BaseDescription', {
        defaultValue:
          'Zone 2 base: ten weeks, three easy runs a week held to your Zone 2 heart rate (or the talk test), building time in zone with a long run of up to 70 minutes. For when you can run 30 minutes.',
      });
    case 'zone2Base4':
      return t('recordActivity.program.zone2Base4Description', {
        defaultValue:
          'Zone 2 base: ten weeks, four easy runs a week held to your Zone 2 heart rate (or the talk test), building time in zone with a long run of up to 70 minutes. For when you can run 30 minutes.',
      });
    case 'halfMarathon4':
      return t('recordActivity.program.halfMarathon4Description', {
        defaultValue:
          'Half marathon: twelve weeks, four runs a week, with long runs building to about two hours. For when you run 30 minutes comfortably.',
      });
    case 'tenKToHalf4':
      return t('recordActivity.program.tenKToHalf4Description', {
        defaultValue:
          '10K to half marathon: ten weeks, four runs a week, with long runs building to about two hours. For when you can run 10K.',
      });
    case 'beginnerMarathon4':
      return t('recordActivity.program.beginnerMarathon4Description', {
        defaultValue:
          'Beginner marathon: eighteen weeks, four runs a week, with long runs building to 2½ hours and a taper. For when you can run 10K.',
      });
    case 'fasterHalf4':
      return t('recordActivity.program.fasterHalf4Description', {
        defaultValue:
          'Faster half marathon: ten weeks, four runs a week, with a speed session, easy runs and a long run. For when you have run a half marathon before.',
      });
    case 'halfMarathon2':
      return t('recordActivity.program.halfMarathon2Description', {
        defaultValue:
          'Half marathon: twelve weeks, two runs a week, with long runs building to about two hours. For when you run 30 minutes comfortably but cannot train more often.',
      });
    case 'marathon2':
      return t('recordActivity.program.marathon2Description', {
        defaultValue:
          'Marathon: sixteen weeks, two runs a week, with long runs building to about 2¾ hours and a taper. For people who already run regularly but cannot train more often.',
      });
    case 'trailMarathon':
      return t('recordActivity.program.trailMarathonDescription', {
        defaultValue:
          'Trail marathon: fourteen weeks, three runs a week, with hill repeats and a hike-run long run building to three hours. For when you already run on roads.',
      });
    case 'trail50k':
      return t('recordActivity.program.trail50kDescription', {
        defaultValue:
          'Trail 50K: sixteen weeks, three runs a week, with hill repeats and a hike-run long run building to four hours. For when you have finished a marathon.',
      });
    case 'fiftyK':
      return t('recordActivity.program.fiftyKDescription', {
        defaultValue:
          '50K: sixteen weeks, three runs a week, with long runs building to four hours and a taper. For when you have finished a marathon.',
      });
    case 'fiftyK2':
      return t('recordActivity.program.fiftyK2Description', {
        defaultValue:
          '50K: sixteen weeks, two runs a week, with long runs building to four hours and a taper. For when you have finished a marathon but cannot train more often.',
      });
    case 'hundredK':
      return t('recordActivity.program.hundredKDescription', {
        defaultValue:
          '100K: eighteen weeks, three runs a week, with long runs of up to four hours and a middle run that grows to 2 hours 20 minutes. For when you have finished a 50K.',
      });
    case 'hundredK2':
      return t('recordActivity.program.hundredK2Description', {
        defaultValue:
          '100K: eighteen weeks, two runs a week, with long runs building to four hours and a taper. For when you have finished a 50K but cannot train more often.',
      });
    default:
      return id;
  }
}

/** "Week 3, run 2" for a workout of `program`, without the program's name. */
export function workoutTitle(
  t: TFunction,
  program: RunProgram,
  workout: ProgramWorkout
): string {
  if (program.custom) return customWorkoutTitle(t, workout);
  if (program.activity === 'walk') {
    return t('runPrograms.detail.workoutTitleWalk', {
      week: workout.week + 1,
      walk: workout.day + 1,
      defaultValue: 'Week {{week}}, walk {{walk}}',
    });
  }
  return t('runPrograms.detail.workoutTitle', {
    week: workout.week + 1,
    run: workout.day + 1,
    defaultValue: 'Week {{week}}, run {{run}}',
  });
}

/** "Week 3, run 2" for a program workout. */
export function programWorkoutLabel(
  t: TFunction,
  status: ProgramStatus
): string {
  const workout = status.workout;
  if (!workout) return programTitle(t, status.program);
  if (status.program.custom) {
    return t('recordActivity.program.customWorkoutLabel', {
      name: programTitle(t, status.program),
      workout: customWorkoutTitle(t, workout),
      defaultValue: '{{name}} · {{workout}}',
    });
  }
  if (status.program.activity === 'walk') {
    return t('recordActivity.program.workoutLabelWalk', {
      name: programTitle(t, status.program),
      week: workout.week + 1,
      walk: workout.day + 1,
      defaultValue: '{{name}} · Week {{week}}, walk {{walk}}',
    });
  }
  return t('recordActivity.program.workoutLabel', {
    name: programTitle(t, status.program),
    week: workout.week + 1,
    run: workout.day + 1,
    defaultValue: '{{name}} · Week {{week}}, run {{run}}',
  });
}

/** Every built-in program, with the person's own plan first when that is the one running. */
export function programPickerOptions(
  t: TFunction,
  status: ProgramStatus | null
): PickerOption<string>[] {
  const programOptions: PickerOption<string>[] = RUN_PROGRAMS.map((p) => ({
    label: t('recordActivity.program.optionLabel', {
      name: programName(t, p.id),
      weeks: p.weeks,
      runs: p.workoutsPerWeek,
      defaultValue: '{{name}} · {{weeks}} weeks, {{runs}} workouts a week',
    }),
    value: p.id,
  }));
  // A plan the person wrote is not in the built-in list, but is the one shown.
  if (status?.program.custom) {
    programOptions.unshift({
      label: t('runPrograms.custom.optionLabel', {
        name: programTitle(t, status.program),
        count: status.total,
        formattedCount: formatLocalizedNumber(status.total),
        defaultValue: '{{name}} · {{formattedCount}} workouts',
        defaultValue_one: '{{name}} · {{formattedCount}} workout',
        defaultValue_other: '{{name}} · {{formattedCount}} workouts',
      }),
      value: status.program.id,
    });
  }

  return programOptions;
}

/** The program's workouts, a section per week, for jumping to another one. */
export function workoutPickerSections(
  t: TFunction,
  status: ProgramStatus
): PickerSection<number>[] {
  return Array.from({ length: status.program.weeks }, (_, week) => ({
    title: t('recordActivity.program.weekTitle', {
      week: week + 1,
      defaultValue: 'Week {{week}}',
    }),
    options: status.program.workouts
      .map((workout, index) => ({ workout, index }))
      .filter(({ workout }) => workout.week === week)
      .map(({ workout, index }) => ({
        label: status.program.custom
          ? t('recordActivity.program.pickOptionCustom', {
              title: customWorkoutTitle(t, workout),
              minutes: workoutMinutes(status.program, workout.plan),
              mark: index < status.done ? '✓ ' : '',
              defaultValue: '{{mark}}{{title}} · {{minutes}} min',
            })
          : status.program.activity === 'walk'
            ? t('recordActivity.program.pickOptionWalk', {
                walk: workout.day + 1,
                minutes: workoutMinutes(status.program, workout.plan),
                mark: index < status.done ? '✓ ' : '',
                defaultValue: '{{mark}}Walk {{walk}} · {{minutes}} min',
              })
            : t('recordActivity.program.pickOption', {
                run: workout.day + 1,
                minutes: workoutMinutes(status.program, workout.plan),
                mark: index < status.done ? '✓ ' : '',
                defaultValue: '{{mark}}Run {{run}} · {{minutes}} min',
              }),
        value: index,
      })),
  }));
}

const weekdayLabel = (day: number, style: 'narrow' | 'long'): string =>
  // 2024-01-07 was a Sunday, so day 0 is Sunday.
  new Date(2024, 0, 7 + day).toLocaleDateString(getAppLocale(), {
    weekday: style,
  });

/** When the Diary offers the workout: weekdays (none = every day) and first day. */
export interface RunSchedule {
  days: number[];
  startDay: string | null;
  endDay: string | null;
}

interface Props {
  /** The program picked in the list (the running one, or the one to start). */
  programId: string;
  onChooseProgram: (programId: string) => void;
  /** The latest change to the plan, shown for a couple of weeks. */
  lastAdjustment?: RunProgramAdjustment | null;
  /** Epoch ms "now", from the screen, to judge whether a change is recent. */
  now: number;
  /** Today in the account timezone, for the race day comparison; defaults to the device day. */
  accountToday?: string;
  /** The days the workout shows in the Diary, and the first day it does. */
  schedule: RunSchedule;
  onSchedule: (change: ProgramScheduleChange) => void;
  /** The race day from the person's running goals (YYYY-MM-DD), if one is set. */
  raceDay?: string | null;
  status: ProgramStatus | null;
  loaded: boolean;
  /** Whether today's program workout is the plan chosen for this recording. */
  selected: boolean;
  /** Whether the person is using the program. */
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  onSelect: () => void;
  /** Label for the button that uses today's workout; defaults to the Record screen's wording. */
  startLabel?: string;
  onRestart: () => void;
  /** Fill the start button, for the screen whose main job is starting it. */
  prominent?: boolean;
}

const InlineLink: React.FC<{
  onPress: () => void;
  children: string;
  testID?: string;
}> = ({ onPress, children, testID }) => (
  <Pressable
    accessibilityRole="button"
    testID={testID}
    onPress={onPress}
    hitSlop={8}
    className="mr-5"
    style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
  >
    <Text className="text-text-link text-sm font-semibold">{children}</Text>
  </Pressable>
);

/** Start, follow and leave a multi-week run program. */
const RunProgramCard: React.FC<Props> = ({
  programId,
  onChooseProgram,
  lastAdjustment = null,
  now,
  accountToday,
  schedule,
  onSchedule,
  raceDay = null,
  status,
  loaded,
  selected,
  enabled,
  onToggle,
  onSelect,
  startLabel,
  onRestart,
  prominent = false,
}) => {
  const { t } = useTranslation();
  const prGold = useCSSVariable('--color-pr') as string;
  const calendarRef = useRef<CalendarSheetRef>(null);
  const goalCalendarRef = useRef<CalendarSheetRef>(null);
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

  const programOptions = programPickerOptions(t, status);

  if (!enabled || !status) {
    return (
      <View className="bg-surface rounded-xl p-4 mt-4">
        {header}
        <View className="mt-3">
          <BottomSheetPicker<string>
            value={programId}
            options={programOptions}
            onSelect={onChooseProgram}
            title={t('recordActivity.program.chooseTitle', {
              defaultValue: 'Choose a program',
            })}
          />
        </View>
        <Text className="text-text-secondary text-xs mt-3">
          {status && status.program.id === programId
            ? t('recordActivity.program.paused', {
                name: programTitle(t, status.program),
                done: status.done,
                total: status.total,
                defaultValue:
                  '{{name}} is paused at {{done}} of {{total}} workouts. Switch it on to carry on.',
              })
            : programDescription(t, programId)}
        </Text>
        {(!status || status.program.id !== programId) &&
          (() => {
            const program = findProgram(programId);
            if (!program) return null;
            const outline = programOutline(program);
            return (
              <Text className="text-text-secondary text-xs mt-2">
                {program.activity === 'walk'
                  ? t('recordActivity.program.outlineWalk', {
                      weekOne: outline.firstWeek.join(', '),
                      peak: outline.peakRunMinutes,
                      defaultValue:
                        'Week 1: workouts of {{weekOne}} minutes. Builds to {{peak}} minutes of brisk walking.',
                    })
                  : t('recordActivity.program.outline', {
                      weekOne: outline.firstWeek.join(', '),
                      peak: outline.peakRunMinutes,
                      defaultValue:
                        'Week 1: workouts of {{weekOne}} minutes. Builds to {{peak}} minutes of effort.',
                    })}
              </Text>
            );
          })()}
      </View>
    );
  }

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
  const today = toLocalDateString(new Date(now));
  // Goal dates (the race day) are judged in the account timezone.
  const goalToday = accountToday ?? today;
  const hasStart = !!schedule.startDay;
  const futureStart = hasStart && (schedule.startDay as string) > today;
  const dayLabel = (day: string): string => formatDayLabel(day);
  const fraction = status.total > 0 ? status.done / status.total : 0;
  const left = status.total - status.done;
  const workout = status.workout;
  const minutesToday = workout
    ? workoutMinutes(status.program, workout.plan)
    : 0;
  const focus = workout ? workoutFocus(workout.plan) : null;
  // Today is a workout day when the Diary offers one today: every day with no
  // days picked, else on the picked weekdays, and never before the first day.
  const todayIsWorkoutDay =
    !futureStart &&
    (schedule.days.length === 0 ||
      schedule.days.includes(new Date(now).getDay()));

  if (status.finished) {
    return (
      <View className="bg-surface rounded-2xl p-4 mt-4">
        {header}
        <View className="h-px bg-border-subtle mt-4" />
        <Text className="text-text-primary text-lg font-semibold mt-4">
          {t('recordActivity.program.finished', {
            name: programTitle(t, status.program),
            defaultValue: '{{name}} complete',
          })}
        </Text>
        <Text className="text-text-secondary text-xs mt-1">
          {t('recordActivity.program.finishedHint', {
            defaultValue: 'Well done. You can start it again or move on.',
          })}
        </Text>
        <View className="mt-4">
          <Button variant="outline" onPress={onRestart}>
            {t('recordActivity.program.restart', {
              defaultValue: 'Start again',
            })}
          </Button>
        </View>
      </View>
    );
  }

  return (
    <View
      className="bg-surface rounded-2xl p-4 mt-4 border border-border-subtle"
      testID="run-program-hero"
    >
      <View className="flex-row items-center justify-between pb-3 border-b border-border-subtle">
        <View className="bg-accent-primary/15 rounded-full px-2.5 py-0.5">
          <Text className="text-accent-primary text-xs font-bold uppercase tracking-wider">
            {t('runPrograms.hero.active', { defaultValue: 'Active program' })}
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

      <Text className="text-text-primary text-2xl font-bold mt-3">
        {programTitle(t, status.program)}
      </Text>
      {workout ? (
        <Text className="text-text-secondary text-sm mt-0.5">
          {workoutTitle(t, status.program, workout)}
        </Text>
      ) : null}

      <View className="bg-raised rounded-xl p-3.5 mt-3.5 border border-border-subtle">
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-center">
            <View className="w-1.5 h-1.5 rounded-full bg-accent-primary mr-1.5" />
            <Text className="text-accent-primary text-xs font-bold uppercase tracking-wider">
              {todayIsWorkoutDay
                ? t('runPrograms.hero.today', {
                    defaultValue: "Today's workout",
                  })
                : t('runPrograms.hero.next', { defaultValue: 'Next workout' })}
            </Text>
          </View>
          {workout ? (
            <Text className="text-text-muted text-xs">
              {t('runPrograms.hero.weekOf', {
                week: workout.week + 1,
                weeks: status.program.weeks,
                defaultValue: 'Week {{week}} of {{weeks}}',
              })}
            </Text>
          ) : null}
        </View>
        <View className="flex-row py-2 border-y border-border-subtle">
          <View
            className="flex-1 items-center"
            testID="run-program-stat-duration"
          >
            <Text className="text-text-muted text-xs">
              {t('runPrograms.hero.duration', { defaultValue: 'Duration' })}
            </Text>
            <Text className="text-text-primary text-lg font-bold mt-0.5">
              {t('runPrograms.hero.minutes', {
                minutes: formatLocalizedNumber(minutesToday),
                defaultValue: '{{minutes}} min',
              })}
            </Text>
          </View>
          <View
            className="flex-1 items-center border-x border-border-subtle"
            testID="run-program-stat-done"
          >
            <Text className="text-text-muted text-xs">
              {t('runPrograms.hero.done', { defaultValue: 'Completed' })}
            </Text>
            <Text className="text-text-primary text-lg font-bold mt-0.5">
              {t('runPrograms.hero.doneOf', {
                done: formatLocalizedNumber(status.done),
                total: formatLocalizedNumber(status.total),
                defaultValue: '{{done}} / {{total}}',
              })}
            </Text>
          </View>
          <View className="flex-1 items-center" testID="run-program-stat-focus">
            <Text className="text-text-muted text-xs">
              {t('runPrograms.hero.effort', { defaultValue: 'Effort' })}
            </Text>
            {focus ? (
              <>
                <Text className="text-sm font-bold mt-1 text-exercise">
                  {t('runPrograms.hero.zone', {
                    zone: focus.zone,
                    defaultValue: 'Zone {{zone}}',
                  })}
                </Text>
                <Text
                  className="text-text-muted text-xs text-center"
                  numberOfLines={1}
                >
                  {workoutFocusLabel(t, focus.focus)}
                </Text>
              </>
            ) : null}
          </View>
        </View>
        <View className="mt-3">
          <View className="flex-row items-center justify-between mb-1.5">
            <Text className="text-text-secondary text-xs font-medium">
              {t('runPrograms.hero.completion', {
                defaultValue: 'Program completion',
              })}
            </Text>
            <Text
              className="text-accent-primary text-xs font-bold"
              testID="run-program-completion"
            >
              {formatLocalizedNumber(Math.floor(fraction * 100) / 100, {
                style: 'percent',
              })}{' '}
              <Text className="text-text-muted font-normal">
                {t('runPrograms.hero.left', {
                  count: left,
                  defaultValue: '({{count}} left)',
                  defaultValue_one: '({{count}} left)',
                  defaultValue_other: '({{count}} left)',
                })}
              </Text>
            </Text>
          </View>
          <View className="h-2 rounded-full bg-progress-track overflow-hidden">
            <View
              className="h-2 rounded-full bg-accent-primary"
              style={{ width: `${Math.round(fraction * 100)}%` }}
            />
          </View>
        </View>
      </View>

      <ZoneCheckNote program={status.program} workout={status.workout} />
      {recentChange ? (
        <View
          className="mt-3 p-3 bg-raised rounded-xl border border-border-subtle flex-row"
          testID="run-program-recent-change"
        >
          <View className="mr-2.5 mt-0.5">
            <Icon name="info-circle" size={16} color={prGold} />
          </View>
          <Text className="text-text-secondary text-xs flex-1">
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
        </View>
      ) : null}
      <View className="mt-4">
        <Button
          variant={selected || prominent ? 'primary' : 'outline'}
          onPress={onSelect}
        >
          {selected
            ? t('recordActivity.program.using', {
                defaultValue: 'Using this workout',
              })
            : (startLabel ??
              t('recordActivity.program.doThis', {
                defaultValue: 'Do this workout',
              }))}
        </Button>
      </View>

      <View className="mt-5 pt-4 border-t border-border-subtle">
        <View className="flex-row items-center justify-between">
          <Text className="text-text-primary text-sm font-semibold">
            {t('recordActivity.program.diaryDays', {
              defaultValue: 'Days in your Diary',
            })}
          </Text>
          <Text className="text-text-muted text-xs">
            {schedule.days.length > 0
              ? t('runPrograms.hero.daysAWeek', {
                  count: schedule.days.length,
                  defaultValue: '{{count}} days a week',
                  defaultValue_one: '{{count}} day a week',
                  defaultValue_other: '{{count}} days a week',
                })
              : t('runPrograms.hero.everyDay', { defaultValue: 'Every day' })}
          </Text>
        </View>
        <View className="flex-row justify-between mt-2">
          {Array.from({ length: 7 }, (_, day) => {
            const on = schedule.days.includes(day);
            return (
              <TouchableOpacity
                key={day}
                accessibilityRole="button"
                accessibilityLabel={weekdayLabel(day, 'long')}
                accessibilityState={{ selected: on }}
                onPress={() => onSchedule({ toggleDay: day })}
                className={`w-10 h-10 rounded-full items-center justify-center ${
                  on
                    ? 'bg-accent-primary'
                    : 'bg-raised border border-border-subtle'
                }`}
              >
                <Text
                  className={`text-xs ${
                    on
                      ? 'text-white font-bold'
                      : 'text-text-muted font-semibold'
                  }`}
                >
                  {weekdayLabel(day, 'narrow')}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text className="text-text-muted text-xs mt-2">
          {schedule.days.length > 0
            ? t('recordActivity.program.diaryDaysSet', {
                defaultValue:
                  'The Diary shows the workout on these days. A workout you miss stays due.',
              })
            : t('recordActivity.program.diaryDaysHint', {
                defaultValue:
                  'Pick the days you plan to train, or leave them empty to see the workout every day.',
              })}
        </Text>

        <View className="mt-3.5 p-3 bg-raised rounded-xl border border-border-subtle">
          <Text className="text-text-muted text-xs font-medium">
            {t('recordActivity.program.startDay', {
              defaultValue: 'First workout',
            })}
          </Text>
          <Text className="text-text-primary text-sm mt-0.5">
            {futureStart
              ? t('recordActivity.program.startDaySet', {
                  date: dayLabel(schedule.startDay as string),
                  defaultValue:
                    'Starts {{date}}. Nothing shows in the Diary before then.',
                })
              : hasStart
                ? t('recordActivity.program.startDayPast', {
                    date: dayLabel(schedule.startDay as string),
                    defaultValue:
                      'Started {{date}}. Your next workout is scheduled from today.',
                  })
                : t('recordActivity.program.startDayToday', {
                    date: dayLabel(today),
                    defaultValue:
                      'Starts today, {{date}}. Pick a later date if you want to begin then.',
                  })}
          </Text>
          <View className="flex-row mt-2">
            <InlineLink onPress={() => calendarRef.current?.present()}>
              {t('recordActivity.program.startChange', {
                defaultValue: 'Change start date',
              })}
            </InlineLink>
            {hasStart ? (
              <InlineLink onPress={() => onSchedule({ startDay: null })}>
                {t('recordActivity.program.startClear', {
                  defaultValue: 'Start today',
                })}
              </InlineLink>
            ) : null}
          </View>
        </View>

        <View className="mt-2 p-3 bg-raised rounded-xl border border-border-subtle">
          <Text className="text-text-muted text-xs font-medium">
            {t('recordActivity.program.goalDay', {
              defaultValue: 'Goal date',
            })}
          </Text>
          <Text className="text-text-primary text-sm mt-0.5">
            {schedule.endDay
              ? t('recordActivity.program.goalDaySet', {
                  date: dayLabel(schedule.endDay),
                  defaultValue:
                    'Nothing is scheduled after {{date}}. The schedule below says whether the program fits.',
                })
              : t('recordActivity.program.goalDayHint', {
                  defaultValue:
                    'Optional, for example a race day. The schedule below says whether the program fits before it.',
                })}
          </Text>
          <View className="flex-row flex-wrap mt-2">
            <InlineLink onPress={() => goalCalendarRef.current?.present()}>
              {schedule.endDay
                ? t('recordActivity.program.goalChange', {
                    defaultValue: 'Change goal date',
                  })
                : t('recordActivity.program.goalPick', {
                    defaultValue: 'Set a goal date',
                  })}
            </InlineLink>
            {raceDay &&
            raceDay > goalToday &&
            (!schedule.startDay || raceDay >= schedule.startDay) &&
            schedule.endDay !== raceDay ? (
              <InlineLink
                testID="run-program-use-race-day"
                onPress={() => onSchedule({ endDay: raceDay })}
              >
                {t('recordActivity.program.goalUseRaceDay', {
                  date: dayLabel(raceDay),
                  defaultValue: 'Use race day ({{date}})',
                })}
              </InlineLink>
            ) : null}
            {schedule.endDay ? (
              <InlineLink onPress={() => onSchedule({ endDay: null })}>
                {t('recordActivity.program.goalClear', {
                  defaultValue: 'Clear',
                })}
              </InlineLink>
            ) : null}
          </View>
        </View>
      </View>
      <CalendarSheet
        ref={goalCalendarRef}
        selectedDate={schedule.endDay ?? addDays(goalToday, 28)}
        onSelectDate={(day) =>
          onSchedule({ endDay: day <= goalToday ? null : day })
        }
      />
      <CalendarSheet
        ref={calendarRef}
        selectedDate={schedule.startDay ?? today}
        onSelectDate={(day) => onSchedule({ startDay: day })}
      />
    </View>
  );
};

export default RunProgramCard;
