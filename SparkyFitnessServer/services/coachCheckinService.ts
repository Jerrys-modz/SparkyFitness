import {
  addDays,
  BUILTIN_COACH_ID_PREFIX,
  COACH_CHECKINS_MAX_PER_DAY,
  evaluateCoachTriggers,
  findBuiltinCoach,
  todayInZone,
  type CoachCheckinSettings,
  type CoachTrigger,
  type CoachTriggerType,
} from '@workspace/shared';
import { z } from 'zod';
import {
  dispatchAiRequest,
  type JsonSchemaNode,
} from '../ai/providerDispatch.js';
import { log } from '../config/logging.js';
import chatRepository from '../models/chatRepository.js';
import * as repository from '../models/coachCheckinRepository.js';
import coachRepository from '../models/coachRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import { resolveIsAdminByUserId } from '../utils/adminCheck.js';
import { describeError } from '../utils/errors.js';
import { resolveAiNetworkPolicy } from '../utils/outboundUrlPolicy.js';
import { isShuttingDown } from '../utils/shutdownHooks.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import {
  formatAssistantMemory,
  loadAssistantMemory,
} from './assistantMemoryService.js';
import goalService from './goalService.js';

/**
 * Coach check-ins (#2013): once a day, from the hour the person chose, the
 * shared trigger rules look at their finished days and the coaches they
 * switched on may leave a short message. Rules decide whether there is
 * something to say; the person's AI service only words it, and only when they
 * asked for that.
 */

// A coach does not repeat the same observation within this many days, so a
// pattern that persists is mentioned once, not every morning.
const TRIGGER_COOLDOWN_DAYS: Record<CoachTriggerType, number> = {
  low_protein_after_training: 3,
  short_sleep_under_load: 3,
  logging_gap: 1,
  streak_milestone: 1,
};

// What happened, in English, for the AI service that words the message.
const TRIGGER_DESCRIPTIONS: Record<
  CoachTriggerType,
  (facts: Record<string, number>) => string
> = {
  low_protein_after_training: (facts) =>
    `Yesterday the user trained and logged ${facts.protein} g of protein against a daily goal of ${facts.goal} g.`,
  short_sleep_under_load: (facts) =>
    `The user slept ${facts.hours} hours last night and logged ${facts.workouts} workouts in the three days before.`,
  logging_gap: (facts) =>
    `The user has not logged anything for ${facts.days} days.`,
  streak_milestone: (facts) =>
    `The user has logged something on ${facts.days} days in a row.`,
};

const WORDING_SCHEMA: JsonSchemaNode = {
  type: 'object',
  properties: { message: { type: 'string' } },
  required: ['message'],
  additionalProperties: false,
};
const wordingResponseSchema = z.object({
  message: z.string().trim().min(1).max(600),
});

/** The hour (0-23) it is right now in `tz`. */
export function hourInZone(tz: string, now: Date = new Date()): number {
  const hour = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    hourCycle: 'h23',
  }).format(now);
  return Number(hour) % 24;
}

function positiveOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function gatherTriggers(
  userId: string,
  today: string
): Promise<CoachTrigger[]> {
  const yesterday = addDays(today, -1);
  const [dayFacts, nutrition, goals] = await Promise.all([
    repository.getCheckinDayFacts(userId, today),
    coachRepository.getDayNutritionTotals(userId, yesterday),
    goalService.getUserGoals(userId, yesterday) as Promise<
      Record<string, unknown>
    >,
  ]);
  return evaluateCoachTriggers({
    today,
    loggedDays: dayFacts.loggedDays,
    yesterday: {
      foodEntries: nutrition.entry_count,
      proteinGrams: nutrition.protein,
      workouts: dayFacts.yesterdayWorkouts,
    },
    proteinGoalGrams: positiveOrNull(goals?.protein),
    lastNightSleepHours: dayFacts.lastNightSleepHours,
    workoutsLast3Days: dayFacts.workoutsLast3Days,
  });
}

/**
 * Asks the person's AI service to word one message. Null on any problem: the
 * apps then show their own sentence, so a check-in never depends on the AI.
 */
