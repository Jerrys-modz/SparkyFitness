import OnDeviceNutritionModule, {
  type CloudChatStatus,
  type OnDeviceStatus,
} from '../../modules/on-device-nutrition';
import {
  buildDailySummary,
  loadDailySummaryRawData,
} from './dailySummaryService';
import type { DailySummary } from '../types/dailySummary';
import { addLog } from './LogService';
import { isOnDeviceLabelScanAvailable } from './onDeviceLabelScan';
import { getTodayDate } from '../utils/dateUtils';
import {
  buildChatContext,
  buildChatTranscript,
  type OnDeviceChatTurn,
} from '../utils/onDeviceChatContext';
import { resetChatToolState, runChatTool } from './onDeviceChatTools';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { useOnDeviceChatDebugStore } from '../stores/onDeviceChatDebugStore';

/** Every tool the model can be given, in the order they are declared. */
export const CHAT_TOOL_NAMES = [
  'getDaySummary',
  'searchFoods',
  'logFood',
  'logQuickFood',
  'logWater',
  'logWeight',
  'listFoodEntries',
  'deleteFoodEntry',
  'getHistory',
  'getFasting',
  'startFast',
  'endFast',
  'getSleep',
  'logExercise',
  'copyMeal',
] as const;

/** The built-in system prompt, or '' when this build has no native module. */
/** Why the on-device model can or cannot be used; 'unsupported' without the module. */
export function getOnDeviceStatus(): OnDeviceStatus {
  try {
    return OnDeviceNutritionModule?.onDeviceStatus?.() ?? 'unsupported';
  } catch {
    return 'unsupported';
  }
}

/** Whether Apple's private servers can answer chat right now. */
export function getCloudChatStatus(): CloudChatStatus {
  try {
    return OnDeviceNutritionModule?.cloudChatStatus?.() ?? 'unsupported';
  } catch {
    return 'unsupported';
  }
}

export function getDefaultChatInstructions(): string {
  try {
    return OnDeviceNutritionModule?.defaultChatInstructions?.() ?? '';
  } catch {
    return '';
  }
}

function trace(kind: 'prompt' | 'tool' | 'reply' | 'error', text: string) {
  if (useAppPreferencesStore.getState().onDeviceChatDebug) {
    useOnDeviceChatDebugStore.getState().add(kind, text);
  }
}

export {
  buildChatContext,
  buildChatTranscript,
  MAX_CHAT_TURNS,
} from '../utils/onDeviceChatContext';
export type { OnDeviceChatTurn };

export function isOnDeviceChatAvailable(): boolean {
  return (
    typeof OnDeviceNutritionModule?.chat === 'function' &&
    isOnDeviceLabelScanAvailable()
  );
}

let toolListenerAttached = false;

/** Answers the model's tool calls with the app's own APIs; attached once. */
function attachToolListener(): void {
  if (toolListenerAttached || !OnDeviceNutritionModule) return;
  toolListenerAttached = true;
  OnDeviceNutritionModule.addListener('onChatTool', (event) => {
    const started = Date.now();
    void runChatTool(event.name, event.args).then((result) => {
      trace(
        'tool',
        `${event.name}(${event.args}) -> ${result} [${Date.now() - started} ms]`
      );
      OnDeviceNutritionModule?.resolveChatTool?.(event.id, result);
    });
  });
}

export async function askOnDeviceChat(
  turns: OnDeviceChatTurn[]
): Promise<string> {
  if (!OnDeviceNutritionModule?.chat) {
    throw new Error('On-device chat is not available');
  }
  attachToolListener();
  resetChatToolState();
  const date = getTodayDate();
  let summary: DailySummary | null = null;
  try {
    summary = buildDailySummary(date, await loadDailySummaryRawData(date));
  } catch (error) {
    addLog(
      `On-device chat could not load today's summary: ${error}`,
      'WARNING'
    );
  }
  const prefs = useAppPreferencesStore.getState();
  const transcript = buildChatTranscript(turns);
  const context = prefs.onDeviceChatIncludeContext
    ? buildChatContext(summary, date)
    : '';
  trace(
    'prompt',
    `model: ${prefs.onDeviceChatModel}, ${prefs.onDeviceChatGreedy ? 'greedy' : 'sampled'}, tools off: [${prefs.onDeviceChatDisabledTools.join(', ')}], custom prompt: ${prefs.onDeviceChatSystemPrompt ? 'yes' : 'no'}\n${context ? `${context}\n` : '(no diary snapshot)\n'}${transcript}`
  );
  // The private servers can be out of reach or out of quota; stay on the
  // phone then rather than failing the message.
  const effectiveModel =
    prefs.onDeviceChatModel !== 'device' && getCloudChatStatus() !== 'available'
      ? 'device'
      : prefs.onDeviceChatModel;
  const started = Date.now();
  try {
    const { text: reply, model } = await OnDeviceNutritionModule.chat(
      transcript,
      context,
      {
        model: effectiveModel,
        userContext: prefs.aiUserContext.trim(),
        instructions: prefs.onDeviceChatSystemPrompt,
        greedy: prefs.onDeviceChatGreedy,
        disabledTools: prefs.onDeviceChatDisabledTools,
      }
    );
    trace('reply', `(${model}) ${reply} [${Date.now() - started} ms]`);
    return reply;
  } catch (error) {
    trace('error', String(error));
    throw error;
  }
}
