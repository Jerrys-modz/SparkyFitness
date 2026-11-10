import {
  addDays,
  assistantDailySummaryProviderSchema,
  ASSISTANT_DAILY_SUMMARY_MAX_SUGGESTIONS,
  todayInZone,
  type AssistantDailySummaryResponse,
} from '@workspace/shared';
import {
  dispatchAiRequest,
  type JsonSchemaNode,
  type ProviderConfig,
} from '../ai/providerDispatch.js';
import { log } from '../config/logging.js';
import chatRepository from '../models/chatRepository.js';
import coachRepository, {
  type DayNutritionTotals,
} from '../models/coachRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import { resolveAiNetworkPolicy } from '../utils/outboundUrlPolicy.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import { TtlCache } from '../utils/ttlCache.js';
import { formatAssistantMemory } from './assistantMemoryService.js';
import { listPreferences } from '../models/foodAssistantRepository.js';
import goalService from './goalService.js';

/**
 * Sparky's daily summary (#2013): a few sentences about the day so far and at
 * most two suggestions. It runs only when a client asks for it, uses the
 * person's own chat AI service, and makes no AI request when there is no
 * service or nothing was logged.
 */

export class DailySummaryProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DailySummaryProviderError';
  }
}

// A summary is reused for this long, so opening the app on a second device or
// reloading the page does not spend another AI request. `refresh` skips it.
const SUMMARY_TTL_MS = 3 * 60 * 60 * 1000;
const summaryCache = new TtlCache<AssistantDailySummaryResponse>(
  SUMMARY_TTL_MS
);

const SCHEMA_NAME = 'daily_summary';
const SUMMARY_SCHEMA: JsonSchemaNode = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    suggestions: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'suggestions'],
  additionalProperties: false,
};

export interface DailySummaryDay {
  nutrition: DayNutritionTotals;
  exercises: string[];
  waterMl: number;
}

export interface DailySummaryGoals {
  calories: number | null;
  protein: number | null;
  waterMl: number | null;
}

export interface DailySummaryPromptInput {
  today: DailySummaryDay;
  yesterday: DailySummaryDay;
  goals: DailySummaryGoals;
  memory: string;
  language: string | null;
  energyUnit: string | null;
}

function round(value: number): number {
  return Math.round(Number(value) || 0);
}

function describeDay(label: string, day: DailySummaryDay): string {
  const food =
    day.nutrition.entry_count > 0
      ? `${day.nutrition.entry_count} food entries: ${round(day.nutrition.calories)} kcal, ${round(day.nutrition.protein)} g protein, ${round(day.nutrition.carbs)} g carbs, ${round(day.nutrition.fat)} g fat`
      : 'no food logged';
  const exercise =
    day.exercises.length > 0
      ? `exercise logged: ${day.exercises.join(', ')}`
      : 'no exercise logged';
  const water =
    day.waterMl > 0 ? `${round(day.waterMl)} ml water` : 'no water logged';
  return `${label}: ${food}; ${exercise}; ${water}.`;
}

