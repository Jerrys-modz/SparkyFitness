/**
 * The calories a recording has earned so far, for the screen while it runs:
 * the logged exercise's calories per hour over the active time. The server
 * values a saved entry the same way (rate times minutes), so this matches
 * what the entry will show. Null without a rate.
 */
export function estimateRecordingKcal(
  caloriesPerHour: number | null,
  activeSeconds: number
): number | null {
  if (caloriesPerHour == null || !(caloriesPerHour > 0)) return null;
  return (caloriesPerHour * Math.max(0, activeSeconds)) / 3600;
}
