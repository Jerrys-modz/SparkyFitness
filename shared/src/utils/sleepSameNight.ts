/**
 * One night recorded by two sources.
 *
 * `sleep_entries` holds one row per day and source, so a day with several
 * rows always has several sources: the same night recorded twice (a watch
 * and a ring, or Google Health and Health Connect both carrying a Fitbit
 * night), or a nap from a different source than the night. Records of the
 * same day whose times overlap are one sleep: only the most detailed of them
 * should count, while a nap that does not overlap still counts.
 */

/** How much a recorded sleep tells; compared field by field, the first difference decides. */
export interface SleepDetail {
  /** Logged by the person, who saying so outranks any device. */
  loggedByHand: boolean;
  /** Distinct stages recorded among deep, light, REM and awake. */
  stageKinds: number;
  /** Other measures recorded with the sleep, such as a score, HRV or resting heart rate. */
  measures: number;
  /** Stage segments, so finer staging wins a tie. */
  segments: number;
  durationSeconds: number;
}

/** Where a record sits: its day, its times (epoch ms) and its detail. */
export interface SleepPlacement {
  day: string;
  start: number;
  end: number;
  detail: SleepDetail;
}

/** Positive when `a` is the more detailed. */
function compareDetail(a: SleepDetail, b: SleepDetail): number {
  return (
    Number(a.loggedByHand) - Number(b.loggedByHand) ||
    a.stageKinds - b.stageKinds ||
    a.measures - b.measures ||
    a.segments - b.segments ||
    a.durationSeconds - b.durationSeconds
  );
}

/**
 * The records to count: of each day's records whose times overlap (also
 * through a chain), the most detailed one, ties going to the earlier start
 * and then to the earlier record. Sleeps that only touch stay separate.
 * Records keep their order.
 */
export function keepMostDetailedSleep<T>(
  items: readonly T[],
  place: (item: T) => SleepPlacement
): T[] {
  const placed = items.map((item, index) => ({ index, ...place(item) }));
  const byDay = new Map<string, typeof placed>();
  for (const p of placed) {
    const day = byDay.get(p.day);
    if (day) day.push(p);
    else byDay.set(p.day, [p]);
  }

  const kept = new Set<number>();
  for (const day of byDay.values()) {
    const [first, ...rest] = day.sort(
      (a, b) => a.start - b.start || a.index - b.index
    );
    if (!first) continue;
    let best = first;
    let clusterEnd = best.end;
    for (const p of rest) {
      if (p.start < clusterEnd) {
        if (compareDetail(p.detail, best.detail) > 0) best = p;
        clusterEnd = Math.max(clusterEnd, p.end);
      } else {
        kept.add(best.index);
        best = p;
        clusterEnd = p.end;
      }
    }
    kept.add(best.index);
  }
  return items.filter((_, index) => kept.has(index));
}

const STAGE_KINDS = ['deep', 'light', 'rem', 'awake'] as const;

/** The fields of a `sleep_entries` row the rule reads, as the server and the web app hold it. */
export interface SameNightSleepEntry {
  /** `YYYY-MM-DD`, or that day with a time part. */
  entry_date: string;
  bedtime: string | Date;
  wake_time: string | Date;
  duration_in_seconds: number | null;
  source: string;
  stage_events?: readonly { stage_type: string }[] | null;
  deep_sleep_seconds?: number | null;
  light_sleep_seconds?: number | null;
  rem_sleep_seconds?: number | null;
  awake_sleep_seconds?: number | null;
  sleep_score?: number | null;
  avg_overnight_hrv?: number | null;
  resting_heart_rate?: number | null;
  average_spo2_value?: number | null;
  average_respiration_value?: number | null;
  avg_sleep_stress?: number | null;
  body_battery_change?: number | null;
}

/** What a stored sleep record tells, for `keepMostDetailedSleep`. */
export function sleepEntryDetail(entry: SameNightSleepEntry): SleepDetail {
  const events = entry.stage_events ?? [];
  const stageKinds =
    events.length > 0
      ? STAGE_KINDS.filter((kind) => events.some((e) => e.stage_type === kind))
          .length
      : [
          entry.deep_sleep_seconds,
          entry.light_sleep_seconds,
          entry.rem_sleep_seconds,
          entry.awake_sleep_seconds,
        ].filter((seconds) => (seconds ?? 0) > 0).length;
  const measures = [
    entry.sleep_score,
    entry.avg_overnight_hrv,
    entry.resting_heart_rate,
    entry.average_spo2_value,
    entry.average_respiration_value,
    entry.avg_sleep_stress,
    entry.body_battery_change,
  ].filter((value) => value !== null && value !== undefined).length;
  return {
    loggedByHand: entry.source.toLowerCase() === 'manual',
    stageKinds,
    measures,
    segments: events.length,
    durationSeconds: entry.duration_in_seconds ?? 0,
  };
}

/** The stored sleep records to count: one per night, the most detailed, plus naps from other sources. */
export function keepMostDetailedSleepEntries<
  A extends readonly SameNightSleepEntry[],
>(entries: A): A[number][] {
  return keepMostDetailedSleep(entries, (entry) => ({
    day: entry.entry_date.slice(0, 10),
    start: new Date(entry.bedtime).getTime(),
    end: new Date(entry.wake_time).getTime(),
    detail: sleepEntryDetail(entry),
  }));
}
