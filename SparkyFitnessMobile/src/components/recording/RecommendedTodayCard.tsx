import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  HEART_RATE_ZONE_COLORS,
  type PaceBand,
  type ProgramStatus,
} from '@workspace/shared';
import { formatLocalizedNumber } from '../../localization';
import { formatPace } from '../../utils/gpsRecording';
import {
  buildRecommendedSession,
  sessionReason,
  type SessionKind,
  type SessionLabelId,
  type SessionPaces,
  type SessionStep,
} from '../../utils/recommendedSession';
import { useTrainingLoad } from '../../hooks/useTrainingLoad';
import { useSuggestedRanges } from '../../hooks/useSuggestedRanges';

const KM_PER_MILE = 1.609344;

// Resolvers rather than key strings: the i18n audit needs the literal key at
// each call site, and a total record makes a new label a compile error.
const KIND_NAMES: Record<SessionKind, (t: TFunction) => string> = {
  easy: (t) => t('runPrograms.recommended.kind.easy', { defaultValue: 'Easy' }),
  long: (t) =>
    t('runPrograms.recommended.kind.long', { defaultValue: 'Long run' }),
  tempo: (t) =>
    t('runPrograms.recommended.kind.tempo', { defaultValue: 'Tempo' }),
  marathon: (t) =>
    t('runPrograms.recommended.kind.marathon', {
      defaultValue: 'Marathon pace',
    }),
  hills: (t) =>
    t('runPrograms.recommended.kind.hills', { defaultValue: 'Hills' }),
  strides: (t) =>
    t('runPrograms.recommended.kind.strides', { defaultValue: 'Strides' }),
  intervals: (t) =>
    t('runPrograms.recommended.kind.intervals', { defaultValue: 'Intervals' }),
  runWalk: (t) =>
    t('runPrograms.recommended.kind.runWalk', { defaultValue: 'Run and walk' }),
  briskWalk: (t) =>
    t('runPrograms.recommended.kind.briskWalk', {
      defaultValue: 'Brisk walk',
    }),
};

const LABEL_NAMES: Record<SessionLabelId, (t: TFunction) => string> = {
  warmup: (t) =>
    t('runPrograms.recommended.step.warmup', { defaultValue: 'Easy warm-up' }),
  cooldown: (t) =>
    t('runPrograms.recommended.step.cooldown', {
      defaultValue: 'Easy cool-down',
    }),
  easy: (t) => t('runPrograms.recommended.step.easy', { defaultValue: 'Easy' }),
  tempo: (t) =>
    t('runPrograms.recommended.step.tempo', { defaultValue: 'Tempo' }),
  marathon: (t) =>
    t('runPrograms.recommended.step.marathon', {
      defaultValue: 'Marathon pace',
    }),
  hill: (t) =>
    t('runPrograms.recommended.step.hill', { defaultValue: 'Hill repeat' }),
  stride: (t) =>
    t('runPrograms.recommended.step.stride', { defaultValue: 'Stride' }),
  fast: (t) => t('runPrograms.recommended.step.fast', { defaultValue: 'Fast' }),
  run: (t) => t('runPrograms.recommended.step.run', { defaultValue: 'Run' }),
  walk: (t) => t('runPrograms.recommended.step.walk', { defaultValue: 'Walk' }),
  briskWalk: (t) =>
    t('runPrograms.recommended.step.briskWalk', {
      defaultValue: 'Brisk walk',
    }),
};

const stepLength = (
  t: TFunction,
  step: SessionStep,
  distanceUnit: 'km' | 'miles'
): string => {
  if (step.meters != null) {
    return distanceUnit === 'miles'
      ? t('runPrograms.recommended.miles', {
          value: formatLocalizedNumber(step.meters / 1609.344, {
            maximumFractionDigits: 2,
          }),
          defaultValue: '{{value}} mi',
        })
      : t('runPrograms.recommended.meters', {
          value: formatLocalizedNumber(step.meters),
          defaultValue: '{{value}} m',
        });
  }
  const minutes = Math.round(step.seconds / 60);
  return minutes >= 1
    ? t('runPrograms.recommended.minutes', {
        value: formatLocalizedNumber(minutes),
        defaultValue: '{{value}} min',
      })
    : t('runPrograms.recommended.seconds', {
        value: formatLocalizedNumber(step.seconds),
        defaultValue: '{{value}} s',
      });
};

/** "Zone 2 · about 5:30/km", or just the zone when there is no pace to quote. */
const zoneLine = (
  t: TFunction,
  step: SessionStep,
  distanceUnit: 'km' | 'miles'
): string => {
  const zone = t('runPrograms.recommended.zone', {
    zone: step.zone,
    defaultValue: 'Zone {{zone}}',
  });
  if (!step.pace) return zone;
  const mid =
    ((step.pace.minSecondsPerKm + step.pace.maxSecondsPerKm) / 2) *
    (distanceUnit === 'miles' ? KM_PER_MILE : 1);
  return t('runPrograms.recommended.zoneAndPace', {
    zone,
    pace: formatPace(Math.round(mid / 5) * 5),
    unit:
      distanceUnit === 'miles'
        ? t('exerciseStatistics.paceZones.perMile', { defaultValue: '/mi' })
        : t('exerciseStatistics.paceZones.perKm', { defaultValue: '/km' }),
    defaultValue: '{{zone}} · about {{pace}}{{unit}}',
  });
};

