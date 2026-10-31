import {
  queryCategorySamples,
  requestAuthorization,
} from '@kingstinct/react-native-healthkit';
import { dayToUtcRange } from '@workspace/shared';
import { getDeviceTimezone } from '../utils/dateUtils';
import { countStandHours } from '../utils/standHours';
import { addLog } from './LogService';

const STAND_HOUR = 'HKCategoryTypeIdentifierAppleStandHour' as const;

/**
 * Asks Apple Health to share stand hours. iOS shows the prompt only the first time for a
 * type; afterwards this answers at once, so it is safe to call before every read. It reads
 * for the Stand ring only and is never uploaded.
 */
export async function requestStandHoursAccess(): Promise<boolean> {
  try {
    return await requestAuthorization({ toRead: [STAND_HOUR], toShare: [] });
  } catch (error) {
    addLog(`[standHours] authorization failed: ${String(error)}`, 'WARNING');
    return false;
  }
}

/** Hours stood in on a calendar day, in the device's timezone. */
export async function readStandHours(day: string): Promise<number> {
  const { start, end } = dayToUtcRange(day, getDeviceTimezone());
  const samples = await queryCategorySamples(STAND_HOUR, {
    ascending: true,
    limit: 0,
    filter: { date: { startDate: start, endDate: end } },
  });
  return countStandHours(samples);
}
