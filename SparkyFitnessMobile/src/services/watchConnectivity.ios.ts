/**
 * iOS-only JS wrapper around the `sparky-watch-connectivity` native module.
 * Metro resolves `services/watchConnectivity` to this file on iOS and to
 * `watchConnectivity.ts` (a no-op stub) everywhere else — same platform-split
 * pattern as `services/writeback.ios.ts` / `services/writeback.ts` — so
 * callers never need their own iOS/Android branching.
 */
import NativeWatchConnectivity from 'sparky-watch-connectivity';
import type { WatchAppContext, WatchCommand, WatchReachabilityInfo } from '../types/watchBridge';
import { addLog } from './LogService';

function parseCommand(json: string): WatchCommand | null {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (parsed != null && typeof parsed === 'object' && 'type' in parsed) {
      return parsed as WatchCommand;
    }
    addLog(`[watchConnectivity] Ignored malformed command payload: ${json}`, 'WARNING');
    return null;
  } catch (error) {
    addLog(`[watchConnectivity] Failed to parse watch command: ${error}`, 'WARNING');
    return null;
  }
}

export const WatchConnectivity = {
  get isAvailable(): boolean {
    try {
      return NativeWatchConnectivity.isSupported();
    } catch {
      return false;
    }
  },

  activate(): void {
    try {
      NativeWatchConnectivity.activate();
    } catch (error) {
      addLog(`[watchConnectivity] activate() failed: ${error}`, 'WARNING');
    }
  },

  async updateContext(context: WatchAppContext): Promise<void> {
    try {
      await NativeWatchConnectivity.updateContext(JSON.stringify(context));
    } catch (error) {
      addLog(`[watchConnectivity] updateContext failed: ${error}`, 'WARNING');
    }
  },

  addCommandListener(listener: (command: WatchCommand) => void): () => void {
    const subscription = NativeWatchConnectivity.addListener('onCommand', ({ payload }) => {
      const command = parseCommand(payload);
      if (command) listener(command);
    });
    return () => subscription.remove();
  },

  addReachabilityListener(listener: (info: WatchReachabilityInfo) => void): () => void {
    const subscription = NativeWatchConnectivity.addListener('onReachabilityChange', listener);
    return () => subscription.remove();
  },
};
