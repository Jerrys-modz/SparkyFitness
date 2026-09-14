import { tool } from 'ai';
import {
  todayInZone,
  utcToLocalDateTimeInput,
  type CaffeineActiveResponse,
} from '@workspace/shared';
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

// The service computes on UTC instants (doses[].at, bedtime_at) so its own
// math stays timezone-agnostic — but hands a model a bare UTC instant, and
// it has no reliable way to convert that to the user's local time itself
// (it isn't told the offset, and doing UTC arithmetic in prose is exactly
// the kind of thing models get wrong, which is what produced the wrong
// times reported back to the user). Replace every instant with the same
// local HH:MM the web UI already renders via toLocaleTimeString(), so the
// model only ever echoes an already-correct string.
interface CaffeineKineticsForChat extends Omit<
  CaffeineActiveResponse,
  'doses' | 'bedtime_at'
> {
  doses: Array<{
    at_local: string;
    mg: number;
    name?: string;
    is_estimated?: boolean;
  }>;
}

function toLocalDisplayTimes(
  data: CaffeineActiveResponse,
  tz: string
): CaffeineKineticsForChat {
  const { doses, bedtime_at: _bedtimeAt, ...rest } = data;
  return {
    ...rest,
    doses: doses.map(({ at, ...doseRest }) => ({
      ...doseRest,
      at_local: utcToLocalDateTimeInput(at, tz).split('T')[1] ?? '',
    })),
  };
}

export function buildCaffeineKineticsTools(userId: string, tz: string) {
  return {
    sparky_get_caffeine_kinetics: tool({
      description:
        "Estimates the user's active caffeine right now and at their target bedtime, from their logged caffeine intake plus their personal half-life and target-bedtime preferences (caffeine_half_life_hours, target_bedtime). Also reports the latest time a dose of a given size could still be taken and clear by bedtime. Defaults to today. Read-only. Every time in the result (doses[].at_local, latest_safe_dose_time, target_bedtime) is already in the user's local time as HH:MM — use it exactly as given. Do not attempt to convert or recompute a time yourself.",
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
              return formatJsonResult(toLocalDisplayTimes(data, tz));
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
