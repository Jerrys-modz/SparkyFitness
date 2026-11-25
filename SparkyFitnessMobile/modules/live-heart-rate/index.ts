import { NativeModule, requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

/** One reading from the phone's workout session. `at` is epoch ms. */
export interface LiveHeartRateReading {
  bpm: number;
  at: number;
}

type LiveHeartRateEvents = {
  onHeartRate: (reading: LiveHeartRateReading) => void;
  onStopped: () => void;
};

declare class LiveHeartRateModuleType extends NativeModule<LiveHeartRateEvents> {
  /** True on iOS 26+, where an iPhone can run a workout session. */
  isAvailable(): boolean;
  /** Opens the session. False when it could not start or one is running. */
  start(): Promise<boolean>;
  /** Ends the session and drops the workout it recorded. */
  stop(): Promise<void>;
}

function loadLiveHeartRate(): LiveHeartRateModuleType | null {
  if (Platform.OS !== 'ios') return null;
  // Missing in a build from before this module and in tests with no native
  // runtime; callers treat null as "no live heart rate from the phone".
  try {
    return requireOptionalNativeModule<LiveHeartRateModuleType>(
      'LiveHeartRate'
    );
  } catch {
    return null;
  }
}

const LiveHeartRateModule = loadLiveHeartRate();

export default LiveHeartRateModule;
