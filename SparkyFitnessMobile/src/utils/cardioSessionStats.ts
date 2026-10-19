import type { TFunction } from 'i18next';
import type {
  ExerciseActivityQueryItem,
  GpsTrackPoint,
  RunningDynamicsSummary,
} from '@workspace/shared';
import { runningDynamicsSeries, verticalRatioPercent } from '@workspace/shared';
import { formatLocalizedNumber } from '../localization';
import { formatPace } from './gpsRecording';

const FEET_PER_METER = 3.28084;
const MM_PER_INCH = 25.4;

export interface Stat {
  key: string;
  label: string;
  value: string;
}

const minutesText = (t: TFunction, minutes: number) =>
  t('exerciseStatistics.cardio.minutes', {
    count: minutes,
    formattedCount: formatLocalizedNumber(minutes),
    defaultValue: '{{formattedCount}} min',
    defaultValue_one: '{{formattedCount}} min',
    defaultValue_other: '{{formattedCount}} min',
  });

export const bpmText = (t: TFunction, bpm: number) =>
  t('exerciseStatistics.cardio.bpm', {
    defaultValue: '{{value}} bpm',
    value: formatLocalizedNumber(Math.round(bpm)),
  });

/**
 * Per-run running dynamics for the tiles and charts: what the session row
 * carries, else the averages of the stored track. Whatever neither has stays
 * null, so a tile for it is not drawn.
 */
export interface ResolvedRunningDynamics {
  groundContactTimeMs: number | null;
  verticalOscillationMm: number | null;
  verticalRatioPercent: number | null;
  powerWatts: number | null;
}

export function resolveRunningDynamics(
  session: ExerciseActivityQueryItem,
  track: RunningDynamicsSummary | null
): ResolvedRunningDynamics {
  const positive = (value: number | null | undefined): number | null =>
    value != null && Number.isFinite(value) && value > 0 ? value : null;
  const verticalOscillationMm =
    positive(session.verticalOscillationMm) ??
    positive(track?.verticalOscillationMm);
  return {
    groundContactTimeMs:
      positive(session.groundContactTimeMs) ??
      positive(track?.groundContactTimeMs),
    verticalOscillationMm,
    verticalRatioPercent:
      positive(session.verticalRatioPercent) ??
      verticalRatioPercent(
        verticalOscillationMm,
        positive(session.strideLengthCm) ?? track?.strideLengthCm
      ),
    powerWatts: positive(session.avgPowerWatts) ?? positive(track?.powerWatts),
  };
}

/** A vertical oscillation in the display unit: centimetres, or inches with miles. */
export function verticalOscillationDisplay(
  millimeters: number,
  distanceUnit: 'km' | 'miles'
): number {
  return distanceUnit === 'miles'
    ? millimeters / MM_PER_INCH
    : millimeters / 10;
}

export interface RunningDynamicsCharts {
  groundContact: { elapsedMinutes: number; value: number }[];
  verticalOscillation: { elapsedMinutes: number; value: number }[];
  verticalRatio: { elapsedMinutes: number; value: number }[];
  power: { elapsedMinutes: number; value: number }[];
}

/**
 * The chart series of a stored track, each empty when the track has too few
 * readings of it. Vertical oscillation is converted to the display unit.
 */
export function runningDynamicsCharts(
  route: readonly GpsTrackPoint[],
  distanceUnit: 'km' | 'miles'
): RunningDynamicsCharts {
  return {
    groundContact: runningDynamicsSeries(route, 'groundContactTimeMs'),
    verticalOscillation: runningDynamicsSeries(
      route,
      'verticalOscillationMm'
    ).map((reading) => ({
      elapsedMinutes: reading.elapsedMinutes,
      value: verticalOscillationDisplay(reading.value, distanceUnit),
    })),
    verticalRatio: runningDynamicsSeries(route, 'verticalRatioPercent'),
    power: runningDynamicsSeries(route, 'powerWatts'),
  };
}

