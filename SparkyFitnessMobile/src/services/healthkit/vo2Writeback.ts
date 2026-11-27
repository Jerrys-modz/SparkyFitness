import {
  saveQuantitySample,
  deleteObjects,
  queryQuantitySamples,
} from '@kingstinct/react-native-healthkit';
import { addLog } from '../LogService';
import { loadHealthPreference, saveHealthPreference } from './preferences';
import {
  bodyRecordTime,
  bodyWriteSignature,
  localDayBounds,
} from '../shared/bodyWriteback';
import {
  VO2_WRITEBACK_METADATA_KEY,
  hasOtherAppVo2Reading,
} from '../shared/vo2Writeback';
import { isOwnWrittenVo2Sample } from './dataTransformation';

// Estimated VO2 max write-back to Apple Health: one quantity sample per run day
// at 12:00 local time, replaced when the day's value changes (delete the UUIDs
// saved last time, then save, as body write-back does) and removed when the day
// no longer has an estimate. A day another app already has a VO2 max on is left
// alone. Each sample carries VO2_WRITEBACK_METADATA_KEY so the read side skips it.
// The unit is millilitres per kilogram per minute.

export const VO2_IDENTIFIER = 'HKQuantityTypeIdentifierVO2Max' as const;
const VO2_UNIT = 'ml/(kg*min)';

/** Readings other apps saved on the day, never this write-back's own. */
const otherAppReadings = async (date: string): Promise<number[]> => {
  const { start, end } = localDayBounds(date);
  const samples = await queryQuantitySamples(VO2_IDENTIFIER, {
    ascending: false,
    limit: 0,
    unit: VO2_UNIT,
    filter: { date: { startDate: start, endDate: end } },
  });
  if (!Array.isArray(samples)) return [];
  return samples
    .filter((s) => !isOwnWrittenVo2Sample(s))
    .map((s) => s.quantity);
};

const uuidsKey = (date: string) => `writebackVo2MaxUuids:${date}`;
const sigKey = (date: string) => `writebackVo2MaxSig:${date}`;

/** The start of the per-day UUID-list keys, for removal to keep when a delete failed. */
export const VO2_UUIDS_KEY_PREFIX = 'writebackVo2MaxUuids:';

/**
 * Write the estimate for one day. Skips an unchanged day, waits for noon on
 * today, saves nothing when another app already has a reading on the day
 * (HealthKit hides whether read access was given, so a denied read just finds
 * nothing and the estimate is saved), and deletes what it saved before when the
 * estimate changed or is gone. A failed delete keeps those UUIDs and the old
 * signature, so the next run tries again rather than leaving a stray sample.
 */
export const writeVo2MaxForDate = async (
  date: string,
  value: number | null,
  version: number,
  now: Date = new Date()
): Promise<void> => {
  const label = `[Writeback] VO2 max ${date}`;
  const time = value === null ? null : bodyRecordTime(date, now);
  if (value !== null && time === null) {
    addLog(`${label}: deferred until noon`, 'DEBUG');
    return;
  }

  const signature = bodyWriteSignature(value, time);
  if (signature === (await loadHealthPreference<string>(sigKey(date)))) {
    addLog(`${label}: unchanged — skipped`, 'DEBUG');
    return;
  }
  // The stored signature describes the last complete write. Drop it before the
  // old sample is touched, so a failure part way never leaves it matching a
  // sample that is gone.
  await saveHealthPreference(sigKey(date), '');

  let save = value !== null && time !== null;
  if (save) {
    try {
      if (hasOtherAppVo2Reading(await otherAppReadings(date))) {
        addLog(`${label}: another app has a reading — skipped`, 'INFO');
        save = false;
      }
    } catch (error) {
      // Without the read the day is written, as without read access.
      addLog(
        `${label}: could not read other apps' readings: ${error instanceof Error ? error.message : String(error)}`,
        'WARNING'
      );
    }
  }

  const previous = (await loadHealthPreference<string[]>(uuidsKey(date))) ?? [];
  if (previous.length > 0) {
    try {
      await deleteObjects(VO2_IDENTIFIER, { uuids: previous });
    } catch (error) {
      addLog(
        `${label}: failed to delete the previous sample: ${error instanceof Error ? error.message : String(error)}`,
        'WARNING'
      );
      return;
    }
    await saveHealthPreference(uuidsKey(date), []);
  }

  const tracked: string[] = [];
  let saved = true;
  if (save && value !== null && time !== null) {
    const result = await saveQuantitySample(
      VO2_IDENTIFIER,
      VO2_UNIT,
      value,
      time,
      time,
      { [VO2_WRITEBACK_METADATA_KEY]: `${date}-${version}` }
    );
    if (result?.uuid) tracked.push(result.uuid);
    else saved = false;
  }

  await saveHealthPreference(uuidsKey(date), tracked);
  if (saved) await saveHealthPreference(sigKey(date), signature);
  addLog(`${label}: wrote ${tracked.length} sample(s)`, 'INFO');
};
