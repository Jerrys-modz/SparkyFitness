import { addDays } from '@workspace/shared';

export const HEATMAP_PERIODS = ['30d', '90d', '1y', 'all'] as const;
export type HeatmapPeriod = (typeof HEATMAP_PERIODS)[number];

/** First day of a period ending `today`, or undefined for all time. */
export const heatmapPeriodStart = (
  period: HeatmapPeriod,
  today: string
): string | undefined =>
  period === '30d'
    ? addDays(today, -29)
    : period === '90d'
      ? addDays(today, -89)
      : period === '1y'
        ? addDays(today, -364)
        : undefined;
