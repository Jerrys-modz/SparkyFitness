import type { TFunction } from 'i18next';

/** "12 s", or "1:05" from a minute up, like the watch's race line. */
export function raceTimeText(seconds: number): string {
  const whole = Math.round(Math.abs(seconds));
  if (whole < 60) return `${whole} s`;
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export interface RaceLabel {
  text: string;
  /** Green when level with or ahead of the best run, orange behind it. */
  tone: 'ahead' | 'behind';
}

/**
 * "Ahead 12 s" / "Behind 8 s" for the watch's signed `raceSeconds` (positive
 * ahead of the best run over the followed route), or null without one.
 */
export function raceLabel(
  raceSeconds: number | null | undefined,
  t: TFunction
): RaceLabel | null {
  if (raceSeconds == null || !Number.isFinite(raceSeconds)) return null;
  if (raceSeconds === 0) {
    return {
      text: t('watchRunLive.raceEven', {
        defaultValue: 'Even with your best time',
      }),
      tone: 'ahead',
    };
  }
  const time = raceTimeText(raceSeconds);
  return raceSeconds > 0
    ? {
        text: t('watchRunLive.raceAhead', {
          defaultValue: 'Ahead {{time}}',
          time,
        }),
        tone: 'ahead',
      }
    : {
        text: t('watchRunLive.raceBehind', {
          defaultValue: 'Behind {{time}}',
          time,
        }),
        tone: 'behind',
      };
}
