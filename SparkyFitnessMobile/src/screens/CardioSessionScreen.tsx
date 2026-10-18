import React from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';

import { useScreenHeader } from '../hooks/useScreenHeader';
import { useCardioSessionDetail } from '../hooks/useCardioSessionDetail';
import { formatLocalizedNumber, getAppLocale } from '../localization';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import {
  METERS_PER_KM,
  METERS_PER_MILE,
  formatPace,
} from '../utils/gpsRecording';
import { summarizeRunningDynamics } from '@workspace/shared';
import {
  gradeAdjustedPaceOfTrack,
  paceSeriesFromDistance,
  paceSeriesFromTrack,
  splitsFromTrack,
} from '../utils/cardioSession';
import {
  bpmText,
  resolveRunningDynamics,
  runningDynamicsCharts,
  sessionStats,
  verticalOscillationDisplay,
} from '../utils/cardioSessionStats';
import Switch from '../components/ui/Switch';
import RunningDynamicsChart from '../components/exerciseStats/RunningDynamicsChart';
import Button from '../components/ui/Button';
import { shareRouteAsGpx } from '../services/gpxExport';
import { saveActivityAsRoute } from '../services/routeService';
import RouteMap from '../components/exerciseStats/RouteMap';
import HeartRateChart from '../components/exerciseStats/HeartRateChart';
import PaceChart from '../components/exerciseStats/PaceChart';
import SplitsTable from '../components/recording/SplitsTable';
import HeartRateZones from '../components/exerciseStats/HeartRateZones';
import ProgramWorkoutBadge from '../components/recording/ProgramWorkoutBadge';
import FitnessTestBadge from '../components/recording/FitnessTestBadge';
import ShoePickerCard from '../components/ShoePickerCard';
import type { RootStackScreenProps } from '../types/navigation';

type CardioSessionScreenProps = RootStackScreenProps<'CardioSession'>;

const Card: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
    <Text className="text-text-primary text-base font-bold mb-3">{title}</Text>
    {children}
  </View>
);

