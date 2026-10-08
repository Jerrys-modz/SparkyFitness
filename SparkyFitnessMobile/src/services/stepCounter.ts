import { Platform } from 'react-native';
import { Pedometer } from 'expo-sensors';

export interface StepCountOptions {
  /**
   * Ask for Motion & Fitness access if it has not been decided. Only the
   * indoor flow does, where the person has just asked for an estimate; a save
   * that merely wants to learn from an outdoor run must not raise a prompt.
   */
  askForPermission: boolean;
}

/**
 * Steps the phone counted between two times, from the system pedometer, or
 * null when it cannot say (not an iPhone, no pedometer, access refused).
 *
 * iPhone only for now: iOS keeps recent step history that can be queried for
 * any window afterwards, so nothing has to run while the screen is off.
 * Android's step sensor only reports live while the app is running, which a
 * treadmill session in a pocket does not guarantee, so there the person
 * enters the distance themselves.
 */
export async function getStepsBetween(
  startMs: number,
  endMs: number,
  { askForPermission }: StepCountOptions
): Promise<number | null> {
  if (Platform.OS !== 'ios' || !(endMs > startMs)) return null;
  try {
    if (!(await Pedometer.isAvailableAsync())) return null;
    let permission = await Pedometer.getPermissionsAsync();
    if (!permission.granted) {
      if (!askForPermission || !permission.canAskAgain) return null;
      permission = await Pedometer.requestPermissionsAsync();
      if (!permission.granted) return null;
    }
    const { steps } = await Pedometer.getStepCountAsync(
      new Date(startMs),
      new Date(endMs)
    );
    return Number.isFinite(steps) && steps >= 0 ? steps : null;
  } catch {
    return null;
  }
}
