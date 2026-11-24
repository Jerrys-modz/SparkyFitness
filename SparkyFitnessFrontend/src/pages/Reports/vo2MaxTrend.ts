export interface Vo2MaxPoint {
  date: string;
  value: number;
}

interface Vo2MaxMetricRow {
  entry_date: string | Date;
  vo2_max: number | string | null;
}

/**
 * One VO2 max point per day, oldest first. Sources on the same day are
 * averaged, and rows without a reading are left out.
 */
export function vo2MaxPoints(
  rows: readonly Vo2MaxMetricRow[] | undefined
): Vo2MaxPoint[] {
  const byDate = new Map<string, number[]>();
  for (const row of rows ?? []) {
    const value = row.vo2_max == null ? Number.NaN : Number(row.vo2_max);
    if (!Number.isFinite(value) || value <= 0) continue;
    const date =
      row.entry_date instanceof Date
        ? row.entry_date.toISOString().slice(0, 10)
        : String(row.entry_date).slice(0, 10);
    byDate.set(date, [...(byDate.get(date) ?? []), value]);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({
      date,
      value:
        Math.round(
          (values.reduce((sum, v) => sum + v, 0) / values.length) * 10
        ) / 10,
    }));
}