export interface SessionStatExtras {
  /** Seconds per display unit; only for a track with elevation. */
  gradeAdjustedPaceSeconds?: number | null;
  dynamics?: ResolvedRunningDynamics | null;
}

export function sessionStats(
  t: TFunction,
  session: ExerciseActivityQueryItem,
  distanceUnit: 'km' | 'miles',
  extras: SessionStatExtras = {}
): Stat[] {
  const stats: Stat[] = [];
  if (session.distanceFormatted != null && session.distanceFormatted > 0) {
    stats.push({
      key: 'distance',
      label: t('exerciseStatistics.cardio.distance', {
        defaultValue: 'Distance',
      }),
      value: `${formatLocalizedNumber(session.distanceFormatted, {
        maximumFractionDigits: 2,
      })} ${
        distanceUnit === 'miles'
          ? t('exerciseStatistics.cardio.unitMi', { defaultValue: 'mi' })
          : t('exerciseStatistics.cardio.unitKm', { defaultValue: 'km' })
      }`,
    });
  }
  if (session.durationMinutes > 0) {
    stats.push({
      key: 'duration',
      label: t('exerciseStatistics.cardio.duration', {
        defaultValue: 'Duration',
      }),
      value: minutesText(t, Math.round(session.durationMinutes)),
    });
  }
  if (session.formattedPace) {
    stats.push({
      key: 'pace',
      label: t('exerciseStatistics.cardio.pace', { defaultValue: 'Pace' }),
      value: session.formattedPace,
    });
  }
  if (session.floorsClimbed != null && session.floorsClimbed > 0) {
    const floors = Math.round(session.floorsClimbed);
    stats.push({
      key: 'floors',
      label: t('exerciseStatistics.cardio.floors', {
        defaultValue: 'Floors climbed',
      }),
      value: t('exerciseStatistics.cardio.floorsCount', {
        count: floors,
        formattedCount: formatLocalizedNumber(floors),
        defaultValue: '{{formattedCount}} floors',
        defaultValue_one: '{{formattedCount}} floor',
        defaultValue_other: '{{formattedCount}} floors',
      }),
    });
  }
  if (session.elevationGainMeters != null && session.elevationGainMeters > 0) {
    // Stored in metres; shown in feet with the miles setting, as distance is.
    const feet = distanceUnit === 'miles';
    const gain = feet
      ? session.elevationGainMeters * FEET_PER_METER
      : session.elevationGainMeters;
    const value = formatLocalizedNumber(Math.round(gain));
    stats.push({
      key: 'elevation',
      label: t('exerciseStatistics.cardio.elevationGain', {
        defaultValue: 'Elevation gain',
      }),
      value: feet
        ? t('exerciseStatistics.cardio.feet', {
            defaultValue: '{{value}} ft',
            value,
          })
        : t('exerciseStatistics.cardio.meters', {
            defaultValue: '{{value}} m',
            value,
          }),
    });
  }
  if (session.avgCadence != null && session.avgCadence > 0) {
    stats.push({
      key: 'cadence',
      label: t('exerciseStatistics.cardio.cadence', {
        defaultValue: 'Avg cadence',
      }),
      value: t('exerciseStatistics.cardio.spm', {
        defaultValue: '{{value}} spm',
        value: formatLocalizedNumber(Math.round(session.avgCadence)),
      }),
    });
  }
  if (session.strideLengthCm != null && session.strideLengthCm > 0) {
    // Stored in centimetres; shown in feet with the miles setting.
    const feet = distanceUnit === 'miles';
    const value = formatLocalizedNumber(
      feet
        ? Math.round(session.strideLengthCm * FEET_PER_METER) / 100
        : Math.round(session.strideLengthCm) / 100,
      { maximumFractionDigits: 2 }
    );
    stats.push({
      key: 'stride',
      label: t('exerciseStatistics.cardio.strideLength', {
        defaultValue: 'Stride length',
      }),
      value: feet
        ? t('exerciseStatistics.cardio.feet', {
            defaultValue: '{{value}} ft',
            value,
          })
        : t('exerciseStatistics.cardio.meters', {
            defaultValue: '{{value}} m',
            value,
          }),
    });
  }
  const gap = extras.gradeAdjustedPaceSeconds;
  if (gap != null && gap > 0) {
    stats.push({
      key: 'gap',
      label: t('exerciseStatistics.cardio.avgGap', {
        defaultValue: 'Avg GAP',
      }),
      value: `${formatPace(gap)} ${
        distanceUnit === 'miles'
          ? t('exerciseStatistics.cardio.perMile', { defaultValue: '/mi' })
          : t('exerciseStatistics.cardio.perKm', { defaultValue: '/km' })
      }`,
    });
  }
  const dynamics = extras.dynamics;
  if (dynamics?.groundContactTimeMs != null) {
    stats.push({
      key: 'groundContact',
      label: t('exerciseStatistics.cardio.groundContactTime', {
        defaultValue: 'Ground contact',
      }),
      value: t('exerciseStatistics.cardio.ms', {
        defaultValue: '{{value}} ms',
        value: formatLocalizedNumber(Math.round(dynamics.groundContactTimeMs)),
      }),
    });
  }
  if (dynamics?.verticalOscillationMm != null) {
    const miles = distanceUnit === 'miles';
    const value = formatLocalizedNumber(
      verticalOscillationDisplay(dynamics.verticalOscillationMm, distanceUnit),
      { maximumFractionDigits: 1 }
    );
    stats.push({
      key: 'verticalOscillation',
      label: t('exerciseStatistics.cardio.verticalOscillation', {
        defaultValue: 'Vertical oscillation',
      }),
      value: miles
        ? t('exerciseStatistics.cardio.inches', {
            defaultValue: '{{value}} in',
            value,
          })
        : t('exerciseStatistics.cardio.centimeters', {
            defaultValue: '{{value}} cm',
            value,
          }),
    });
  }
  if (dynamics?.verticalRatioPercent != null) {
    stats.push({
      key: 'verticalRatio',
      label: t('exerciseStatistics.cardio.verticalRatio', {
        defaultValue: 'Vertical ratio',
      }),
      value: t('exerciseStatistics.cardio.percent', {
        defaultValue: '{{value}}%',
        value: formatLocalizedNumber(dynamics.verticalRatioPercent, {
          maximumFractionDigits: 1,
        }),
      }),
    });
  }
  if (dynamics?.powerWatts != null) {
    stats.push({
      key: 'power',
      label: t('exerciseStatistics.cardio.avgPower', {
        defaultValue: 'Avg power',
      }),
      value: t('exerciseStatistics.cardio.watts', {
        defaultValue: '{{value}} W',
        value: formatLocalizedNumber(Math.round(dynamics.powerWatts)),
      }),
    });
  }
  if (session.avgHeartRate != null && session.avgHeartRate > 0) {
    stats.push({
      key: 'hr',
      label: t('exerciseStatistics.cardio.avgHeartRate', {
        defaultValue: 'Avg heart rate',
      }),
      value: bpmText(t, session.avgHeartRate),
    });
  }
  if (session.workoutEffort != null) {
    stats.push({
      key: 'effort',
      label: t('exerciseStatistics.cardio.effort', { defaultValue: 'Effort' }),
      value: t('workoutEffort.value', {
        defaultValue: '{{rating}}/10',
        rating: session.workoutEffort,
      }),
    });
  }
  if (session.caloriesBurned > 0) {
    stats.push({
      key: 'calories',
      label: t('exerciseStatistics.cardio.caloriesLabel', {
        defaultValue: 'Calories',
      }),
      value: t('exerciseStatistics.cardio.calories', {
        defaultValue: '{{value}} Cal',
        value: formatLocalizedNumber(Math.round(session.caloriesBurned)),
      }),
    });
  }
  return stats;
}
