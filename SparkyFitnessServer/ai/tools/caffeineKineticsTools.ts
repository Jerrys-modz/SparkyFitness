import { tool } from 'ai';
import { todayInZone } from '@workspace/shared';
import { log } from '../../config/logging.js';
import { getActiveCaffeineKinetics } from '../../services/caffeineKineticsService.js';
import { ERRORS, formatZodError } from './errors.js';
import { formatJsonResult } from './formatting.js';
import { normalizeActionArgs } from './dates.js';
import {
  CAFFEINE_KINETICS_ACTIONS,
  caffeineKineticsSchema,
  caffeineKineticsInput,
  type CaffeineKineticsInput,
} from './schemas/caffeineKinetics.js';

const VALID_ACTIONS = [...CAFFEINE_KINETICS_ACTIONS];

export function buildCaffeineKineticsTools(userId: string, tz: string) {
  return {
    sparky_get_caffeine_kinetics: tool({
      description:
        "Estimates the user's active caffeine right now and at their target bedtime, from their logged caffeine intake plus their personal half-life and target-bedtime preferences (caffeine_half_life_hours, target_bedtime). Also reports the latest time a dose of a given size could still be taken and clear by bedtime. Defaults to today. Read-only.",
      inputSchema: caffeineKineticsInput,
      execute: async (rawArgs) => {
        const normalized = normalizeActionArgs(
          rawArgs as Record<string, unknown>,
          tz,
          VALID_ACTIONS,
          () => 'active_caffeine'
        );
        const parsed = caffeineKineticsSchema.safeParse(normalized);
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        const args: CaffeineKineticsInput = parsed.data;
        try {
          switch (args.action) {
            case 'active_caffeine': {
              const date = args.date ?? todayInZone(tz);
              const data = await getActiveCaffeineKinetics(userId, {
                date,
                doseMg: args.dose_mg,
              });
              return formatJsonResult(data);
            }
            default:
              return ERRORS.INVALID_ACTION(
                String((args as CaffeineKineticsInput).action),
                VALID_ACTIONS
              );
          }
        } catch (error) {
          log('error', '[Caffeine Kinetics Tool] Error:', error);
          return ERRORS.DB_ERROR(error);
        }
      },
    }),
  };
}
