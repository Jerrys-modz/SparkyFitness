import { SEGMENT_MAX_LENGTH_M, SEGMENT_MIN_LENGTH_M } from '@workspace/shared';

export interface SegmentRange {
  startM: number;
  endM: number;
}

/** How far a nudge button moves a handle, in metres. */
export const SEGMENT_NUDGE_M = 50;

/** Whether a line this long can hold a segment at all. */
export function canMakeSegment(totalM: number): boolean {
  return totalM >= SEGMENT_MIN_LENGTH_M;
}

/**
 * The stretch offered first: the middle of the line, a third to two thirds,
 * widened to the minimum length on a short line and clamped to the maximum.
 */
export function defaultSegmentRange(totalM: number): SegmentRange {
  const length = Math.min(
    SEGMENT_MAX_LENGTH_M,
    Math.max(SEGMENT_MIN_LENGTH_M, totalM / 3)
  );
  const startM = Math.max(0, Math.min(totalM - length, totalM / 3));
  return { startM, endM: Math.min(totalM, startM + length) };
}

/**
 * Applies a drag to one handle. The handle stays on the line, the two never
 * come closer than the minimum length, and the stretch never grows past the
 * maximum (the other handle is left where it is and the dragged one stops).
 */
export function moveSegmentHandle(
  range: SegmentRange,
  handle: 'start' | 'end',
  toM: number,
  totalM: number
): SegmentRange {
  if (handle === 'start') {
    const lo = Math.max(0, range.endM - SEGMENT_MAX_LENGTH_M);
    const hi = Math.max(lo, range.endM - SEGMENT_MIN_LENGTH_M);
    return { startM: Math.min(hi, Math.max(lo, toM)), endM: range.endM };
  }
  const lo = Math.min(totalM, range.startM + SEGMENT_MIN_LENGTH_M);
  const hi = Math.min(totalM, range.startM + SEGMENT_MAX_LENGTH_M);
  return { startM: range.startM, endM: Math.max(lo, Math.min(hi, toM)) };
}

/** Moves a handle by a whole nudge in either direction. */
export function nudgeSegmentHandle(
  range: SegmentRange,
  handle: 'start' | 'end',
  direction: -1 | 1,
  totalM: number
): SegmentRange {
  const from = handle === 'start' ? range.startM : range.endM;
  return moveSegmentHandle(
    range,
    handle,
    from + direction * SEGMENT_NUDGE_M,
    totalM
  );
}

export function segmentRangeLength(range: SegmentRange): number {
  return Math.max(0, range.endM - range.startM);
}

/** Position of a handle along a bar, 0 to 1. */
export function handleFraction(valueM: number, totalM: number): number {
  return totalM > 0 ? Math.min(1, Math.max(0, valueM / totalM)) : 0;
}

/** Distance along the line for a touch at `x` on a bar `width` wide. */
export function distanceAtBarPosition(
  x: number,
  width: number,
  totalM: number
): number {
  if (width <= 0) return 0;
  return Math.min(1, Math.max(0, x / width)) * totalM;
}
