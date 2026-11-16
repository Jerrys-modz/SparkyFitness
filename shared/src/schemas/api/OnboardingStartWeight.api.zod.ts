import { z } from 'zod';

/**
 * `GET /api/onboarding/start-weight`: the weight given in the setup wizard and
 * the day it was given (profile timezone). Both null when there is none. Weight
 * progress uses it as the starting weight when it predates every weigh-in.
 */
export const onboardingStartWeightResponseSchema = z.object({
  /** kg. */
  weightKg: z.number().positive().nullable(),
  /** YYYY-MM-DD. */
  date: z.iso.date().nullable(),
});

export type OnboardingStartWeightResponse = z.infer<
  typeof onboardingStartWeightResponseSchema
>;
