import { useMemo } from 'react';
import { useActivityDetailsQuery } from '@/hooks/Exercises/useExercises';
import { useHeartRateZones } from '@/hooks/Settings/useHeartRateZones';
import { useWorkoutHrZones } from '@/hooks/useGenericHealth';
import {
  fallbackZoneFloors,
  foldZonesIntoTiers,
  tierGradientStops,
  tierThresholds,
} from '@/utils/heartRateZoneTiers';
import { extractWorkoutHeartRateSeries } from '@/utils/workoutTelemetryExtractor';
import { computeTimeInZones, HEART_RATE_ZONE_COLORS } from '@workspace/shared';
import { useTranslation } from 'react-i18next';

interface WorkoutZoneBreakdownInput {
  workoutHrZones: NonNullable<ReturnType<typeof useWorkoutHrZones>['data']>;
  activityDetails: ReturnType<typeof useActivityDetailsQuery>['data'];
  points: ReturnType<typeof extractWorkoutHeartRateSeries>['points'];
}

export const useWorkoutZoneBreakdown = ({
  workoutHrZones,
  activityDetails,
  points,
}: WorkoutZoneBreakdownInput) => {
  const { t } = useTranslation();

  // 3. Zone breakdown (stored rows -> Garmin payload -> the person's own zones).
  // All five zones are summed first, then folded into the four named tiers, so
  // the percentages always add up.
  const { data: zoneData } = useHeartRateZones();
  const zoneFloors = useMemo(
    () => zoneData?.resolved.zones.map((z) => z.lower_bpm) ?? null,
    [zoneData]
  );
  const thresholds = useMemo(
    () => tierThresholds(zoneFloors ?? fallbackZoneFloors()),
    [zoneFloors]
  );

  const zones = useMemo(() => {
    const secondsByZone = [0, 0, 0, 0, 0];
    const add = (zone: number, seconds: number) => {
      if (Number.isInteger(zone) && zone >= 1 && zone <= 5 && seconds > 0) {
        secondsByZone[zone - 1] = (secondsByZone[zone - 1] ?? 0) + seconds;
      }
    };

    if (workoutHrZones && workoutHrZones.length > 0) {
      workoutHrZones.forEach((z) => add(z.zone_index, z.seconds_in_zone || 0));
    } else {
      const act = (activityDetails as Record<string, unknown> | undefined)?.[
        'activity'
      ] as Record<string, unknown> | undefined;
      const rawZones = (act?.['hr_in_timezones'] ||
        (activityDetails as Record<string, unknown> | undefined)?.[
          'hr_in_timezones'
        ]) as Array<{ zoneNumber: number; secsInZone: number }> | undefined;

      if (Array.isArray(rawZones) && rawZones.length > 0) {
        rawZones.forEach((z) => add(z.zoneNumber, z.secsInZone || 0));
      } else if (points.length >= 2 && zoneFloors) {
        computeTimeInZones(
          points.map((p) => ({
            t: new Date(p.timestamp).toISOString(),
            bpm: p.bpm,
          })),
          zoneFloors
        ).forEach((b) => add(b.zone_index, b.seconds_in_zone));
      }
    }

    const totalSecs = secondsByZone.reduce((a, b) => a + b, 0);
    if (totalSecs <= 0) return [];
    const names = [
      t('heartRate.zoneLight', 'Light'),
      t('heartRate.zoneModerate', 'Moderate'),
      t('heartRate.zoneVigorous', 'Vigorous'),
      t('heartRate.zonePeak', 'Peak'),
    ];
    return foldZonesIntoTiers(secondsByZone).map((secs, idx) => ({
      name: names[idx] ?? `Zone ${idx + 1}`,
      pct: Math.round((secs / totalSecs) * 100),
      mins: Math.round(secs / 60),
      color: HEART_RATE_ZONE_COLORS[idx] ?? '#22c55e',
    }));
  }, [workoutHrZones, activityDetails, points, zoneFloors, t]);

  const pointsGradientStops = useMemo(() => {
    const values = points.map((p) => p.bpm).filter((v) => v > 0);
    if (values.length === 0) return [];
    return tierGradientStops(
      Math.min(...values),
      Math.max(...values),
      thresholds
    );
  }, [points, thresholds]);

  return { zones, thresholds, pointsGradientStops };
};
