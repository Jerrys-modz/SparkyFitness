import type {
  CheckInPhotoWithWeight,
  PhotoType,
} from "../schemas/api/CheckInPhotos.api.zod.ts";

/**
 * One calendar day of the progress gallery: the photos taken that day, keyed by
 * angle, plus the day's weight. Built client-side from the flat gallery
 * response so the timeline, the comparison picker and the time-lapse player all
 * work off whole days rather than loose photos.
 */
export interface ProgressPhotoDay {
  entry_date: string;
  weight: number | null;
  photos: Partial<Record<PhotoType, CheckInPhotoWithWeight>>;
}

/**
 * Folds the flat gallery response into one entry per calendar day, newest
 * first. The server already orders by entry_date DESC, so this keeps insertion
 * order rather than re-sorting.
 */
export function groupPhotosByDay(
  photos: CheckInPhotoWithWeight[],
): ProgressPhotoDay[] {
  const days = new Map<string, ProgressPhotoDay>();
  for (const photo of photos) {
    let day = days.get(photo.entry_date);
    if (!day) {
      day = { entry_date: photo.entry_date, weight: photo.weight, photos: {} };
      days.set(photo.entry_date, day);
    }
    // Every row for a day carries the same joined weight, but a day whose first
    // row happened to be null should still pick up a later non-null one.
    if (day.weight == null) day.weight = photo.weight;
    day.photos[photo.photo_type] = photo;
  }
  return [...days.values()];
}
