import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  ActivityIndicator,
  Linking,
  Platform,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';

import Button from '../components/ui/Button';
import RecordingVoiceCard from '../components/recording/RecordingVoiceCard';
import Switch from '../components/ui/Switch';
import SegmentedControl from '../components/SegmentedControl';
import RunProgramSelect from '../components/recording/RunProgramSelect';
import { programWorkoutLabel } from '../components/recording/RunProgramCard';
import IntervalCard from '../components/recording/IntervalCard';
import IntervalSetup, {
  DEFAULT_CUSTOM_INTERVALS,
  type IntervalChoice,
} from '../components/recording/IntervalSetup';
import RouteMap from '../components/exerciseStats/RouteMap';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { invalidateExerciseCache } from '../hooks/invalidateExerciseCache';
import { usePreferences } from '../hooks/usePreferences';
import { useRecordingHeartRate } from '../stores/liveHeartRateStore';
import { notificationText } from '../utils/recordingNotification';
import { formatLocalizedNumber, getAppLocale } from '../localization';
import {
  RecordingPermissionError,
  discardRecording,
  elapsedSeconds,
  finishRecording,
  COUNTDOWN_CHOICES,
  getRecordingPreferences,
  hydrate,
  markLap,
  pauseRecording,
  resumeRecording,
  setCountdownPreference,
  setRecordingPreference,
  startRecording,
  tickIntervals,
  useGpsRecording,
} from '../services/gpsRecordingService';
import {
  buildIntervalPlan,
  INTERVAL_PRESETS,
  intervalPosition,
  lastStepStarted,
  type IntervalOptions,
  type IntervalPlan,
} from '@workspace/shared';
import {
  completeProgramWorkout,
  useRunProgram,
} from '../services/runProgramService';
import { reconcileRunReminders } from '../services/runReminderService';
import { saveRecordedActivity } from '../services/gpsRecordingSave';
import { fireSelectionHaptic } from '../services/haptics';
import { addLog } from '../services/LogService';
import {
  beginRecordingCues,
  speakRecordingCue,
  stopRecordingCues,
} from '../services/recordingCues';
import {
  computeLaps,
  computeSplits,
  currentPaceSecondsPerUnit,
  formatClock,
  formatPace,
  METERS_PER_KM,
  METERS_PER_MILE,
  paceSecondsPerUnit,
  splitBars,
  summarizeRecording,
  type RecordingActivity,
} from '../utils/gpsRecording';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'RecordActivity'>;

const FEET_PER_METER = 3.28084;

/** One split or lap: label, pace, and a bar that is longer the faster it was. */
const SplitRow: React.FC<{
  label: string;
  detail?: string;
  pace: string;
  fraction: number;
  fastest: boolean;
  fastestLabel: string;
}> = ({ label, detail, pace, fraction, fastest, fastestLabel }) => (
  <View className="py-1">
    <View className="flex-row justify-between">
      <Text className="text-text-secondary text-sm">
        {label}
        {detail ? ` · ${detail}` : ''}
      </Text>
      <Text className="text-text-primary text-sm font-semibold">
        {fastest ? `${fastestLabel} · ` : ''}
        {pace}
      </Text>
    </View>
    <View className="h-1.5 rounded-full bg-form-disabled mt-1">
      <View
        className={`h-1.5 rounded-full ${
          fastest ? 'bg-accent-primary' : 'bg-text-muted'
        }`}
        style={{ width: `${Math.round(fraction * 100)}%` }}
      />
    </View>
  </View>
);

const Stat: React.FC<{ label: string; value: string; unit?: string }> = ({
  label,
  value,
  unit,
}) => (
  <View className="flex-1 bg-surface rounded-xl p-3 mx-1 items-center">
    <Text className="text-text-muted text-xs mb-1">{label}</Text>
    <Text className="text-text-primary text-xl font-bold">{value}</Text>
    {unit ? <Text className="text-text-muted text-xs">{unit}</Text> : null}
  </View>
);

const RecordActivityScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { preferences } = usePreferences();
  const distanceUnit =
    (preferences?.default_distance_unit as 'km' | 'miles') ?? 'km';
  const unitMeters = distanceUnit === 'miles' ? METERS_PER_MILE : METERS_PER_KM;
  const unitLabel =
    distanceUnit === 'miles'
      ? t('recordActivity.unitMi', { defaultValue: 'mi' })
      : t('recordActivity.unitKm', { defaultValue: 'km' });

  const { session, points } = useGpsRecording();
  const heartRate = useRecordingHeartRate(session?.id ?? null);
  const [activity, setActivity] = useState<RecordingActivity>('run');
  const [busy, setBusy] = useState(false);
  const [autoPause, setAutoPause] = useState(true);
  const [audioCues, setAudioCues] = useState(false);
  const [countdownSeconds, setCountdownSeconds] = useState(0);
  const [intervalChoice, setIntervalChoice] = useState<IntervalChoice>('off');
  const [customIntervals, setCustomIntervals] = useState<IntervalOptions>(
    DEFAULT_CUSTOM_INTERVALS
  );
  const {
    status: storedProgram,
    enabled: programEnabled,
    loaded: programLoaded,
  } = useRunProgram();
  // The program only drives the screen while the person has it switched on.
  const programStatus = programEnabled ? storedProgram : null;
  const programWorkout = programStatus?.workout ?? null;
  // A person on a program usually wants today's workout, so it starts chosen
  // (once; they can change it, and it is not re-chosen after).
  const programPreselected = useRef(false);
  useEffect(() => {
    if (programPreselected.current || !programLoaded) return;
    programPreselected.current = true;
    if (programWorkout) setIntervalChoice('program');
  }, [programLoaded, programWorkout]);
  // A program that ended or was left while it was chosen.
  useEffect(() => {
    if (intervalChoice === 'program' && programLoaded && !programWorkout) {
      setIntervalChoice('off');
    }
  }, [intervalChoice, programLoaded, programWorkout]);
  const intervalPlan = useMemo<IntervalPlan | undefined>(() => {
    if (intervalChoice === 'off') return undefined;
    if (intervalChoice === 'program') return programWorkout?.plan;
    if (intervalChoice === 'custom') return buildIntervalPlan(customIntervals);
    const preset = INTERVAL_PRESETS.find((p) => p.id === intervalChoice);
    return preset ? buildIntervalPlan(preset.options) : undefined;
  }, [intervalChoice, customIntervals, programWorkout]);
  // Seconds left before recording begins, or null when no countdown is running.
  const [countdownLeft, setCountdownLeft] = useState<number | null>(null);
  const [permissionProblem, setPermissionProblem] = useState<
    'denied' | 'services-disabled' | null
  >(null);
  const [now, setNow] = useState(() => Date.now());
  // Whether the check for a recording an earlier run left on disk has finished.
  // Until it has, the screen cannot tell "nothing recording" from "not loaded
  // yet", and would show Start for a moment before jumping to a live recording.
  const [ready, setReady] = useState(false);
  // Set when the person taps Start here, so a session that is already there
  // when the screen opens can be told apart from one started on this visit.
  const [startedHere, setStartedHere] = useState(false);

  useScreenHeader({
    title: t('screens.recordActivity', { defaultValue: 'Record Activity' }),
    nativeTitle: t('screens.recordActivity', {
      defaultValue: 'Record Activity',
    }),
    left: { kind: 'back' },
  });

  // Pick up a recording an earlier run left behind (app killed mid-activity).
  useEffect(() => {
    void getRecordingPreferences().then((preferences) => {
      setAutoPause(preferences.autoPause);
      setAudioCues(preferences.audioCues);
      setCountdownSeconds(preferences.countdownSeconds);
    });
  }, []);

  useEffect(() => {
    let active = true;
    void hydrate().finally(() => {
      if (active) setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const isLive = session?.status === 'recording';
  useEffect(() => {
    if (!isLive) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isLive]);

  // Each second, let a timed plan move on to its next step.
  const hasIntervals = Boolean(session?.intervals);
  useEffect(() => {
    if (!isLive || !hasIntervals) return;
    void tickIntervals();
  }, [isLive, hasIntervals, now]);

  const summary = useMemo(() => summarizeRecording(points), [points]);
  const mapPoints = useMemo(
    () =>
      points.map((p) => ({
        t: new Date(p.t).toISOString(),
        lat: p.lat,
        lon: p.lon,
      })),
    [points]
  );
  const splits = useMemo(
    () =>
      session?.status === 'finished' ? computeSplits(points, unitMeters) : [],
    [points, session?.status, unitMeters]
  );
  const lapMarks = session?.laps;
  const laps = useMemo(
    () =>
      session?.status === 'finished' && lapMarks && lapMarks.length > 0
        ? computeLaps(points, lapMarks)
        : [],
    [points, session?.status, lapMarks]
  );
  const splitBarsFor = useMemo(
    () => splitBars(splits, unitMeters),
    [splits, unitMeters]
  );
  const lapBarsFor = useMemo(
    () => splitBars(laps, unitMeters),
    [laps, unitMeters]
  );

  const run = useCallback(
    async (work: () => Promise<void>, failure: string) => {
      setBusy(true);
      try {
        await work();
      } catch (error) {
        if (error instanceof RecordingPermissionError) {
          setPermissionProblem(error.reason);
        } else {
          addLog(`[GPS Recording] ${failure}: ${error}`, 'ERROR');
          Toast.show({
            type: 'error',
            text1: failure,
            text2: t('common.tryAgain', { defaultValue: 'Please try again.' }),
          });
        }
      } finally {
        setBusy(false);
      }
    },
    [t]
  );

  const handleStart = useCallback(
    () =>
      run(
        async () => {
          setPermissionProblem(null);
          // Before the await: the session publishes inside startRecording, and
          // the "already recording" notice must not flash for one render.
          setStartedHere(true);
          await startRecording({
            activity,
            autoPause,
            audioCues: audioCues
              ? distanceUnit === 'miles'
                ? 'miles'
                : 'km'
              : undefined,
            intervals: intervalPlan,
            program:
              intervalChoice === 'program' && programStatus && intervalPlan
                ? { id: programStatus.program.id, index: programStatus.done }
                : undefined,
            notification: notificationText(t, activity),
          });
        },
        t('recordActivity.errors.start', {
          defaultValue: 'Could not start recording',
        })
      ),
    [
      activity,
      audioCues,
      autoPause,
      distanceUnit,
      intervalChoice,
      intervalPlan,
      programStatus,
      run,
      t,
    ]
  );
  // Counts down once a second, then starts. Each number is felt and, with
  // voice cues on, spoken.
  useEffect(() => {
    if (countdownLeft === null) return;
    if (countdownLeft === 0) {
      setCountdownLeft(null);
      void handleStart();
      return;
    }
    fireSelectionHaptic();
    if (audioCues) speakRecordingCue(String(countdownLeft));
    const id = setTimeout(() => setCountdownLeft(countdownLeft - 1), 1000);
    return () => clearTimeout(id);
  }, [countdownLeft, audioCues, handleStart]);

  const handleStartPress = useCallback(() => {
    if (countdownSeconds === 0) {
      void handleStart();
      return;
    }
    setPermissionProblem(null);
    if (audioCues) beginRecordingCues();
    setCountdownLeft(countdownSeconds);
  }, [audioCues, countdownSeconds, handleStart]);

  const cancelCountdown = useCallback(() => {
    setCountdownLeft(null);
    if (audioCues) stopRecordingCues();
  }, [audioCues]);

  const handleResume = useCallback(
    () =>
      run(
        () =>
          resumeRecording(notificationText(t, session?.activity ?? activity)),
        t('recordActivity.errors.resume', {
          defaultValue: 'Could not resume recording',
        })
      ),
    [activity, run, session?.activity, t]
  );

  const handleFinish = useCallback(
    () =>
      run(
        finishRecording,
        t('recordActivity.errors.finish', {
          defaultValue: 'Could not finish recording',
        })
      ),
    [run, t]
  );

  const handleDiscard = useCallback(() => {
    Alert.alert(
      t('recordActivity.discard.title', {
        defaultValue: 'Discard this activity?',
      }),
      t('recordActivity.discard.message', {
        defaultValue: 'The recorded route and stats will be deleted.',
      }),
      [
        {
          text: t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
        {
          text: t('recordActivity.discard.confirm', {
            defaultValue: 'Discard',
          }),
          style: 'destructive',
          onPress: () =>
            void run(
              discardRecording,
              t('recordActivity.errors.discard', {
                defaultValue: 'Could not discard recording',
              })
            ),
        },
      ]
    );
  }, [run, t]);

  const handleSave = useCallback(async () => {
    if (!session) return;
    setBusy(true);
    try {
      const saved = await saveRecordedActivity(session, points, distanceUnit);
      // Ticks a program workout off only if the plan was followed to its last
      // step; a run cut short can be tried again.
      if (session.program && lastStepStarted(session.intervals)) {
        // The activity is already saved, so a failure here only costs the
        // tick: say so and carry on rather than failing the save.
        try {
          await completeProgramWorkout(
            session.program.id,
            session.program.index
          );
          // The last workout ends the program, and with it the reminders.
          void reconcileRunReminders();
        } catch (error) {
          addLog(
            `[Run Program] Could not tick off the workout: ${error}`,
            'WARNING'
          );
        }
      }
      await discardRecording();
      invalidateExerciseCache(queryClient, saved.entryDate);
      Toast.show({
        type: 'success',
        text1: t('recordActivity.saved', { defaultValue: 'Activity saved' }),
      });
      navigation.goBack();
    } catch (error) {
      addLog(`[GPS Recording] Save failed: ${error}`, 'ERROR');
      Toast.show({
        type: 'error',
        text1: t('recordActivity.errors.save', {
          defaultValue: 'Could not save activity',
        }),
        text2: t('recordActivity.errors.saveHint', {
          defaultValue: 'Your recording is kept on this phone. Try again.',
        }),
      });
    } finally {
      setBusy(false);
    }
  }, [distanceUnit, navigation, points, queryClient, session, t]);

  const number = (value: number, digits = 2) =>
    formatLocalizedNumber(value, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });

  const body = (() => {
    if (!ready) {
      return (
        <View
          testID="record-activity-loading"
          className="items-center justify-center py-16"
        >
          <ActivityIndicator />
        </View>
      );
    }
    if (!session && countdownLeft !== null) {
      return (
        <View className="items-center py-16">
          <Text
            className="text-text-primary text-8xl font-bold"
            accessibilityLiveRegion="assertive"
          >
            {countdownLeft}
          </Text>
          <Text className="text-text-secondary text-sm mt-2 mb-8">
            {t('recordActivity.countdown.getReady', {
              defaultValue: 'Get ready',
            })}
          </Text>
          <Button variant="outline" onPress={cancelCountdown}>
            {t('recordActivity.countdown.cancel', { defaultValue: 'Cancel' })}
          </Button>
        </View>
      );
    }
    if (!session) {
      return (
        <>
          <Text className="text-text-secondary text-sm mb-3">
            {t('recordActivity.intro', {
              defaultValue:
                'Record a walk, run or ride with your phone’s GPS. Recording continues with the screen locked.',
            })}
          </Text>
          <SegmentedControl<RecordingActivity>
            segments={[
              {
                key: 'walk',
                label: t('recordActivity.activity.walk', {
                  defaultValue: 'Walk',
                }),
              },
              {
                key: 'run',
                label: t('recordActivity.activity.run', {
                  defaultValue: 'Run',
                }),
              },
              {
                key: 'ride',
                label: t('recordActivity.activity.ride', {
                  defaultValue: 'Ride',
                }),
              },
            ]}
            activeKey={activity}
            onSelect={setActivity}
          />
          <View className="flex-row items-center justify-between bg-surface rounded-xl p-4 mt-4">
            <View className="flex-1 mr-3">
              <Text className="text-text-primary text-sm font-semibold">
                {t('recordActivity.autoPause.title', {
                  defaultValue: 'Auto-pause',
                })}
              </Text>
              <Text className="text-text-secondary text-xs mt-0.5">
                {t('recordActivity.autoPause.description', {
                  defaultValue:
                    'Pauses the clock when you stop and carries on when you move.',
                })}
              </Text>
            </View>
            <Switch
              testID="auto-pause-switch"
              accessibilityLabel={t('recordActivity.autoPause.title', {
                defaultValue: 'Auto-pause',
              })}
              value={autoPause}
              onValueChange={(value) => {
                setAutoPause(value);
                void setRecordingPreference('autoPause', value);
              }}
            />
          </View>
          <View className="flex-row items-center justify-between bg-surface rounded-xl p-4 mt-4">
            <View className="flex-1 mr-3">
              <Text className="text-text-primary text-sm font-semibold">
                {t('recordActivity.audioCues.title', {
                  defaultValue: 'Voice cues',
                })}
              </Text>
              <Text className="text-text-secondary text-xs mt-0.5">
                {t('recordActivity.audioCues.description', {
                  defaultValue:
                    'Speaks your time at each kilometer or mile, and when you pause or resume.',
                })}
              </Text>
            </View>
            <Switch
              testID="audio-cues-switch"
              accessibilityLabel={t('recordActivity.audioCues.title', {
                defaultValue: 'Voice cues',
              })}
              value={audioCues}
              onValueChange={(value) => {
                setAudioCues(value);
                void setRecordingPreference('audioCues', value);
              }}
            />
          </View>
          {audioCues && <RecordingVoiceCard />}
          <View className="bg-surface rounded-xl p-4 mt-4">
            <Text className="text-text-primary text-sm font-semibold mb-2">
              {t('recordActivity.countdown.title', {
                defaultValue: 'Start countdown',
              })}
            </Text>
            <SegmentedControl<string>
              segments={COUNTDOWN_CHOICES.map((seconds) => ({
                key: String(seconds),
                label:
                  seconds === 0
                    ? t('recordActivity.countdown.off', {
                        defaultValue: 'Off',
                      })
                    : t('recordActivity.countdown.seconds', {
                        seconds,
                        defaultValue: '{{seconds}} s',
                      }),
              }))}
              activeKey={String(countdownSeconds)}
              onSelect={(key) => {
                const seconds = Number(key);
                setCountdownSeconds(seconds);
                void setCountdownPreference(seconds);
              }}
            />
          </View>
          <RunProgramSelect
            status={programStatus}
            loaded={programLoaded}
            selected={intervalChoice === 'program'}
            onSelect={() => {
              setActivity('run');
              setIntervalChoice('program');
            }}
            onManage={() => navigation.navigate('RunPrograms')}
          />
          <IntervalSetup
            programLabel={
              programStatus?.workout
                ? programWorkoutLabel(t, programStatus)
                : undefined
            }
            choice={intervalChoice}
            onChoice={setIntervalChoice}
            custom={customIntervals}
            onCustom={setCustomIntervals}
          />
          {permissionProblem ? (
            <View className="bg-surface rounded-xl p-4 mt-4">
              <Text className="text-text-primary text-sm mb-3">
                {permissionProblem === 'denied'
                  ? t('recordActivity.permission.denied', {
                      defaultValue:
                        'SparkyFitness needs location access to record your route. You can allow it in Settings.',
                    })
                  : t('recordActivity.permission.servicesOff', {
                      defaultValue:
                        'Location services are turned off. Turn them on in Settings to record.',
                    })}
              </Text>
              <Button
                variant="outline"
                onPress={() => void Linking.openSettings()}
              >
                {t('recordActivity.permission.openSettings', {
                  defaultValue: 'Open Settings',
                })}
              </Button>
            </View>
          ) : null}
          {Platform.OS === 'android' ? (
            <View className="bg-surface rounded-xl p-4 mt-4">
              <Text className="text-text-primary text-sm font-semibold mb-1">
                {t('recordActivity.androidTips.title', {
                  defaultValue: 'Recording with the screen off',
                })}
              </Text>
              <Text className="text-text-secondary text-sm mb-3">
                {t('recordActivity.androidTips.body', {
                  defaultValue:
                    'Some phones stop apps that run in the background. If a recording has gaps, set SparkyFitness to “Unrestricted” in the phone’s battery settings.',
                })}
              </Text>
              <Button
                variant="link"
                onPress={() =>
                  void Linking.openURL('https://dontkillmyapp.com')
                }
              >
                {t('recordActivity.androidTips.link', {
                  defaultValue: 'Phone-specific steps',
                })}
              </Button>
            </View>
          ) : null}
          <Button className="mt-6" loading={busy} onPress={handleStartPress}>
            {t('recordActivity.start', { defaultValue: 'Start' })}
          </Button>
        </>
      );
    }

    const active = elapsedSeconds(session, now);
    const distance = summary.distanceMeters;
    const avgPace = paceSecondsPerUnit(
      distance,
      summary.activeSeconds,
      unitMeters
    );
    const currentPace = currentPaceSecondsPerUnit(points, unitMeters);
    const elevation =
      distanceUnit === 'miles'
        ? summary.elevationGainMeters * FEET_PER_METER
        : summary.elevationGainMeters;
    const elevationUnit =
      distanceUnit === 'miles'
        ? t('recordActivity.unitFt', { defaultValue: 'ft' })
        : t('recordActivity.unitM', { defaultValue: 'm' });
    const paceUnit = t('recordActivity.perUnit', {
      defaultValue: '/{{unit}}',
      unit: unitLabel,
    });
    const finished = session.status === 'finished';
    const intervalPos = session.intervals
      ? intervalPosition(session.intervals.plan, active)
      : null;
    // Still running from before this visit (or from earlier in it): say when it
    // began so a leftover recording is never mistaken for a new one.
    const carriedOver = !startedHere && !finished;

    return (
      <>
        {carriedOver ? (
          <View className="bg-surface rounded-xl p-4 mb-4">
            <Text className="text-text-primary text-sm">
              {t('recordActivity.carriedOver', {
                defaultValue:
                  'This recording started at {{time}} and was still running on this phone.',
                time: new Date(session.startedAt).toLocaleTimeString(
                  getAppLocale(),
                  { hour: 'numeric', minute: '2-digit' }
                ),
              })}
            </Text>
          </View>
        ) : null}
        {points.length > 1 ? (
          <View className="mb-4">
            <RouteMap
              points={mapPoints}
              accessibilityLabel={t('recordActivity.routeA11y', {
                defaultValue: 'Map of your route so far',
              })}
            />
          </View>
        ) : (
          <View className="bg-surface rounded-xl p-4 mb-4 items-center">
            <ActivityIndicator />
            <Text className="text-text-muted text-sm mt-2">
              {t('recordActivity.waitingForGps', {
                defaultValue: 'Waiting for a GPS fix…',
              })}
            </Text>
          </View>
        )}
        <View className="items-center mb-4">
          <Text className="text-text-muted text-xs">
            {session.status === 'paused'
              ? session.autoPaused
                ? t('recordActivity.status.autoPaused', {
                    defaultValue: 'Auto-paused',
                  })
                : t('recordActivity.status.paused', { defaultValue: 'Paused' })
              : finished
                ? t('recordActivity.status.finished', {
                    defaultValue: 'Finished',
                  })
                : t('recordActivity.time', { defaultValue: 'Time' })}
          </Text>
          <Text
            className="text-text-primary text-5xl font-bold"
            accessibilityLabel={formatClock(active)}
          >
            {formatClock(active)}
          </Text>
        </View>
        {session.intervals && intervalPos && !finished ? (
          <IntervalCard plan={session.intervals.plan} position={intervalPos} />
        ) : null}
        <View className="flex-row mb-3">
          <Stat
            label={t('recordActivity.distance', { defaultValue: 'Distance' })}
            value={number(distance / unitMeters)}
            unit={unitLabel}
          />
          <Stat
            label={t('recordActivity.avgPace', { defaultValue: 'Avg pace' })}
            value={formatPace(avgPace)}
            unit={paceUnit}
          />
        </View>
        <View className="flex-row mb-4">
          {finished ? (
            <Stat
              label={t('recordActivity.elevationLoss', {
                defaultValue: 'Elevation loss',
              })}
              value={number(
                distanceUnit === 'miles'
                  ? summary.elevationLossMeters * FEET_PER_METER
                  : summary.elevationLossMeters,
                0
              )}
              unit={elevationUnit}
            />
          ) : (
            <Stat
              label={t('recordActivity.currentPace', { defaultValue: 'Pace' })}
              value={formatPace(currentPace)}
              unit={paceUnit}
            />
          )}
          <Stat
            label={t('recordActivity.elevationGain', {
              defaultValue: 'Elevation gain',
            })}
            value={number(elevation, 0)}
            unit={elevationUnit}
          />
        </View>
        {heartRate != null && !finished ? (
          <View className="flex-row mb-4">
            <Stat
              label={t('recordActivity.heartRate', {
                defaultValue: 'Heart rate',
              })}
              value={number(heartRate, 0)}
              unit={t('recordActivity.unitBpm', { defaultValue: 'bpm' })}
            />
          </View>
        ) : null}
        {finished && laps.length > 0 ? (
          <View className="bg-surface rounded-xl p-4 mb-4">
            <Text className="text-text-primary text-base font-bold mb-2">
              {t('recordActivity.laps', { defaultValue: 'Laps' })}
            </Text>
            {laps.map((lap, i) => (
              <SplitRow
                key={lap.index}
                label={t('recordActivity.lapLabel', {
                  defaultValue: 'Lap {{number}}',
                  number: lap.index,
                })}
                detail={`${number(lap.distanceMeters / unitMeters, 2)} ${unitLabel} · ${formatClock(lap.durationSeconds)}`}
                pace={`${formatPace(
                  paceSecondsPerUnit(
                    lap.distanceMeters,
                    lap.durationSeconds,
                    unitMeters
                  )
                )} ${paceUnit}`}
                fraction={lapBarsFor[i].fraction}
                fastest={lapBarsFor[i].fastest}
                fastestLabel={t('recordActivity.fastest', {
                  defaultValue: 'Fastest',
                })}
              />
            ))}
          </View>
        ) : null}
        {finished && splits.length > 0 ? (
          <View className="bg-surface rounded-xl p-4 mb-4">
            <Text className="text-text-primary text-base font-bold mb-2">
              {t('recordActivity.splits', { defaultValue: 'Splits' })}
            </Text>
            {splits.map((split, i) => (
              <SplitRow
                key={split.index}
                label={`${
                  split.partial
                    ? number(split.distanceMeters / unitMeters)
                    : String(split.index)
                } ${unitLabel}`}
                pace={`${formatPace(
                  paceSecondsPerUnit(
                    split.distanceMeters,
                    split.durationSeconds,
                    unitMeters
                  )
                )} ${paceUnit}`}
                fraction={splitBarsFor[i].fraction}
                fastest={splitBarsFor[i].fastest}
                fastestLabel={t('recordActivity.fastest', {
                  defaultValue: 'Fastest',
                })}
              />
            ))}
          </View>
        ) : null}
        {finished ? (
          <>
            <Button loading={busy} onPress={() => void handleSave()}>
              {t('recordActivity.save', { defaultValue: 'Save activity' })}
            </Button>
            <Button
              variant="destructive"
              className="mt-2"
              disabled={busy}
              onPress={handleDiscard}
            >
              {t('recordActivity.discard.action', { defaultValue: 'Discard' })}
            </Button>
          </>
        ) : (
          <View>
            {session.status === 'recording' ? (
              <Button
                variant="outline"
                className="mb-2"
                disabled={busy}
                onPress={() => void markLap()}
              >
                {t('recordActivity.lap', { defaultValue: 'Lap' })}
              </Button>
            ) : null}
            <View className="flex-row">
              <Button
                variant="secondary"
                className="flex-1 mr-2"
                loading={busy}
                onPress={() =>
                  void (session.status === 'recording'
                    ? run(
                        pauseRecording,
                        t('recordActivity.errors.pause', {
                          defaultValue: 'Could not pause recording',
                        })
                      )
                    : handleResume())
                }
              >
                {session.status === 'recording'
                  ? t('recordActivity.pause', { defaultValue: 'Pause' })
                  : t('recordActivity.resume', { defaultValue: 'Resume' })}
              </Button>
              <Button
                className="flex-1 ml-2"
                disabled={busy}
                onPress={() => void handleFinish()}
              >
                {t('recordActivity.finish', { defaultValue: 'Finish' })}
              </Button>
            </View>
          </View>
        )}
        {finished ? null : (
          <Button
            variant="destructive"
            className="mt-2"
            disabled={busy}
            onPress={handleDiscard}
          >
            {t('recordActivity.discard.action', { defaultValue: 'Discard' })}
          </Button>
        )}
      </>
    );
  })();

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}
    >
      {body}
    </ScrollView>
  );
};

export default RecordActivityScreen;
