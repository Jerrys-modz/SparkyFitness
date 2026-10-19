import { z } from 'zod';

export const MOOD_RATING_MIN = 1;
export const MOOD_RATING_MAX = 5;

export const moodRatingSchema = z
  .number()
  .int()
  .min(MOOD_RATING_MIN)
  .max(MOOD_RATING_MAX);

// Optional energy and focus ratings on a mood entry. An absent key means "keep
// the stored value"; an explicit null means "clear it".
export const moodRatingsBodySchema = z.object({
  energy_value: moodRatingSchema.nullable().optional(),
  focus_value: moodRatingSchema.nullable().optional(),
});

export type MoodRatingsBody = z.infer<typeof moodRatingsBodySchema>;
