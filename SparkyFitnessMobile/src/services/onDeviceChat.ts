import OnDeviceNutritionModule from '../../modules/on-device-nutrition';
import { fetchDailySummary } from './api/dailySummaryApi';
import type { DailySummaryApiResponse } from './api/dailySummaryApi';
import { addLog } from './LogService';
import { isOnDeviceLabelScanAvailable } from './onDeviceLabelScan';
import { getTodayDate } from '../utils/dateUtils';
import {
  buildChatContext,
  buildChatTranscript,
  type OnDeviceChatTurn,
} from '../utils/onDeviceChatContext';
import { resetChatToolState, runChatTool } from './onDeviceChatTools';

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
    void runChatTool(event.name, event.args).then((result) => {
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
