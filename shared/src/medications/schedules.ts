import { dayOfWeek, instantToDay } from "../utils/timezone.ts";

export interface SharedScheduleRule {
  schedule_type_id: string;
  time_of_day?: string | null;
  days_of_week?: number[] | null;
  interval_days?: number | null;
  day_of_month?: number | null;
  cycle_on_days?: number | null;
  cycle_off_days?: number | null;
  start_date?: string | null; // YYYY-MM-DD
  end_date?: string | null; // YYYY-MM-DD
  active?: boolean;
  dose_amount?: number | null;
  with_meal?: string | null;
  created_at?: string | null;
}

/**
 * Returns true if a schedule is due on a given calendar day (YYYY-MM-DD format).
 */
export function isScheduleDueOnDate(
  schedule: SharedScheduleRule,
  dateString: string,
): boolean {
  if (schedule.active === false) return false;

  // Check date ranges if present
  if (schedule.start_date && dateString < schedule.start_date) return false;
  if (schedule.end_date && dateString > schedule.end_date) return false;

  const type = schedule.schedule_type_id;

  if (type === "daily") {
    return true;
  }

  if (type === "weekly" || type === "specific_days") {
    if (!schedule.days_of_week || schedule.days_of_week.length === 0)
      return false;
    const dow = dayOfWeek(dateString);
    return schedule.days_of_week.includes(dow);
  }

  if (type === "every_n_days") {
    if (!schedule.interval_days || schedule.interval_days <= 0) return false;
    const anchorStr = schedule.start_date || "2020-01-01"; // Fallback anchor if not set
    const anchorMs = new Date(anchorStr + "T00:00:00Z").getTime();
    const currentMs = new Date(dateString + "T00:00:00Z").getTime();
    const diffDays = Math.round((currentMs - anchorMs) / (24 * 60 * 60 * 1000));
    if (diffDays < 0) return false;
    return diffDays % schedule.interval_days === 0;
  }

  if (type === "monthly") {
    if (!schedule.day_of_month) return false;
    const parts = dateString.split("-");
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const day = Number(parts[2]);

    if (day === schedule.day_of_month) return true;

    // Handle last day of month fallback (e.g. schedule for 31st, but current month only has 30 days)
    if (schedule.day_of_month > day) {
      const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
      if (day === lastDay && schedule.day_of_month >= lastDay) {
        return true;
      }
    }
    return false;
  }

  if (type === "cyclic") {
    const onDays = schedule.cycle_on_days || 0;
    const offDays = schedule.cycle_off_days || 0;
    if (onDays <= 0) return false;
    const cyclePeriod = onDays + offDays;
    const anchorStr = schedule.start_date || "2020-01-01";
    const anchorMs = new Date(anchorStr + "T00:00:00Z").getTime();
    const currentMs = new Date(dateString + "T00:00:00Z").getTime();
    const diffDays = Math.round((currentMs - anchorMs) / (24 * 60 * 60 * 1000));
    if (diffDays < 0) return false;
    const positionInCycle = diffDays % cyclePeriod;
    return positionInCycle < onDays;
  }

  // PRN (as-needed) is handled on-demand, not on a due checklist
  if (type === "prn") {
    return false;
  }

  // Tapers default to daily behavior unless customized
  if (type === "taper") {
    return true;
  }

  return false;
}

/**
 * Medication shape required by `getDueDosesForDate`.
 */
export interface SharedMedication {
  id: string;
  is_active: boolean;
  schedules?: (SharedScheduleRule & { id: string })[];
}

/**
 * Filters and returns all scheduled dose slots for a given date,
 * sorted by time of day with untimed slots last.
 */
export function getDueDosesForDate<M extends SharedMedication>(
  medications: M[],
  dateString: string,
  tz: string,
): Array<{
  medication: M;
  schedule: SharedScheduleRule & { id: string };
}> {
  const result: Array<{
    medication: M;
    schedule: SharedScheduleRule & { id: string };
  }> = [];
  for (const med of medications) {
    if (!med.is_active) continue;
    if (!med.schedules || med.schedules.length === 0) continue;
    for (const sched of med.schedules) {
      if (sched.schedule_type_id === "prn") {
        // PRN is logged on demand, not scheduled on due list
        continue;
      }
      const fallbackStart = sched.created_at
        ? instantToDay(sched.created_at, tz)
        : null;
      if (!sched.start_date && fallbackStart && dateString < fallbackStart) {
        continue;
      }
      if (isScheduleDueOnDate(sched, dateString)) {
        result.push({
          medication: med,
          schedule: sched,
        });
      }
    }
  }
  // Stable sort: same-time slots keep their medication order.
  result.sort((a, b) => {
    const aTime =
      a.schedule.time_of_day != null && a.schedule.time_of_day !== ""
        ? a.schedule.time_of_day
        : null;
    const bTime =
      b.schedule.time_of_day != null && b.schedule.time_of_day !== ""
        ? b.schedule.time_of_day
        : null;
    if (aTime === null && bTime === null) return 0;
    if (aTime === null) return 1;
    if (bTime === null) return -1;
    if (aTime < bTime) return -1;
    if (aTime > bTime) return 1;
    return 0;
  });
  return result;
}

/** An extra dose of the same schedule rule, taken at its own time of day. */
export interface ExtraDoseInput {
  /** '' or 'HH:MM' */
  time: string;
  /** '' (use the default dose) or a positive number as typed. */
  dose: string;
}

/**
 * True when every extra dose has a usable amount: blank (falls back to the
 * medication's default) or a finite number above zero.
 */
export function areExtraDosesValid(extras: ExtraDoseInput[]): boolean {
  return extras.every((extra) => {
    if (extra.dose.trim() === "") return true;
    const dose = Number(extra.dose);
    return Number.isFinite(dose) && dose > 0;
  });
}

/**
 * Expands one schedule rule into one rule per extra dose, so a medication taken
 * several times a day (e.g. 5 mg morning, 2.5 mg noon, 5 mg evening) becomes
 * several schedules that share the base rule's recurrence, meal timing and
 * date limits but differ in time and dose. Each rule is its own dose slot on
 * the due list, with its own reminder and log entry.
 */
export function buildExtraDoseSchedules<
  T extends { time_of_day?: string | null; dose_amount?: number | null },
>(base: T, extras: ExtraDoseInput[]): T[] {
  return extras.map((extra) => ({
    ...base,
    time_of_day: extra.time || null,
    dose_amount: extra.dose.trim() === "" ? null : Number(extra.dose),
  }));
}

/** Common prescription frequencies and the clock times they usually map to. */
export const DOSE_FREQUENCY_PRESETS = [
  { id: "qd", times: ["09:00"] },
  { id: "qhs", times: ["21:00"] },
  { id: "bid", times: ["09:00", "21:00"] },
  { id: "tid", times: ["09:00", "15:00", "21:00"] },
  { id: "qid", times: ["09:00", "13:00", "17:00", "21:00"] },
] as const;

export type DoseFrequencyPresetId =
  (typeof DOSE_FREQUENCY_PRESETS)[number]["id"];

/** Splits a preset into the first dose's time and the extra doses that follow it. */
export function applyDoseFrequencyPreset(id: DoseFrequencyPresetId): {
  time: string;
  extras: ExtraDoseInput[];
} {
  const preset = DOSE_FREQUENCY_PRESETS.find((p) => p.id === id);
  const [first = "09:00", ...rest] = preset?.times ?? [];
  return {
    time: first,
    extras: rest.map((time) => ({ time, dose: "" })),
  };
}