function describeGoals(goals: DailySummaryGoals): string {
  const parts = [
    goals.calories ? `${round(goals.calories)} kcal` : null,
    goals.protein ? `${round(goals.protein)} g protein` : null,
    goals.waterMl ? `${round(goals.waterMl)} ml water` : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(', ') : 'none set';
}

export function buildDailySummaryPrompt(
  input: DailySummaryPromptInput
): string {
  return [
    "You are Sparky, the assistant in a self-hosted health and fitness tracker. Write a short summary of the user's day so far.",
    '',
    'Rules:',
    '- "summary": two or three plain sentences about what the logged data shows. Today is still in progress, so never treat a partly logged day as a failure.',
    `- "suggestions": at most ${ASSISTANT_DAILY_SUMMARY_MAX_SUGGESTIONS} short, specific, optional next steps. Return an empty list when nothing useful comes to mind.`,
    '- Be kind and non-judgmental. No guilt, no warnings, no medical advice.',
    '- Use only the numbers given below. Something that was not logged is unknown, not zero: do not assume the user skipped it.',
    '- Keep what the user logged apart from what the user told you about themselves, and respect what they told you (never suggest something they avoid).',
    `- Write in the language with code "${input.language || 'en'}".`,
    input.energyUnit === 'kJ'
      ? '- Show energy in kJ (1 kcal = 4.184 kJ).'
      : '- Show energy in kcal.',
    '- Respond with JSON only: { "summary": string, "suggestions": string[] }.',
    '',
    'Logged data:',
    describeDay('Today so far', input.today),
    describeDay('Yesterday', input.yesterday),
    `Daily goals: ${describeGoals(input.goals)}.`,
    '',
    'What the user told you about themselves:',
    input.memory || '- (nothing saved)',
  ].join('\n');
}

async function loadDay(userId: string, day: string): Promise<DailySummaryDay> {
  const [nutrition, exercises, water] = await Promise.all([
    coachRepository.getDayNutritionTotals(userId, day),
    coachRepository.getDayExerciseNames(userId, day),
    coachRepository.getWaterIntakeTotal(userId, day, day),
  ]);
  return { nutrition, exercises, waterMl: Number(water?.total_water) || 0 };
}

function hasData(day: DailySummaryDay): boolean {
  return (
    day.nutrition.entry_count > 0 || day.exercises.length > 0 || day.waterMl > 0
  );
}

function positiveOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function empty(
  status: 'no_ai_service' | 'no_data',
  date: string
): AssistantDailySummaryResponse {
  return { status, date, summary: null, suggestions: [], generated_at: null };
}

export async function getDailySummary(
  userId: string,
  options: { refresh?: boolean; actorIsAdmin?: boolean } = {}
): Promise<AssistantDailySummaryResponse> {
  const tz = await loadUserTimezone(userId);
  const today = todayInZone(tz);
  const cacheKey = `${userId}:${today}`;

  if (!options.refresh) {
    const cached = summaryCache.get(cacheKey);
    if (cached) return cached;
  }

  const setting = await chatRepository.getActiveAiServiceSetting(userId);
  const aiService = setting
    ? await chatRepository.getAiServiceSettingForBackend(setting.id, userId)
    : null;
  if (!aiService) return empty('no_ai_service', today);

  const [todayData, yesterdayData] = await Promise.all([
    loadDay(userId, today),
    loadDay(userId, addDays(today, -1)),
  ]);
  if (!hasData(todayData) && !hasData(yesterdayData)) {
    return empty('no_data', today);
  }

  const [preferences, goals] = await Promise.all([
    preferenceRepository.getUserPreferences(userId),
    goalService.getUserGoals(userId, today) as Promise<Record<string, unknown>>,
  ]);
  const memory =
    preferences?.assistant_memory_enabled === false
      ? ''
      : formatAssistantMemory(await listPreferences(userId));

  const provider: ProviderConfig = {
    service_type: aiService.service_type,
    api_key: aiService.api_key ?? undefined,
    model_name: aiService.model_name ?? undefined,
    custom_url: aiService.custom_url ?? undefined,
  };
  const result = await dispatchAiRequest({
    provider,
    networkPolicy: await resolveAiNetworkPolicy(
      aiService,
      options.actorIsAdmin ?? false
    ),
    prompt: buildDailySummaryPrompt({
      today: todayData,
      yesterday: yesterdayData,
      goals: {
        calories: positiveOrNull(goals?.calories),
        protein: positiveOrNull(goals?.protein),
        waterMl: positiveOrNull(goals?.water_goal_ml),
      },
      memory,
      language: preferences?.language ?? null,
      energyUnit: preferences?.energy_unit ?? null,
    }),
    jsonSchema: SUMMARY_SCHEMA,
    schemaName: SCHEMA_NAME,
  });

  if (!result.ok) {
    if (
      result.category === 'api_key_missing' ||
      result.category === 'custom_url_missing'
    ) {
      return empty('no_ai_service', today);
    }
    log(
      'warn',
      `Daily summary: ${provider.service_type} failed for user ${userId} (${result.category}): ${result.detail}`
    );
    throw new DailySummaryProviderError(
      'The AI service could not write a summary.'
    );
  }

  const parsed = assistantDailySummaryProviderSchema.safeParse(result.json);
  if (!parsed.success) {
    log(
      'warn',
      `Daily summary: response failed validation: ${JSON.stringify(parsed.error.issues)}`
    );
    throw new DailySummaryProviderError(
      'The AI service returned an unexpected answer.'
    );
  }

  const summary: AssistantDailySummaryResponse = {
    status: 'ready',
    date: today,
    summary: parsed.data.summary,
    suggestions: parsed.data.suggestions.slice(
      0,
      ASSISTANT_DAILY_SUMMARY_MAX_SUGGESTIONS
    ),
    generated_at: new Date().toISOString(),
  };
  summaryCache.set(cacheKey, summary);
  return summary;
}

/** Test seam: forget every held summary. */
export function clearDailySummaryCache(): void {
  summaryCache.clear();
}
