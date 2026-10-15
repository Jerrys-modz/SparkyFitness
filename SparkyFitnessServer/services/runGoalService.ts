import {
  addDays,
  buildRunGoalProgress,
  todayInZone,
  weekStartOf,
  type GetRunGoalsResponse,
} from '@workspace/shared';
import {
  getEntriesWithDistance,
  getRunGoals,
} from '../models/runGoalRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';

/** The person's running goals and where they stand against them today. */
export async function getRunGoalsWithProgress(
  userId: string,
  authenticatedUserId?: string
): Promise<GetRunGoalsResponse> {
  const [goals, timezone, preferences] = await Promise.all([
    getRunGoals(userId, authenticatedUserId),
    loadUserTimezone(userId),
    preferenceRepository.getUserPreferences(userId),
  ]);
  const today = todayInZone(timezone);
  const rawFirstDay = preferences?.first_day_of_week;
  const firstDayOfWeek =
    rawFirstDay !== null && rawFirstDay !== undefined ? Number(rawFirstDay) : 0;
  const weekStart = weekStartOf(today, firstDayOfWeek);
  const entries = await getEntriesWithDistance(
    userId,
    weekStart,
    addDays(weekStart, 6),
    authenticatedUserId
  );
  return {
    goals,
    progress: buildRunGoalProgress(entries, today, firstDayOfWeek, {
      weeklyDistanceKm: goals?.weekly_distance_km ?? null,
      raceDate: goals?.race_date ?? null,
    }),
  };
}
