import type { TFunction } from 'i18next';
import type { SegmentEffort, SegmentSummary } from '@workspace/shared';
import { formatClock } from './gpsRecording';
import { formatRouteDistance, type DistanceUnit } from './routeDisplay';

/** The segment's name, or a stand-in made from its length. */
export function segmentTitle(
  t: TFunction,
  segment: Pick<SegmentSummary, 'name' | 'lengthM'>,
  unit: DistanceUnit
): string {
  if (segment.name) return segment.name;
  return t('segments.untitled', {
    distance: formatRouteDistance(segment.lengthM, unit),
    defaultValue: 'Segment · {{distance}}',
  });
}

/** `m:ss` (or `h:mm:ss`) with a tenth when under ten minutes, which is where tenths matter. */
export function formatSegmentTime(seconds: number): string {
  if (seconds >= 600) return formatClock(seconds);
  const tenths = Math.round(seconds * 10) / 10;
  const whole = Math.floor(tenths);
  const frac = Math.round((tenths - whole) * 10);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}.${frac}`;
}

/** "+0:12" behind the best, "-0:03" ahead of it. */
export function formatEffortGap(seconds: number, bestSeconds: number): string {
  const gap = Math.round(seconds - bestSeconds);
  if (gap === 0) return '±0:00';
  const sign = gap > 0 ? '+' : '−';
  return `${sign}${formatClock(Math.abs(gap))}`;
}

export interface EffortChartPoint {
  /** Position in time order, 0 first. */
  index: number;
  /** Negated seconds, so a faster effort sits higher. */
  value: number;
  seconds: number;
  isPersonalRecord: boolean;
  date: string;
}

/** Efforts (newest first, as the server sends them) in time order for a chart. */
export function effortChartPoints(
  efforts: readonly SegmentEffort[]
): EffortChartPoint[] {
  return [...efforts].reverse().map((effort, index) => ({
    index,
    value: -effort.elapsedSeconds,
    seconds: effort.elapsedSeconds,
    isPersonalRecord: effort.isPersonalRecord,
    date: effort.date,
  }));
}

/** Pace per distance unit over a segment, seconds. */
export function segmentPaceSecPerKm(
  lengthM: number,
  seconds: number
): number | null {
  return lengthM > 0 && seconds > 0 ? (seconds / lengthM) * 1000 : null;
}
