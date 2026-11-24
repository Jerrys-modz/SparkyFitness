import {
  classifyBloodPressure,
  homeBloodPressureAverage,
  instantHourMinute,
  instantToDay,
  summarizeBloodPressure,
  type BloodPressureCategory,
  type BloodPressureCreate,
  type BloodPressureSummary,
  type HomeBloodPressureAverage,
  type TimedBloodPressureReading,
  type VitalsEntries,
} from '@workspace/shared';
import * as genericHealthRepository from '../models/genericHealthRepository.js';

export interface BloodPressureReadingView extends TimedBloodPressureReading {
  id: string;
  timestamp: string;
  pulse: number | null;
  arm: string | null;
  bodyPosition: string | null;
  note: string | null;
  source: string;
  category: BloodPressureCategory;
}

export interface BloodPressureRangeSummary {
  readings: BloodPressureReadingView[];
  summary: BloodPressureSummary;
  home: HomeBloodPressureAverage | null;
}

/** The blood pressure rows (both values set) of vitals entries, oldest first. */
export function toBloodPressureReadings(
  rows: readonly VitalsEntries[],
  timezone: string
): BloodPressureReadingView[] {
  const readings: BloodPressureReadingView[] = [];
  for (const row of rows) {
    if (row.systolic_mmhg === null || row.diastolic_mmhg === null) continue;
    const at = new Date(row.timestamp);
    const systolic = Number(row.systolic_mmhg);
    const diastolic = Number(row.diastolic_mmhg);
    readings.push({
      id: row.id,
      timestamp: at.toISOString(),
      date: instantToDay(at, timezone),
      hour: instantHourMinute(at, timezone).hour,
      systolic,
      diastolic,
      pulse: row.pulse_bpm === null ? null : Number(row.pulse_bpm),
      arm: row.arm ?? null,
      bodyPosition: row.body_position ?? null,
      note: row.note ?? null,
      source: row.source_provider,
      category: classifyBloodPressure({ systolic, diastolic }),
    });
  }
  return readings.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

/** Readings in a day range with the averages every client shows. */
export async function getBloodPressureRange(
  userId: string,
  actingUserId: string,
  startDate: string,
  endDate: string,
  timezone: string
): Promise<BloodPressureRangeSummary> {
  const rows = await genericHealthRepository.getVitalsEntries(
    userId,
    actingUserId,
    startDate,
    endDate
  );
  const readings = toBloodPressureReadings(rows, timezone);
  return {
    readings,
    summary: summarizeBloodPressure(readings),
    home: homeBloodPressureAverage(readings),
  };
}

export type LogBloodPressureResult =
  { status: 'ok'; reading: BloodPressureReadingView } | { status: 'duplicate' };

/** Logs one reading by hand (source `manual`) at `at`, on its day in `timezone`. */
export async function logBloodPressure(
  userId: string,
  actingUserId: string,
  timezone: string,
  at: Date,
  input: Omit<BloodPressureCreate, 'timestamp'>
): Promise<LogBloodPressureResult> {
  const result = await genericHealthRepository.createManualBloodPressure(
    userId,
    actingUserId,
    {
      entry_date: instantToDay(at, timezone),
      timestamp: at,
      systolic_mmhg: input.systolic_mmhg,
      diastolic_mmhg: input.diastolic_mmhg,
      pulse_bpm: input.pulse_bpm,
      arm: input.arm,
      body_position: input.body_position,
      note: input.note,
    }
  );
  if (result.status !== 'ok') return { status: 'duplicate' };
  const [reading] = toBloodPressureReadings([result.entry], timezone);
  if (!reading) return { status: 'duplicate' };
  return { status: 'ok', reading };
}