const CardioSessionScreen: React.FC<CardioSessionScreenProps> = ({
  navigation,
  route,
}) => {
  const { session, distanceUnit, diaryEntry } = route.params;
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();

  const header = useScreenHeader({
    title: session.exerciseName,
    // The native iOS header only takes a title through nativeTitle; without
    // it the route's static "Cardio Session" shows instead.
    nativeTitle: session.exerciseName,
    left: { kind: 'back' },
    // A run or walk made in the app opens here from the diary; its editor is
    // the activity screen, which this hands over to.
    right: diaryEntry
      ? {
          kind: 'text',
          label: t('common.edit', { defaultValue: 'Edit' }),
          role: 'secondary',
          onPress: () =>
            navigation.replace('ActivityDetail', { session: diaryEntry }),
          accessibilityLabel: t('activityDetail.accessibility.edit', {
            defaultValue: 'Edit activity',
          }),
          identifier: 'cardio-session-edit',
        }
      : null,
  });

  const detail = useCardioSessionDetail(session.id, session.entryDate);
  const unitMeters = distanceUnit === 'miles' ? METERS_PER_MILE : METERS_PER_KM;
  const [showGap, setShowGap] = React.useState(false);
  // Grade-adjusted pace needs elevation on the stored track; without it these
  // are null and nothing about GAP is drawn.
  const gradeAdjustedPaceSeconds = React.useMemo(
    () => gradeAdjustedPaceOfTrack(detail.route, unitMeters),
    [detail.route, unitMeters]
  );
  const dynamics = React.useMemo(
    () =>
      resolveRunningDynamics(session, summarizeRunningDynamics(detail.route)),
    [session, detail.route]
  );
  const dynamicsCharts = React.useMemo(
    () => runningDynamicsCharts(detail.route, distanceUnit),
    [detail.route, distanceUnit]
  );
  const stats = sessionStats(t, session, distanceUnit, {
    gradeAdjustedPaceSeconds,
    dynamics,
  });
  const exportGpx = async () => {
    try {
      await shareRouteAsGpx({
        name: session.exerciseName,
        day: session.entryDate.slice(0, 10),
        points: detail.route,
      });
    } catch {
      Toast.show({
        type: 'error',
        text1: t('exerciseStatistics.cardio.exportGpxFailed', {
          defaultValue: 'Could not export the route',
        }),
      });
    }
  };
  const [savingRoute, setSavingRoute] = React.useState(false);
  const saveAsRoute = () => {
    setSavingRoute(true);
    void saveActivityAsRoute(session.id, session.exerciseName)
      .then((saved) => {
        Toast.show({
          type: 'success',
          text1: t('routes.savedAsRoute', { defaultValue: 'Saved to Routes' }),
        });
        navigation.navigate('RouteDetail', { id: saved.id });
      })
      .catch(() => {
        Toast.show({
          type: 'error',
          text1: t('routes.saveAsRouteFailed', {
            defaultValue: 'Could not save the route',
          }),
        });
      })
      .finally(() => setSavingRoute(false));
  };
  const [year, month, day] = session.entryDate
    .slice(0, 10)
    .split('-')
    .map(Number);
  const dateText = new Date(
    year ?? 1970,
    (month ?? 1) - 1,
    day ?? 1
  ).toLocaleDateString(getAppLocale(), {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const paceSeries = React.useMemo(
    () =>
      detail.route.length > 0
        ? paceSeriesFromTrack(detail.route, unitMeters)
        : paceSeriesFromDistance(detail.distanceSeries ?? [], unitMeters),
    [detail.route, detail.distanceSeries, unitMeters]
  );
  const splits = React.useMemo(
    () =>
      detail.route.length > 1
        ? splitsFromTrack(detail.route, unitMeters, detail.heartRate)
        : [],
    [detail.route, detail.heartRate, unitMeters]
  );
  const paceUnitLabel =
    distanceUnit === 'miles'
      ? t('exerciseStatistics.cardio.perMile', { defaultValue: '/mi' })
      : t('exerciseStatistics.cardio.perKm', { defaultValue: '/km' });

  const hasGradeAdjustedPace =
    gradeAdjustedPaceSeconds != null &&
    paceSeries.some((point) => point.gapSeconds != null);

  // Each metric with a value gets a card: its average, the chart when the
  // track has enough readings, and a plain-language note.
  const dynamicsCards: {
    key: string;
    title: string;
    average: string;
    data: { elapsedMinutes: number; value: number }[];
    fractionDigits: number;
    note: string;
  }[] = [];
  if (dynamics.groundContactTimeMs != null) {
    dynamicsCards.push({
      key: 'groundContact',
      title: t('exerciseStatistics.cardio.groundContactTime', {
        defaultValue: 'Ground contact',
      }),
      average: t('exerciseStatistics.cardio.averageMs', {
        defaultValue: 'Avg {{value}} ms',
        value: formatLocalizedNumber(Math.round(dynamics.groundContactTimeMs)),
      }),
      data: dynamicsCharts.groundContact,
      fractionDigits: 0,
      note: t('exerciseStatistics.cardio.groundContactNote', {
        defaultValue:
          'How long each foot stays on the ground per step. Shorter often goes with faster running, but it varies between people and with pace, so compare your own runs. Not medical advice.',
      }),
    });
  }
  if (dynamics.verticalOscillationMm != null) {
    const value = formatLocalizedNumber(
      verticalOscillationDisplay(dynamics.verticalOscillationMm, distanceUnit),
      { maximumFractionDigits: 1 }
    );
    dynamicsCards.push({
      key: 'verticalOscillation',
      title: t('exerciseStatistics.cardio.verticalOscillation', {
        defaultValue: 'Vertical oscillation',
      }),
      average:
        distanceUnit === 'miles'
          ? t('exerciseStatistics.cardio.averageInches', {
              defaultValue: 'Avg {{value}} in',
              value,
            })
          : t('exerciseStatistics.cardio.averageCentimeters', {
              defaultValue: 'Avg {{value}} cm',
              value,
            }),
      data: dynamicsCharts.verticalOscillation,
      fractionDigits: 1,
      note: t('exerciseStatistics.cardio.verticalOscillationNote', {
        defaultValue:
          'How far your torso bounces up and down with each step. Less bounce means more of your effort goes forward, but it changes with pace and form. A guide, not a target.',
      }),
    });
  }
  if (dynamics.verticalRatioPercent != null) {
    dynamicsCards.push({
      key: 'verticalRatio',
      title: t('exerciseStatistics.cardio.verticalRatio', {
        defaultValue: 'Vertical ratio',
      }),
      average: t('exerciseStatistics.cardio.averagePercent', {
        defaultValue: 'Avg {{value}}%',
        value: formatLocalizedNumber(dynamics.verticalRatioPercent, {
          maximumFractionDigits: 1,
        }),
      }),
      data: dynamicsCharts.verticalRatio,
      fractionDigits: 1,
      note: t('exerciseStatistics.cardio.verticalRatioNote', {
        defaultValue:
          'Vertical oscillation as a percentage of your step length. Lower means less of each step goes up instead of forward. It is worked out from the two measurements, not measured separately.',
      }),
    });
  }
  if (dynamics.powerWatts != null) {
    dynamicsCards.push({
      key: 'power',
      title: t('exerciseStatistics.cardio.power', { defaultValue: 'Power' }),
      average: t('exerciseStatistics.cardio.averageWatts', {
        defaultValue: 'Avg {{value}} W',
        value: formatLocalizedNumber(Math.round(dynamics.powerWatts)),
      }),
      data: dynamicsCharts.power,
      fractionDigits: 0,
      note: t('exerciseStatistics.cardio.powerNote', {
        defaultValue:
          'The effort your watch or sensor estimates, in watts. Brands calculate it differently, so compare sessions from the same device.',
      }),
    });
  }

  const peak = detail.heartRate.reduce((max, p) => Math.max(max, p.bpm), 0);
  const average =
    detail.heartRate.length > 0
      ? detail.heartRate.reduce((sum, p) => sum + p.bpm, 0) /
        detail.heartRate.length
      : 0;

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text className="text-text-secondary text-sm mb-3">{dateText}</Text>

        <ProgramWorkoutBadge entryId={session.id} />
        <FitnessTestBadge entryId={session.id} unit={distanceUnit} />

        {stats.length > 0 ? (
          <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm flex-row flex-wrap">
            {stats.map((stat) => (
              <View key={stat.key} className="w-1/2 py-1.5">
                <Text className="text-text-secondary text-xs">
                  {stat.label}
                </Text>
                <Text className="text-text-primary text-base font-semibold">
                  {stat.value}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <ShoePickerCard exerciseEntryId={session.id} />
        <Button
          variant="secondary"
          className="mb-4 py-3 items-center"
          testID="share-as-image"
          onPress={() =>
            navigation.navigate('ActivityShare', { session, distanceUnit })
          }
        >
          {t('exerciseStatistics.cardio.shareImage', {
            defaultValue: 'Share as image',
          })}
        </Button>

        <Card
          title={t('exerciseStatistics.cardio.route', {
            defaultValue: 'Route',
          })}
        >
          {detail.isRouteLoading ? (
            <ActivityIndicator />
          ) : detail.route.length > 1 ? (
            <>
              <RouteMap
                points={detail.route}
                accessibilityLabel={t('exerciseStatistics.cardio.routeA11y', {
                  defaultValue:
                    'Route of this workout, from the green dot to the red ring',
                })}
              />
              <Button
                variant="link"
                testID="export-gpx"
                onPress={() => void exportGpx()}
              >
                {t('exerciseStatistics.cardio.exportGpx', {
                  defaultValue: 'Export GPX',
                })}
              </Button>
              <Button
                variant="link"
                testID="save-as-route"
                loading={savingRoute}
                onPress={saveAsRoute}
              >
                {t('routes.saveAsRoute', { defaultValue: 'Save as route' })}
              </Button>
              <Button
                variant="link"
                testID="create-segment"
                onPress={() =>
                  navigation.navigate('SegmentCreate', {
                    exerciseEntryId: session.id,
                  })
                }
              >
                {t('segments.createFromActivity', {
                  defaultValue: 'Create segment',
                })}
              </Button>
            </>
          ) : (
            <Text className="text-text-secondary text-sm">
              {t('exerciseStatistics.cardio.noRoute', {
                defaultValue:
                  'No GPS route stored. Indoor workouts do not have one. An outdoor walk only has a route if Apple Health shared it when the workout synced.',
              })}
            </Text>
          )}
        </Card>

        {paceSeries.length >= 2 ? (
          <Card
            title={t('exerciseStatistics.cardio.pace', {
              defaultValue: 'Pace',
            })}
          >
            <View className="flex-row mb-2">
              <Text className="text-text-secondary text-sm mr-4">
                {t('exerciseStatistics.cardio.bestPace', {
                  defaultValue: 'Best {{value}}',
                  value: `${formatPace(
                    Math.min(...paceSeries.map((p) => p.paceSeconds))
                  )} ${paceUnitLabel}`,
                })}
              </Text>
            </View>
            {hasGradeAdjustedPace ? (
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-text-primary text-sm">
                  {t('exerciseStatistics.cardio.gradeAdjusted', {
                    defaultValue: 'Grade adjusted',
                  })}
                </Text>
                <Switch
                  testID="grade-adjusted-toggle"
                  value={showGap}
                  onValueChange={setShowGap}
                  accessibilityLabel={t(
                    'exerciseStatistics.cardio.gradeAdjustedA11y',
                    { defaultValue: 'Show grade adjusted pace on the chart' }
                  )}
                />
              </View>
            ) : null}
            <PaceChart
              data={paceSeries}
              gradeAdjusted={
                hasGradeAdjustedPace && showGap
                  ? {
                      paceLabel: t('exerciseStatistics.cardio.pace', {
                        defaultValue: 'Pace',
                      }),
                      gapLabel: t('exerciseStatistics.cardio.gradeAdjusted', {
                        defaultValue: 'Grade adjusted',
                      }),
                    }
                  : undefined
              }
              xAxisCaption={
                distanceUnit === 'miles'
                  ? t('exerciseStatistics.cardio.milesAxis', {
                      defaultValue: 'Miles from start',
                    })
                  : t('exerciseStatistics.cardio.kilometersAxis', {
                      defaultValue: 'Kilometers from start',
                    })
              }
            />
            {hasGradeAdjustedPace && showGap ? (
              <Text className="text-text-muted text-xs mt-2">
                {t('exerciseStatistics.cardio.gradeAdjustedNote', {
                  defaultValue:
                    'Grade adjusted pace is the flat pace that would cost about the same effort, worked out from the elevation on your route (Minetti et al., 2002). It is an estimate and ignores wind, surface and fatigue.',
                })}
              </Text>
            ) : null}
          </Card>
        ) : null}

        {splits.length > 0 ? (
          <Card
            title={t('exerciseStatistics.cardio.splits', {
              defaultValue: 'Splits',
            })}
          >
            <SplitsTable
              splits={splits}
              unitMeters={unitMeters}
              unit={distanceUnit}
            />
          </Card>
        ) : null}
        {dynamicsCards.map((card) => (
          <Card key={card.key} title={card.title}>
            <Text className="text-text-secondary text-sm mb-2">
              {card.average}
            </Text>
            {card.data.length >= 3 ? (
              <RunningDynamicsChart
                data={card.data}
                fractionDigits={card.fractionDigits}
                xAxisCaption={t('exerciseStatistics.cardio.minutesAxis', {
                  defaultValue: 'Minutes from start',
                })}
              />
            ) : null}
            <Text className="text-text-muted text-xs mt-2">{card.note}</Text>
          </Card>
        ))}

        <Card
          title={t('exerciseStatistics.cardio.heartRate', {
            defaultValue: 'Heart Rate',
          })}
        >
          {detail.isHeartRateLoading ? (
            <ActivityIndicator />
          ) : detail.heartRate.length > 0 ? (
            <>
              <View className="flex-row mb-2">
                <Text className="text-text-secondary text-sm mr-4">
                  {t('exerciseStatistics.cardio.average', {
                    defaultValue: 'Avg {{value}}',
                    value: bpmText(t, average),
                  })}
                </Text>
                <Text className="text-text-secondary text-sm">
                  {t('exerciseStatistics.cardio.peak', {
                    defaultValue: 'Max {{value}}',
                    value: bpmText(t, peak),
                  })}
                </Text>
              </View>
              <HeartRateChart
                data={detail.heartRate}
                xAxisCaption={t('exerciseStatistics.cardio.minutesAxis', {
                  defaultValue: 'Minutes from start',
                })}
              />
            </>
          ) : session.avgHeartRate != null && session.avgHeartRate > 0 ? (
            <Text className="text-text-secondary text-sm">
              {t('exerciseStatistics.cardio.onlyAverage', {
                defaultValue:
                  'Average heart rate {{value}}. Beat-by-beat samples were not stored.',
                value: bpmText(t, session.avgHeartRate),
              })}
            </Text>
          ) : (
            <Text className="text-text-secondary text-sm">
              {t('exerciseStatistics.cardio.noHeartRate', {
                defaultValue: 'No heart-rate samples for this workout.',
              })}
            </Text>
          )}
        </Card>

        {detail.zones.length > 0 ? (
          <Card
            title={t('exerciseStatistics.cardio.zones', {
              defaultValue: 'Heart Rate Zones',
            })}
          >
            <HeartRateZones zones={detail.zones} />
          </Card>
        ) : null}
      </ScrollView>
    </View>
  );
};

export default CardioSessionScreen;
