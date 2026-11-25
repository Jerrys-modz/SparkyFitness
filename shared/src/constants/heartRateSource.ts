import { z } from 'zod';

/**
 * Where a live workout's heart rate was measured: the paired watch, or
 * headphones with a sensor (AirPods Pro 3) read through the phone. Stored on
 * `exercise_entries.hr_source`; null means unknown (synced or manual entries).
 * Labels live in each app's translation catalog (`heartRateSource.<key>`).
 */
export const HEART_RATE_SOURCES = ['watch', 'headphones'] as const;

export type HeartRateSource = (typeof HEART_RATE_SOURCES)[number];

export const heartRateSourceSchema = z.enum(HEART_RATE_SOURCES);
