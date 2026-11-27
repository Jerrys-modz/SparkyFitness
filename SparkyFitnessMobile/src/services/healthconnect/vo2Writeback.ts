import {
  insertRecords,
  deleteRecordsByUuids,
  readRecords,
  RecordingMethod,
  Vo2MaxMeasurementMethod,
  type HealthConnectRecord,
} from 'react-native-health-connect';
import { addLog } from '../LogService';
import { loadHealthPreference, saveHealthPreference } from './preferences';
import { isOwnWrittenVo2Record } from './dataTransformation';
import {
  bodyRecordTime,
  bodyWriteSignature,
  localDayBounds,
} from '../shared/bodyWriteback';
import {
  VO2_CLIENT_RECORD_PREFIX,
  hasOtherAppVo2Reading,
} from '../shared/vo2Writeback';

// Estimated VO2 max write-back to Health Connect: one instantaneous Vo2Max
// record per run day at 12:00 local time, replaced when the day's value changes
// (delete the ids written last time, insert a fresh id) and removed when the day
// no longer has an estimate. A day another app already has a reading on is left
// alone. Records are marked by their client record id so the read side never
// imports them (see isOwnWrittenVo2Record).

export const VO2_RECORD_TYPE = 'Vo2Max' as const;

/** Fresh per-run id (see writebackMappers for why ids are never reused). */
export const vo2ClientRecordId = (date: string, version: number): string =>
  `${VO2_CLIENT_RECORD_PREFIX}${date}-${version}`;

/** One day's estimate as a Health Connect record. */
export const vo2ValueToRecord = (
  date: string,
  value: number,
  time: Date,
  version: number
): HealthConnectRecord =>
  ({
    recordType: VO2_RECORD_TYPE,
    time: time.toISOString(),
    vo2MillilitersPerMinuteKilogram: value,
    // A model from pace and heart rate, not one of the lab or field methods.
    measurementMethod: Vo2MaxMeasurementMethod.OTHER,
    metadata: {
      clientRecordId: vo2ClientRecordId(date, version),
      clientRecordVersion: version,
      recordingMethod: RecordingMethod.RECORDING_METHOD_MANUAL_ENTRY,
    },
  }) as HealthConnectRecord;

/** Readings other apps recorded on the day, never this write-back's own. */
const otherAppReadings = async (date: string): Promise<number[]> => {
  const { start, end } = localDayBounds(date);
  const values: number[] = [];
  let pageToken: string | undefined;
  do {
    const page = await readRecords(VO2_RECORD_TYPE, {
      timeRangeFilter: {
        operator: 'between',
        startTime: start.toISOString(),
        endTime: end.toISOString(),
      },
      pageToken,
    });
    for (const rec of page.records as unknown as Record<string, unknown>[]) {
      if (isOwnWrittenVo2Record(rec)) continue;
      const value = rec.vo2MillilitersPerMinuteKilogram;
      if (typeof value === 'number') values.push(value);
    }
    pageToken = page.pageToken || undefined;
  } while (pageToken);
  return values;
};

const idsKey = (date: string) => `writebackVo2MaxIds:${date}`;
const sigKey = (date: string) => `writebackVo2MaxSig:${date}`;

/** The start of the per-day id-list keys, for removal to keep when a delete failed. */
export const VO2_IDS_KEY_PREFIX = 'writebackVo2MaxIds:';

/**
 * Write the estimate for one day. Skips an unchanged day, waits for noon on
 * today, writes nothing when another app already has a reading on the day (only
 * checked with read access, `canReadOthers`), and removes what it wrote before
 * when the estimate changed or is gone. Errors propagate so the caller can stop
 * on a quota error.
 */
export const writeVo2MaxForDate = async (
  date: string,
  value: number | null,
  version: number,
  canReadOthers: boolean,
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
  // old record is touched, so a failure part way never leaves it matching a
  // record that is gone.
  await saveHealthPreference(sigKey(date), '');

  const records: HealthConnectRecord[] = [];
  if (value !== null && time !== null) {
    const measured =
      canReadOthers && hasOtherAppVo2Reading(await otherAppReadings(date));
    if (measured) {
      addLog(`${label}: another app has a reading — skipped`, 'INFO');
    } else {
      records.push(vo2ValueToRecord(date, value, time, version));
    }
  }

  const previous = (await loadHealthPreference<string[]>(idsKey(date))) ?? [];
  if (previous.length > 0) {
    await deleteRecordsByUuids(VO2_RECORD_TYPE, [], previous);
    await saveHealthPreference(idsKey(date), []);
  }
  if (records.length > 0) {
    await insertRecords(records);
  }
  await saveHealthPreference(
    idsKey(date),
    records
      .map((r) => r.metadata?.clientRecordId)
      .filter((id): id is string => id != null)
  );
  await saveHealthPreference(sigKey(date), signature);
  addLog(`${label}: wrote ${records.length} record(s)`, 'INFO');
};
