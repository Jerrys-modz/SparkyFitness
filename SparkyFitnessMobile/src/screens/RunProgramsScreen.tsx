import React, { useCallback, useRef, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import {
  customProgramId,
  findProgram,
  programOutline,
  RUN_PROGRAMS,
  type CustomRunProgramResponse,
} from '@workspace/shared';
import RunProgramCard, {
  programDescription,
  programName,
} from '../components/recording/RunProgramCard';
import RunProgramCalendar from '../components/recording/RunProgramCalendar';
import RunProgramGuide, {
  programStructure,
} from '../components/recording/RunProgramGuide';
import Button from '../components/ui/Button';
import CalendarSheet, {
  type CalendarSheetRef,
} from '../components/CalendarSheet';
import { useScreenHeader } from '../hooks/useScreenHeader';
import {
  restartProgram,
  setProgramEnabled,
  setProgramSchedule,
  setProgramPosition,
  skipProgramWorkout,
  startProgram,
  useCustomRunPrograms,
  useRunProgram,
} from '../services/runProgramService';
import { addLog } from '../services/LogService';
import { formatLocalizedNumber } from '../localization';
import type { RootStackScreenProps } from '../types/navigation';
import { addDays, toLocalDateString } from '../utils/dateUtils';

type Props = RootStackScreenProps<'RunPrograms'>;

/**
 * Training programs: browse the programs, start one, and follow it. Today's
 * workout is done from Record Activity (or the Diary's card on run days).
 */
const RunProgramsScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { status, enabled, lastAdjustment, schedule, doneDay, loaded } =
    useRunProgram();
  const [now] = useState(() => Date.now());
  const today = toLocalDateString(new Date(now));
  const [chosenId, setChosenId] = useState('beginner5k');
  const storedId = status?.program.id;
  const startCalendarRef = useRef<CalendarSheetRef>(null);
  const [startingId, setStartingId] = useState<string | null>(null);
  const { programs: customPrograms } = useCustomRunPrograms();

  const header = useScreenHeader({
    title: t('screens.runPrograms', { defaultValue: 'Training programs' }),
    left: { kind: 'back' },
  });

  // A program change goes to the server, so it can fail (offline).
  const change = useCallback(
    (action: () => Promise<void>) => {
      void action().catch((error: unknown) => {
        addLog(
          `[Run Program] Could not update the program: ${error}`,
          'WARNING'
        );
        Toast.show({
          type: 'error',
          text1: t('recordActivity.program.errors.update', {
            defaultValue: 'Could not update your program',
          }),
          text2: t('common.tryAgain', { defaultValue: 'Please try again.' }),
        });
      });
    },
    [t]
  );

  // Starting asks when the first workout is: today, or a date from the calendar.
  const nameOf = (id: string): string =>
    customPrograms.find((p) => customProgramId(p.id) === id)?.name ??
    programName(t, id);

  const askStart = (id: string) => {
    Alert.alert(
      t('runPrograms.startWhenTitle', {
        name: nameOf(id),
        defaultValue: 'Start {{name}}',
      }),
      t('runPrograms.startWhenMessage', {
        defaultValue: 'When is your first workout?',
      }),
      [
        {
          text: t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
        {
          text: t('runPrograms.startPickDate', {
            defaultValue: 'Pick a date',
          }),
          onPress: () => {
            setStartingId(id);
            startCalendarRef.current?.present();
          },
        },
        {
          text: t('runPrograms.startToday', { defaultValue: 'Start today' }),
          onPress: () => change(() => startProgram(id, null)),
        },
      ]
    );
  };

  const chooseProgram = (id: string) => {
    if (id === storedId) {
      setChosenId(id);
      return;
    }
    // Switching a stored program, running or paused, starts the new one from
    // week 1 (and switches it on), so it is always confirmed.
    Alert.alert(
      t('recordActivity.program.switchTitle', {
        name: nameOf(id),
        defaultValue: 'Switch to {{name}}?',
      }),
      t('recordActivity.program.switchMessage', {
        defaultValue:
          'You will start the new program at week 1. Your place in the current one is not kept.',
      }),
      [
        {
          text: t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
        {
          text: t('recordActivity.program.switchConfirm', {
            defaultValue: 'Switch',
          }),
          onPress: () =>
            change(async () => {
              await startProgram(id);
              setChosenId(id);
            }),
        },
      ]
    );
  };

  const yourPlans = (
    <View className="mt-6" testID="your-plans">
      <Text className="text-text-primary text-base font-semibold">
        {t('runPrograms.custom.title', { defaultValue: 'Your plans' })}
      </Text>
      <Text className="text-text-secondary text-xs mt-1">
        {t('runPrograms.custom.intro', {
          defaultValue:
            'Write your own plan as a list of workouts, each made of timed steps, and follow it like any program.',
        })}
      </Text>
      {customPrograms.map((plan: CustomRunProgramResponse) => (
        <View
          key={plan.id}
          className="bg-surface rounded-xl p-4 mt-3"
          testID={`custom-plan-${plan.id}`}
        >
          <Text className="text-text-primary text-base font-semibold">
            {plan.name}
          </Text>
          <Text className="text-text-muted text-xs mt-0.5">
            {t('runPrograms.custom.workoutCount', {
              count: plan.workouts.length,
              formattedCount: formatLocalizedNumber(plan.workouts.length),
              defaultValue: '{{formattedCount}} workouts',
              defaultValue_one: '{{formattedCount}} workout',
              defaultValue_other: '{{formattedCount}} workouts',
            })}
          </Text>
          <View className="flex-row mt-3">
            <View className="flex-1 mr-2">
              <Button
                variant="outline"
                onPress={() => askStart(customProgramId(plan.id))}
                testID={`custom-plan-start-${plan.id}`}
              >
                {storedId === customProgramId(plan.id)
                  ? t('runPrograms.custom.restart', {
                      defaultValue: 'Start again',
                    })
                  : t('runPrograms.start', { defaultValue: 'Start program' })}
              </Button>
            </View>
            <View className="flex-1">
              <Button
                variant="outline"
                onPress={() =>
                  navigation.navigate('RunProgramEdit', { id: plan.id })
                }
                testID={`custom-plan-edit-${plan.id}`}
              >
                {t('runPrograms.custom.edit', { defaultValue: 'Edit' })}
              </Button>
            </View>
          </View>
        </View>
      ))}
      <View className="mt-3">
        <Button
          variant="outline"
          onPress={() => navigation.navigate('RunProgramEdit')}
          testID="custom-plan-new"
        >
          {t('runPrograms.custom.create', { defaultValue: 'Create a plan' })}
        </Button>
      </View>
    </View>
  );

  let body: React.ReactNode = null;
  if (loaded && status) {
    body = (
      <>
        <RunProgramCard
          programId={storedId ?? chosenId}
          onChooseProgram={chooseProgram}
          lastAdjustment={lastAdjustment}
          now={now}
          schedule={schedule}
          onSchedule={(next) => change(() => setProgramSchedule(next))}
          onPickWorkout={(index) => change(() => setProgramPosition(index))}
          status={status}
          loaded={loaded}
          selected={false}
          enabled={enabled}
          onToggle={(on) =>
            change(() => setProgramEnabled(on, storedId ?? chosenId))
          }
          onSelect={() =>
            navigation.navigate('RecordActivity', { programWorkout: true })
          }
          startLabel={t('runPrograms.startWorkout', {
            defaultValue: "Start today's workout",
          })}
          onRestart={() => change(restartProgram)}
          onSkip={() => change(skipProgramWorkout)}
        />
        <View className="mt-4">
          <Button
            variant="outline"
            onPress={() => navigation.navigate('RunProgramCalendar')}
          >
            {t('runPrograms.openCalendar', {
              defaultValue: 'Open the program calendar',
            })}
          </Button>
        </View>
        <RunProgramCalendar
          status={status}
          schedule={schedule}
          doneDay={doneDay}
          today={today}
        />
        <RunProgramGuide
          programId={status.program.custom ? undefined : storedId}
        />
        {status.program.custom ? null : (
          <View className="mt-4">
            <Button
              variant="outline"
              onPress={() =>
                navigation.navigate('RunProgramEdit', {
                  fromProgramId: status.program.id,
                })
              }
              testID="customize-current"
            >
              {t('runPrograms.custom.customize', {
                defaultValue: 'Customize this program',
              })}
            </Button>
          </View>
        )}
        {yourPlans}
      </>
    );
  } else if (loaded) {
    body = (
      <>
        <Text className="text-text-secondary text-sm">
          {t('runPrograms.intro', {
            defaultValue:
              'Follow a plan that builds up week by week. Pick a program to see what it involves, then start it when you are ready.',
          })}
        </Text>
        <RunProgramGuide defaultOpen />
        {RUN_PROGRAMS.map((program) => {
          const outline = programOutline(findProgram(program.id)!);
          return (
            <View
              key={program.id}
              className="bg-surface rounded-xl p-4 mt-4"
              testID={`run-program-${program.id}`}
            >
              <Text className="text-text-primary text-base font-semibold">
                {programName(t, program.id)}
              </Text>
              <Text className="text-text-muted text-xs mt-0.5">
                {t('runPrograms.weeksRuns', {
                  weeks: program.weeks,
                  runs: program.workoutsPerWeek,
                  defaultValue: '{{weeks}} weeks, {{runs}} workouts a week',
                })}
              </Text>
              <Text className="text-text-secondary text-sm mt-2">
                {programDescription(t, program.id)}
              </Text>
              <Text className="text-text-secondary text-sm mt-2">
                {programStructure(t, program.id)}
              </Text>
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
                        'Week 1: workouts of {{weekOne}} minutes. Builds to {{peak}} minutes of running.',
                    })}
              </Text>
              <View className="mt-3">
                <Button variant="outline" onPress={() => askStart(program.id)}>
                  {t('runPrograms.start', { defaultValue: 'Start program' })}
                </Button>
              </View>
              <View className="mt-2">
                <Button
                  variant="ghost"
                  onPress={() =>
                    navigation.navigate('RunProgramEdit', {
                      fromProgramId: program.id,
                    })
                  }
                  testID={`customize-${program.id}`}
                >
                  {t('runPrograms.custom.customize', {
                    defaultValue: 'Customize this program',
                  })}
                </Button>
              </View>
            </View>
          );
        })}
        {yourPlans}
      </>
    );
  }

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
        {body}
      </ScrollView>
      <CalendarSheet
        ref={startCalendarRef}
        selectedDate={addDays(today, 1)}
        onSelectDate={(day) => {
          const id = startingId;
          if (id) change(() => startProgram(id, day <= today ? null : day));
        }}
      />
    </>
  );
};

export default RunProgramsScreen;
