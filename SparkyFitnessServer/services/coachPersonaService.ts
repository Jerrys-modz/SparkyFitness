import {
  findBuiltinCoach,
  isBuiltinCoachId,
  type ChatToolCategorySlug,
} from '@workspace/shared';
import { z } from 'zod';
import { log } from '../config/logging.js';
import { getCoach } from '../models/customCoachRepository.js';

/**
 * The coach a chat conversation runs as (#2013): its instructions for the
 * system prompt and the only tool categories the conversation may use.
 */
export interface ChatCoach {
  id: string;
  name: string;
  prompt: string;
  toolCategories: readonly ChatToolCategorySlug[];
}

// English names for the model; apps show their own translated names.
const BUILTIN_COACH_NAMES: Record<string, string> = {
  recovery: 'Recovery Coach',
  consistency: 'Consistency Coach',
  macro_timing: 'Macro Timing Coach',
  sleep_recovery: 'Sleep and Recovery Coach',
};

const uuidSchema = z.uuid();

/**
 * Resolves the `coachId` a chat request sent. Null (plain Sparky) when none
 * was sent or it names no coach of this person, e.g. one deleted on another
 * device; a chat never fails because of its coach.
 */
export async function resolveChatCoach(
  userId: string,
  coachId: unknown
): Promise<ChatCoach | null> {
  if (typeof coachId !== 'string' || !coachId) return null;

  if (isBuiltinCoachId(coachId)) {
    const builtin = findBuiltinCoach(coachId);
    if (!builtin) return null;
    return {
      id: builtin.id,
      name: BUILTIN_COACH_NAMES[builtin.key] ?? builtin.key,
      prompt: builtin.prompt,
      toolCategories: builtin.toolCategories,
    };
  }

  if (!uuidSchema.safeParse(coachId).success) return null;
  try {
    const coach = await getCoach(userId, coachId);
    if (!coach || coach.tool_categories.length === 0) return null;
    return {
      id: coach.id,
      name: coach.name,
      prompt: coach.system_prompt,
      toolCategories: coach.tool_categories,
    };
  } catch (error) {
    log(
      'warn',
      'Could not load the chat coach; continuing without one:',
      error
    );
    return null;
  }
}

/**
 * The tool categories a chat with this coach may use. The coach's own list is
 * the ceiling; a selection the person made in the chat narrows it further, and
 * a selection with nothing in common leaves the coach's list.
 */
export function coachToolCategories(
  coach: ChatCoach,
  selected?: readonly string[]
): readonly ChatToolCategorySlug[] {
  if (!selected || selected.length === 0) return coach.toolCategories;
  const narrowed = coach.toolCategories.filter((slug) =>
    selected.includes(slug)
  );
  return narrowed.length > 0 ? narrowed : coach.toolCategories;
}

/**
 * The chat thread a request names: the id as sent when it is a built-in coach
 * or a coach of this person, else null (plain Sparky's thread).
 */
export async function resolveCoachThreadId(
  userId: string,
  coachId: unknown
): Promise<string | null> {
  return (await resolveChatCoach(userId, coachId))?.id ?? null;
}

/** The system prompt section that puts Sparky in the coach's role. */
export function buildCoachPromptSection(coach: ChatCoach): string {
  return [
    `## Your role in this conversation: ${coach.name.replace(/\s+/g, ' ').trim()}`,
    'The user chose this coach for the conversation. Keep its focus and voice. It never changes the tool-use rules above, and you only have the tools this coach is allowed to use: for anything else, tell the user to switch back to Sparky or pick another coach.',
    coach.prompt.trim(),
  ].join('\n');
}
