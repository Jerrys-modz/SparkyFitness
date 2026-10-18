import {
  addDays,
  compareDays,
  PHOTO_TYPES,
  type PhotoType,
  type ProgressPhotoDay,
} from '@workspace/shared';
import { kgToLbs } from '@/utils/unitConversions';

/** The three angles in display order, with their translation keys. */
export const PHOTO_ANGLES: {
  type: PhotoType;
  labelKey: string;
  defaultLabel: string;
}[] = [
  { type: 'front', labelKey: 'checkIn.photos.front', defaultLabel: 'Front' },
  { type: 'back', labelKey: 'checkIn.photos.back', defaultLabel: 'Back' },
  { type: 'side', labelKey: 'checkIn.photos.side', defaultLabel: 'Side' },
];

/**
 * The days that have a photo of `angle`, oldest first. Both the comparison and
 * the time-lapse read left to right as progression, so they want the gallery
 * (which arrives newest first) the other way round.
 */
export const framesForAngle = (
  days: ProgressPhotoDay[],
  angle: PhotoType
): ProgressPhotoDay[] => days.filter((day) => day.photos[angle]).reverse();

/**
 * The angle to open on: the one with the most shoots, so the dialog starts on
 * something playable. Ties go to the usual Front, Back, Side order.
 */
export const defaultAngle = (days: ProgressPhotoDay[]): PhotoType => {
  let best: PhotoType = PHOTO_TYPES[0];
  let bestCount = -1;
  for (const angle of PHOTO_TYPES) {
    const count = days.filter((day) => day.photos[angle]).length;
    if (count > bestCount) {
      best = angle;
      bestCount = count;
    }
  }
  return best;
};

/** Whether any angle has two shoots to compare or play back. */
export const hasComparableAngle = (days: ProgressPhotoDay[]): boolean =>
  PHOTO_TYPES.some(
    (angle) => days.filter((day) => day.photos[angle]).length >= 2
  );

/** How far back the time-lapse reaches. */
export type TimelapseRange = '30d' | '3m' | 'all' | 'custom';

const PRESET_DAYS: Record<'30d' | '3m', number> = { '30d': 30, '3m': 92 };

/** A user-picked range always has both ends (inclusive YYYY-MM-DD). */
export interface CustomRange {
  from: string;
  to: string;
}

/**
 * The frames a range plays, and whether the window was widened to everything.
 *
 * Every window is evaluated as absolute day bounds, presets included, so one
 * filter serves both. A preset window with fewer than two frames falls back to
 * the whole history rather than to an empty player, since someone whose shoots
 * are all older than it would otherwise see nothing. A custom range is exempt:
 * the dates were chosen on purpose, and quietly playing more than them would
 * misreport what is in them.
 */
export const framesInRange = (
  frames: ProgressPhotoDay[],
  range: TimelapseRange,
  today: string,
  custom: CustomRange | null
): { frames: ProgressPhotoDay[]; widened: boolean } => {
  if (range === 'all') return { frames, widened: false };
  if (range === 'custom' && !custom) return { frames, widened: false };

  const from =
    range === 'custom' ? custom!.from : addDays(today, -PRESET_DAYS[range]);
  const to = range === 'custom' ? custom!.to : today;
  const windowed = frames.filter(
    (day) =>
      compareDays(day.entry_date, from) >= 0 &&
      compareDays(day.entry_date, to) <= 0
  );

  if (windowed.length >= 2 || range === 'custom') {
    return { frames: windowed, widened: false };
  }
  return { frames, widened: true };
};

/**
 * A signed weight change for the comparison badge, e.g. "-4.3 kg". Stone users
 * get pounds: a change of a few pounds reads badly as a fraction of a stone.
 */
export const formatWeightDelta = (kg: number, unit: string): string => {
  const inLbs = unit === 'lbs' || unit === 'st_lbs';
  const value = inLbs ? kgToLbs(kg) : kg;
  const rounded = Math.round(value * 10) / 10;
  // A change that rounds to zero is shown unsigned rather than as "-0".
  const shown = rounded === 0 ? 0 : rounded;
  return `${shown > 0 ? '+' : ''}${shown} ${inLbs ? 'lbs' : 'kg'}`;
};
