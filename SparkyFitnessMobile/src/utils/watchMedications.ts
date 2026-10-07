import { formatDose, getDueDosesForDate } from '@workspace/shared';
import type { MedicationDetail, MedicationEntry } from '@workspace/shared';
import type { WatchMedicationDosePayload } from '../../modules/watch-connectivity';
import type { EntryTimeFormat } from './entryTimeDisplay';
import { formatLocalizedTimeOfDay } from './medicationScheduleLocalization';
import { doseSlotStatus, entryMatchesDose } from './medications';

/** The id the watch and the phone both use to name one dose slot. */
export function watchDoseId(medicationId: string, scheduleId: string): string {
  return `${medicationId}:${scheduleId}`;
}

/**
 * Today's scheduled dose slots, in the shape the watch's Medications page
 * draws: soonest first, untimed slots last. As-needed (PRN) medications are
 * left to the phone, since they have no slot to tick off.
 *
 * Status comes from the same entry matching the phone's own dose rows use
 * (`entryMatchesDose`), so the two never disagree about what is taken.
 */
export function medicationsForWatch(
  medications: readonly MedicationDetail[],
  entries: readonly MedicationEntry[],
  date: string,
  timezone: string,
  timeFormat?: EntryTimeFormat | null
): WatchMedicationDosePayload[] {
  return getDueDosesForDate([...medications], date, timezone).map((due) => {
    const entry = entries.find((e) =>
      entryMatchesDose(e, due.medication.id, due.schedule.id)
    );
    return {
      id: watchDoseId(due.medication.id, due.schedule.id),
      medicationId: due.medication.id,
      scheduleId: due.schedule.id,
      name: due.medication.name,
      detail: formatDose(due.medication, due.schedule) ?? '',
      time: due.schedule.time_of_day
        ? formatLocalizedTimeOfDay(
            due.schedule.time_of_day,
            undefined,
            timeFormat
          )
        : '',
      status: doseSlotStatus(entry),
    };
  });
}
