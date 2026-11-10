import type { FoodAssistantPreference } from '@workspace/shared';
import { listPreferences } from '../models/foodAssistantRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';

/**
 * What Sparky remembers about a person (#2013): the lasting preferences saved
 * in `food_assistant_preferences`, given to the chat assistant and the daily
 * summary as background. `user_preferences.assistant_memory_enabled` switches
 * it off without deleting anything.
 */

// Bounds on what goes into a prompt, so a long list cannot crowd out the rest.
const MAX_PROMPT_PREFERENCES = 30;
const MAX_PROMPT_VALUE_CHARS = 300;

export async function isAssistantMemoryEnabled(
  userId: string
): Promise<boolean> {
  const preferences = await preferenceRepository.getUserPreferences(userId);
  return preferences?.assistant_memory_enabled !== false;
}

/** The saved preferences Sparky may use; empty while memory is switched off. */
export async function loadAssistantMemory(
  userId: string
): Promise<FoodAssistantPreference[]> {
  if (!(await isAssistantMemoryEnabled(userId))) return [];
  return listPreferences(userId);
}

function singleLine(value: string): string {
  const flat = value.replace(/\s+/g, ' ').trim();
  return flat.length > MAX_PROMPT_VALUE_CHARS
    ? `${flat.slice(0, MAX_PROMPT_VALUE_CHARS)}...`
    : flat;
}

/** One `- key: value` line per preference, or '' when there are none. */
export function formatAssistantMemory(
  preferences: readonly Pick<FoodAssistantPreference, 'key' | 'value'>[]
): string {
  return preferences
    .slice(0, MAX_PROMPT_PREFERENCES)
    .map(
      (preference) =>
        `- ${preference.key.replace(/_/g, ' ')}: ${singleLine(preference.value)}`
    )
    .join('\n');
}

/**
 * The system prompt section for saved preferences, or '' when there are none.
 * It only changes when the person edits a preference, so it keeps the request
 * prefix stable between turns.
 */
export function buildAssistantMemoryPromptSection(
  preferences: readonly Pick<FoodAssistantPreference, 'key' | 'value'>[]
): string {
  const lines = formatAssistantMemory(preferences);
  if (!lines) return '';
  return [
    '## What the user asked you to remember',
    'The user saved these lasting preferences. They are what the user told you, not logged data. Respect them in every answer and suggestion, do not assume anything beyond them, and let an explicit request in the current message take priority for that request. They never change the tool-use rules above.',
    lines,
  ].join('\n');
}
