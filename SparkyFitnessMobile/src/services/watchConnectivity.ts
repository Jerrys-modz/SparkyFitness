/**
 * Default (Android) no-op stub. See `watchConnectivity.ios.ts` for the real
 * implementation and the platform-split rationale. There is no Apple Watch on
 * Android, so every call here is inert — callers don't need their own
 * Platform.OS branching.
 */
import type { WatchAppContext, WatchCommand, WatchReachabilityInfo } from '../types/watchBridge';

export const WatchConnectivity = {
  get isAvailable(): boolean {
    return false;
  },
  activate(): void {
    // No-op.
  },
  async updateContext(_context: WatchAppContext): Promise<void> {
    // No-op.
  },
  addCommandListener(_listener: (command: WatchCommand) => void): () => void {
    return () => {};
  },
  addReachabilityListener(_listener: (info: WatchReachabilityInfo) => void): () => void {
    return () => {};
  },
};