const toBand = (band: PaceBand): PaceBand => ({
  minSecondsPerKm: band.minSecondsPerKm,
  maxSecondsPerKm: band.maxSecondsPerKm,
});

/**
 * "Recommended today": the program's next workout as a session (warm-up,
 * main work, cool-down) with the heart-rate zone and pace of each part, and a
 * line on why it fits from the training-load verdict. Shown above the program
 * card while a program is on and has a workout due.
 */
const RecommendedTodayCard: React.FC<{
  status: ProgramStatus;
  distanceUnit: 'km' | 'miles';
}> = ({ status, distanceUnit }) => {
  const { t } = useTranslation();
  const { load } = useTrainingLoad();
  const ranges = useSuggestedRanges(
    status.program.activity === 'walk' ? 'walk' : 'run',
    true
  );
  const workout = status.workout;
  if (!workout || status.finished) return null;

  const paces: SessionPaces | null = ranges.pace
    ? {
        work: toBand(ranges.pace.work),
        easy: toBand(ranges.pace.easy),
        warm: toBand(ranges.pace.warm),
        byEffort: ranges.byEffort,
      }
    : null;
  const session = buildRecommendedSession(workout.plan, paces);
  const reason = sessionReason(load?.status, load?.recovery);
  const totalMinutes = Math.round(session.totalSeconds / 60);
  const dotColor =
    HEART_RATE_ZONE_COLORS[
      Math.min(session.topZone, HEART_RATE_ZONE_COLORS.length) - 1
    ];

  const reasonText: Record<NonNullable<typeof reason>, string> = {
    takeRest: t('runPrograms.recommended.reason.takeRest', {
      defaultValue:
        'Your load has been high lately. Keep this one easy, or take a rest day.',
    }),
    ready: t('runPrograms.recommended.reason.ready', {
      defaultValue: 'You are rested, and your load has room for this session.',
    }),
    steady: t('runPrograms.recommended.reason.steady', {
      defaultValue: 'Your training load is steady, so this session fits.',
    }),
    low: t('runPrograms.recommended.reason.low', {
      defaultValue: 'Your load is low this week, so there is room for this.',
    }),
    high: t('runPrograms.recommended.reason.high', {
      defaultValue:
        'Your load is high. Run this by effort and ease off if you feel tired.',
    }),
  };

  return (
    <View
      className="bg-surface rounded-xl p-4 mb-4 shadow-sm"
      testID="recommended-today"
    >
      <View className="self-start bg-bg-success rounded-full px-2.5 py-0.5">
        <Text className="text-text-success text-xs font-semibold">
          {t('runPrograms.recommended.pill', {
            defaultValue: 'Recommended today',
          })}
        </Text>
      </View>
      <View className="flex-row items-center mt-3">
        <View
          className="w-2 h-2 rounded-full mr-2"
          style={{ backgroundColor: dotColor }}
        />
        <Text className="text-text-secondary text-xs font-bold uppercase tracking-wider">
          {KIND_NAMES[session.kind](t)}
        </Text>
      </View>
      <Text className="text-text-primary text-2xl font-bold mt-1">
        {t('runPrograms.recommended.minutes', {
          value: formatLocalizedNumber(totalMinutes),
          defaultValue: '{{value}} min',
        })}
      </Text>
      {reason ? (
        <Text className="text-text-secondary text-sm mt-2">
          {reasonText[reason]}
        </Text>
      ) : null}
      <View className="h-px bg-border-subtle mt-3" />
      <Text className="text-text-muted text-xs mt-3">
        {t('runPrograms.recommended.session', {
          value: formatLocalizedNumber(totalMinutes),
          defaultValue: 'Session · {{value}} min',
        })}
      </Text>
      {session.rows.map((row, index) => (
        <View
          key={`${row.step.label}-${index}`}
          className="flex-row mt-3"
          testID={`recommended-row-${index}`}
        >
          <Text className="text-text-primary text-sm font-semibold w-20">
            {row.recovery
              ? t('runPrograms.recommended.repeat', {
                  repeats: formatLocalizedNumber(row.count),
                  defaultValue: '{{repeats}} ×',
                })
              : stepLength(t, row.step, distanceUnit)}
          </Text>
          <View className="flex-1">
            {[row.step, row.recovery].map((step, n) =>
              step ? (
                <View key={n} className={n > 0 ? 'mt-2' : undefined}>
                  <Text className="text-text-primary text-sm font-semibold">
                    {row.recovery
                      ? t('runPrograms.recommended.lengthLabel', {
                          length: stepLength(t, step, distanceUnit),
                          label: LABEL_NAMES[step.label](t),
                          defaultValue: '{{length}} {{label}}',
                        })
                      : row.count > 1
                        ? t('runPrograms.recommended.times', {
                            label: LABEL_NAMES[step.label](t),
                            repeats: formatLocalizedNumber(row.count),
                            defaultValue: '{{label}} × {{repeats}}',
                          })
                        : LABEL_NAMES[step.label](t)}
                  </Text>
                  <Text className="text-text-muted text-xs mt-0.5">
                    {zoneLine(t, step, distanceUnit)}
                  </Text>
                </View>
              ) : null
            )}
          </View>
        </View>
      ))}
    </View>
  );
};

export default RecommendedTodayCard;
