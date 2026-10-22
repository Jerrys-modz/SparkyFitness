import type { TFunction } from 'i18next';
import type { RouteGhost } from '@workspace/shared';

/**
 * Seconds the best run over a route had spent when it had covered
 * `distanceM` metres of a route `routeDistanceM` long, read off its pace line
 * (one entry per `intervalM`, the last one the finish). Null when there is no
 * usable pace line, the distance is not a number, or the route is done.
 */
export function ghostSecondsAt(
  ghost: RouteGhost,
  routeDistanceM: number,
  distanceM: number
): number | null {
  const { splits, intervalM } = ghost;
  if (
    splits.length === 0 ||
    !(intervalM > 0) ||
    !(routeDistanceM > 0) ||
    !Number.isFinite(distanceM) ||
    distanceM <= 0 ||
    distanceM >= routeDistanceM
  ) {
    return null;
  }
  const index = Math.min(Math.floor(distanceM / intervalM), splits.length - 1);
  const from = index === 0 ? 0 : splits[index - 1];
  const fromM = index * intervalM;
  const toM = Math.min((index + 1) * intervalM, routeDistanceM);
  const span = toM - fromM;
  if (!(span > 0)) return splits[index];
  const share = Math.min(1, Math.max(0, (distanceM - fromM) / span));
  return from + (splits[index] - from) * share;
}

/**
 * How far ahead of (positive) or behind (negative) the best run you are, in
 * whole seconds, at `distanceM` metres with `activeSeconds` on the clock.
 */
export function ghostLead(
  ghost: RouteGhost | null,
  routeDistanceM: number,
  distanceM: number,
  activeSeconds: number
): number | null {
  if (!ghost || !Number.isFinite(activeSeconds) || activeSeconds < 0) {
    return null;
  }
  const target = ghostSecondsAt(ghost, routeDistanceM, distanceM);
  return target === null ? null : Math.round(target - activeSeconds);
}

/** "12 s", or "1:05" from a minute up. */
export function raceTimeText(seconds: number): string {
  const whole = Math.round(Math.abs(seconds));
  if (whole < 60) return `${whole} s`;
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export interface RaceLabel {
  text: string;
  /** Level with or ahead of the best run, or behind it. */
  tone: 'ahead' | 'behind';
}

/** "Ahead 12 s" / "Behind 8 s" for a signed lead, or null without one. */
export function raceLabel(
  leadSeconds: number | null | undefined,
  t: TFunction
): RaceLabel | null {
  if (leadSeconds == null || !Number.isFinite(leadSeconds)) return null;
  if (leadSeconds === 0) {
    return {
      text: t('routes.ghost.even', {
        defaultValue: 'Even with your best time',
      }),
      tone: 'ahead',
    };
  }
  const time = raceTimeText(leadSeconds);
  return leadSeconds > 0
    ? {
        text: t('routes.ghost.ahead', {
          defaultValue: 'Ahead {{time}}',
          time,
        }),
        tone: 'ahead',
      }
    : {
        text: t('routes.ghost.behind', {
          defaultValue: 'Behind {{time}}',
          time,
        }),
        tone: 'behind',
      };
}
