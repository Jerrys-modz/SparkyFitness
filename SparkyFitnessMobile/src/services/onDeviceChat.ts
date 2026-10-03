import OnDeviceNutritionModule from '../../modules/on-device-nutrition';
import { fetchDailySummary } from './api/dailySummaryApi';
import type { DailySummaryApiResponse } from './api/dailySummaryApi';
import { addLog } from './LogService';
import { isOnDeviceLabelScanAvailable } from './onDeviceLabelScan';
import { getTodayDate } from '../utils/dateUtils';

/** Past turns kept in the prompt; the model's window is small. */
export const MAX_CHAT_TURNS = 8;
const MAX_FOODS = 25;

export interface OnDeviceChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

export function isOnDeviceChatAvailable(): boolean {
  return (
    typeof OnDeviceNutritionModule?.chat === 'function' &&
    isOnDeviceLabelScanAvailable()
  );
}

const round = (n: number | undefined | null): number => Math.round(n ?? 0);

/**
 * A short plain-text snapshot of today for the model: goals against what has
 * been eaten, the food list, water and workouts. Read-only; nothing here is
 * written back anywhere.
 */
export function buildChatContext(
  summary: DailySummaryApiResponse | null,
  date: string
): string {
  if (!summary) return `Today is ${date}. No diary data is available.`;
  const foods = summary.foodEntries ?? [];
  const eaten = foods.reduce(
    (t, f) => ({
      calories: t.calories + (f.calories ?? 0),
      protein: t.protein + (f.protein ?? 0),
      carbs: t.carbs + (f.carbs ?? 0),
      fat: t.fat + (f.fat ?? 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
  const goals = summary.goals;
  const lines = [
    `Today is ${date}.`,
    `Calories: ${round(eaten.calories)} eaten of a ${round(goals?.calories)} kcal goal.`,
    `Protein: ${round(eaten.protein)} g of ${round(goals?.protein)} g. Carbs: ${round(eaten.carbs)} g of ${round(goals?.carbs)} g. Fat: ${round(eaten.fat)} g of ${round(goals?.fat)} g.`,
    `Water: ${round(summary.waterIntake)} ml.`,
  ];
  if (foods.length > 0) {
    lines.push('Foods logged today:');
    for (const f of foods.slice(0, MAX_FOODS)) {
      lines.push(
        `- ${f.meal_type}: ${f.food_name ?? 'Food'} (${round(f.calories)} kcal, ${round(f.protein)} g protein)`
      );
    }
    if (foods.length > MAX_FOODS) {
      lines.push(`- and ${foods.length - MAX_FOODS} more`);
    }
  } else {
    lines.push('No food has been logged today.');
  }
  const workouts = summary.exerciseSessions ?? [];
  if (workouts.length > 0) {
    lines.push(`Workouts today: ${workouts.map((w) => w.name).join(', ')}.`);
  }
  return lines.join('\n');
}

/** The most recent turns, oldest first, as the "Name: text" transcript. */
export function buildChatTranscript(turns: OnDeviceChatTurn[]): string {
  return turns
    .slice(-MAX_CHAT_TURNS)
    .map((t) => `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.text}`)
    .join('\n');
}

export async function askOnDeviceChat(
  turns: OnDeviceChatTurn[]
): Promise<string> {
  if (!OnDeviceNutritionModule?.chat) {
    throw new Error('On-device chat is not available');
  }
  const date = getTodayDate();
  let summary: DailySummaryApiResponse | null = null;
  try {
    summary = await fetchDailySummary(date);
  } catch (error) {
    addLog(
      `On-device chat could not load today's summary: ${error}`,
      'WARNING'
    );
  }
  return OnDeviceNutritionModule.chat(
    buildChatTranscript(turns),
    buildChatContext(summary, date)
  );
}
