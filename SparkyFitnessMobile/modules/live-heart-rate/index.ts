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
  /**
   * Takes over a session iOS kept running when the app was killed mid-workout.
   * True when one was adopted (or one is already running), false when there
   * was nothing to recover.
   */
  recover(): Promise<boolean>;
  /**
   * Readings collected since the last call, oldest first. The phone usually
   * locks between sets, so JS can miss live events; this catches up.
   */
  drain(): LiveHeartRateReading[];
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
