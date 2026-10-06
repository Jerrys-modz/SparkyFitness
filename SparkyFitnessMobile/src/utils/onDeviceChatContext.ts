import type { DailySummary } from '../types/dailySummary';

/** Past turns kept in the prompt; the model's window is small. */
export const MAX_CHAT_TURNS = 8;
const MAX_FOODS = 25;
/** Characters kept of an earlier turn, of the newest, and of the whole transcript. */
export const MAX_TURN_CHARS = 400;
/**
 * Characters kept of an earlier assistant reply. Replies from a server
 * provider are long and confident; a small model that sees them whole copies
 * their wording instead of answering from the numbers.
 */
export const MAX_ASSISTANT_TURN_CHARS = 200;
export const MAX_LAST_TURN_CHARS = 1200;
export const MAX_TRANSCRIPT_CHARS = 2400;

export interface OnDeviceChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

const round = (n: number | undefined | null): number => Math.round(n ?? 0);

/** "20 g over" / "35 g left": the arithmetic is done here, not by the model. */
function macroLine(
  label: string,
  macro: { consumed: number; goal: number } | undefined
): string {
  const eaten = round(macro?.consumed);
  const goal = round(macro?.goal);
  if (goal <= 0) return `${label}: ${eaten} g eaten, no goal set.`;
  const diff = goal - eaten;
  return `${label}: ${eaten} g eaten, goal ${goal} g (${
    diff >= 0 ? `${diff} g left` : `${-diff} g over`
  }).`;
}

/**
 * A short plain-text snapshot of a day for the model, built from the same
 * summary the dashboard shows so the figures agree with it. Every sum and
 * difference is worked out here: the small model gets the calorie balance and
 * what is left as finished numbers, because it gets its own arithmetic wrong.
 */
export function buildChatContext(
  summary: DailySummary | null,
  date: string
): string {
  if (!summary) return `Date: ${date}. No diary data is available.`;
  const balance = summary.calorieBalance;
  const remaining = round(balance.remaining);
  const lines = [
    `Date: ${date}.`,
    `Calorie goal: ${round(balance.goal)} kcal. Eaten: ${round(balance.eaten)} kcal. Burned by exercise: ${round(balance.burned)} kcal.`,
    remaining >= 0
      ? `Calories remaining: ${remaining} kcal.`
      : `Calories remaining: 0 kcal (over the goal by ${-remaining} kcal).`,
    macroLine('Protein', summary.protein),
    macroLine('Carbs', summary.carbs),
    macroLine('Fat', summary.fat),
    `Water: ${round(summary.waterConsumed)} ml.`,
  ];
  const foods = summary.foodEntries ?? [];
  if (foods.length > 0) {
    lines.push('Foods logged:');
    for (const f of foods.slice(0, MAX_FOODS)) {
      lines.push(
        `- ${f.meal_type}: ${f.food_name ?? 'Food'} (${round(f.calories)} kcal, ${round(f.protein)} g protein)`
      );
    }
    if (foods.length > MAX_FOODS) {
      lines.push(`- and ${foods.length - MAX_FOODS} more`);
    }
  } else {
    lines.push('No food has been logged.');
  }
  const workouts = summary.exerciseEntries ?? [];
  if (workouts.length > 0) {
    lines.push(`Workouts: ${workouts.map((w) => w.name).join(', ')}.`);
  }
  return lines.join('\n');
}

/** The most recent turns, oldest first, as the "Name: text" transcript. */
export function buildChatTranscript(turns: OnDeviceChatTurn[]): string {
  const recent = turns.slice(-MAX_CHAT_TURNS);
  const lines = recent.map((t, index) => {
    // Earlier turns can be long (a coaching answer from another provider):
    // keep their start only. The newest message is kept almost whole.
    const earlierLimit =
      t.role === 'assistant' ? MAX_ASSISTANT_TURN_CHARS : MAX_TURN_CHARS;
    const limit =
      index === recent.length - 1 ? MAX_LAST_TURN_CHARS : earlierLimit;
    const text =
      t.text.length > limit ? `${t.text.slice(0, limit - 1)}…` : t.text;
    return `${t.role === 'user' ? 'User' : 'Assistant'}: ${text}`;
  });
  // The window is small, so drop the oldest turns until the rest fits.
  let total = lines.reduce((sum, line) => sum + line.length + 1, 0);
  while (lines.length > 1 && total > MAX_TRANSCRIPT_CHARS) {
    total -= (lines.shift() ?? '').length + 1;
  }
  return lines.join('\n');
}