async function wordWithAi(
  userId: string,
  coachId: string,
  trigger: CoachTrigger
): Promise<string | null> {
  try {
    const setting = await chatRepository.getActiveAiServiceSetting(userId);
    const aiService = setting
      ? await chatRepository.getAiServiceSettingForBackend(setting.id, userId)
      : null;
    if (!aiService) return null;

    const [preferences, memory, isAdmin] = await Promise.all([
      preferenceRepository.getUserPreferences(userId),
      loadAssistantMemory(userId),
      resolveIsAdminByUserId(userId),
    ]);
    const coach = findBuiltinCoach(coachId);
    const result = await dispatchAiRequest({
      provider: {
        service_type: aiService.service_type,
        api_key: aiService.api_key ?? undefined,
        model_name: aiService.model_name ?? undefined,
        custom_url: aiService.custom_url ?? undefined,
      },
      networkPolicy: await resolveAiNetworkPolicy(aiService, isAdmin),
      prompt: [
        coach?.prompt ?? '',
        '',
        'Write one short check-in message to the user about the observation below: two sentences at most, kind, specific, with one optional next step. Use only the numbers given. No greeting, no sign-off, no medical advice.',
        `Write in the language with code "${preferences?.language || 'en'}".`,
        'Respond with JSON only: { "message": string }.',
        '',
        `Observation: ${TRIGGER_DESCRIPTIONS[trigger.type](trigger.facts)}`,
        '',
        'What the user told you about themselves:',
        formatAssistantMemory(memory) || '- (nothing saved)',
      ].join('\n'),
      jsonSchema: WORDING_SCHEMA,
      schemaName: 'coach_checkin',
    });
    if (!result.ok) {
      log(
        'warn',
        `Coach check-in: AI wording failed for user ${userId} (${result.category}): ${result.detail}`
      );
      return null;
    }
    const parsed = wordingResponseSchema.safeParse(result.json);
    return parsed.success ? parsed.data.message : null;
  } catch (error) {
    log('warn', 'Coach check-in: AI wording failed:', describeError(error));
    return null;
  }
}

/**
 * Evaluates one person's day and writes what their coaches have to say.
 * Returns how many messages were written. Safe to run again for the same
 * day: a message is unique per coach, trigger and day.
 */
export async function runCheckinForUser(
  userId: string,
  settings: CoachCheckinSettings,
  today: string
): Promise<number> {
  if (!settings.enabled || settings.coach_ids.length === 0) return 0;

  let remaining =
    COACH_CHECKINS_MAX_PER_DAY -
    (await repository.countMessagesOnDay(userId, today));
  if (remaining <= 0) return 0;

  const triggers = await gatherTriggers(userId, today);
  let created = 0;
  for (const trigger of triggers) {
    if (remaining <= 0) break;
    const coachId = `${BUILTIN_COACH_ID_PREFIX}${trigger.coachKey}`;
    if (!settings.coach_ids.includes(coachId)) continue;
    if (
      await repository.hasRecentMessage(
        userId,
        coachId,
        trigger.type,
        today,
        TRIGGER_COOLDOWN_DAYS[trigger.type]
      )
    ) {
      continue;
    }
    const text = settings.ai_wording
      ? await wordWithAi(userId, coachId, trigger)
      : null;
    if (await repository.insertMessage(userId, coachId, trigger, today, text)) {
      created++;
      remaining--;
    }
  }
  return created;
}

/** The "check now" button: today's check for the signed-in person. */
export async function checkNow(userId: string): Promise<number> {
  const settings = await repository.getSettings(userId);
  const today = todayInZone(await loadUserTimezone(userId));
  return runCheckinForUser(userId, settings, today);
}

/**
 * The scheduled check. For everyone with check-ins on, once their chosen hour
 * has come and their day has not been evaluated yet, it claims the day and
 * runs their check. One person's failure never stops the others.
 */
export async function runScheduledCoachCheckins(
  now: Date = new Date()
): Promise<void> {
  const due = await repository.listEnabledCheckins();
  let written = 0;
  for (const checkin of due) {
    if (isShuttingDown()) break;
    try {
      const tz = await loadUserTimezone(checkin.user_id);
      const today = todayInZone(tz);
      if (hourInZone(tz, now) < checkin.checkin_hour) continue;
      if (checkin.last_evaluated_day && checkin.last_evaluated_day >= today) {
        continue;
      }
      if (!(await repository.claimEvaluationDay(checkin.user_id, today))) {
        continue;
      }
      written += await runCheckinForUser(checkin.user_id, checkin, today);
    } catch (error) {
      log(
        'error',
        `Coach check-in failed for user ${checkin.user_id}:`,
        describeError(error)
      );
    }
  }
  const removed = await repository.deleteOldMessages();
  if (written > 0 || removed > 0) {
    log(
      'info',
      `[CRON] Coach check-ins: ${written} message(s) written, ${removed} old message(s) removed.`
    );
  }
}
