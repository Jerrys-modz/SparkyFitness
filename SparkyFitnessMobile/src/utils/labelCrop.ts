import type { ActionCrop } from 'expo-image-manipulator';

/** Fractions of the original image, independent of preview size or letterboxing. */
export interface LabelCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type LabelCropHandle =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'move';

/** Smallest selection side, as a fraction of the image. */
const MINIMUM_CROP = 0.05;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function adjustLabelCrop(
  crop: LabelCrop,
  handle: LabelCropHandle,
  dx: number,
  dy: number
): LabelCrop {
  if (handle === 'move') {
    return {
      ...crop,
      x: clamp(crop.x + dx, 0, 1 - crop.width),
      y: clamp(crop.y + dy, 0, 1 - crop.height),
    };
  }

  let left = crop.x;
  let top = crop.y;
  let right = left + crop.width;
  let bottom = top + crop.height;
  // Keep a usable selection even if a handle is dragged past its opposite edge.
  const minimum = MINIMUM_CROP;
  const movesLeft =
    handle === 'top-left' || handle === 'bottom-left' || handle === 'left';
  const movesRight =
    handle === 'top-right' || handle === 'bottom-right' || handle === 'right';
  const movesTop =
    handle === 'top-left' || handle === 'top-right' || handle === 'top';
  const movesBottom =
    handle === 'bottom-left' ||
    handle === 'bottom-right' ||
    handle === 'bottom';
  if (movesLeft) left = clamp(left + dx, 0, right - minimum);
  if (movesRight) right = clamp(right + dx, left + minimum, 1);
  if (movesTop) top = clamp(top + dy, 0, bottom - minimum);
  if (movesBottom) bottom = clamp(bottom + dy, top + minimum, 1);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export const isFullLabelCrop = (crop: LabelCrop) =>
  crop.x <= 0 && crop.y <= 0 && crop.width >= 1 && crop.height >= 1;

/**
 * The selection between two points (fractions of the image) dragged across the
 * photo, in any direction. Clamped to the image and never smaller than the
 * minimum, so a short drag still leaves a box the handles can grab.
 */
export function labelCropFromPoints(
  start: { x: number; y: number },
  end: { x: number; y: number }
): LabelCrop {
  const span = (a: number, b: number) => {
    let low = clamp(Math.min(a, b), 0, 1);
    let high = clamp(Math.max(a, b), 0, 1);
    if (high - low < MINIMUM_CROP) {
      // Grow away from the starting point, staying inside the image.
      if (b >= a) high = Math.min(1, low + MINIMUM_CROP);
      else low = Math.max(0, high - MINIMUM_CROP);
      if (high - low < MINIMUM_CROP) {
        if (low === 0) high = MINIMUM_CROP;
        else low = 1 - MINIMUM_CROP;
      }
    }
    return [low, high] as const;
  };
  const [left, right] = span(start.x, end.x);
  const [top, bottom] = span(start.y, end.y);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function labelCropPixels(
  crop: LabelCrop,
  image: { width: number; height: number }
): ActionCrop['crop'] {
  const originX = clamp(Math.round(crop.x * image.width), 0, image.width - 1);
  const originY = clamp(Math.round(crop.y * image.height), 0, image.height - 1);
  const right = clamp(
    Math.round((crop.x + crop.width) * image.width),
    originX + 1,
    image.width
  );
  const bottom = clamp(
    Math.round((crop.y + crop.height) * image.height),
    originY + 1,
    image.height
  );
  return { originX, originY, width: right - originX, height: bottom - originY };
}
