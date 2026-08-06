import { requireNativeModule, NativeModule } from 'expo-modules-core';

// A `type` alias, not an `interface`: NativeModule<TEventsMap> constrains
// TEventsMap to `Record<string, (...args) => void>`, and only object-literal
// type aliases get TypeScript's implicit index-signature inference against
// that constraint — interfaces are excluded (they stay open for declaration
// merging), so an `interface` here fails with "index signature is missing".
export type SparkyWatchConnectivityEvents = {
  /** `payload` is the raw JSON string of a `WatchCommand` (see `types/watchBridge.ts`). */
  onCommand: (event: { payload: string }) => void;
  onReachabilityChange: (event: {
    reachable: boolean;
    paired: boolean;
    watchAppInstalled: boolean;
  }) => void;
};

declare class SparkyWatchConnectivityModule extends NativeModule<SparkyWatchConnectivityEvents> {
  isSupported(): boolean;
  activate(): void;
  updateContext(json: string): Promise<void>;
  getReachability(): { reachable: boolean; paired: boolean; watchAppInstalled: boolean };
}

export default requireNativeModule<SparkyWatchConnectivityModule>('SparkyWatchConnectivity');
