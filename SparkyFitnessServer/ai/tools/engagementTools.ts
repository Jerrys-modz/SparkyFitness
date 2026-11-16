import { tool } from 'ai';
import {
  addDays,
  detectWeightPlateau,
  todayInZone,
  weightGoalDirection,
} from '@workspace/shared';
import { log } from '../../config/logging.js';
import { actorUserIdFor } from '../../db/poolManager.js';
import engagementRepository from '../../models/engagementRepository.js';
import preferenceService from '../../services/preferenceService.js';
import { ERRORS } from './errors.js';
import { dayString, formatSuccess } from './formatting.js';
import {
  CheckEngagementSchema,
  GetLoggingStreakSchema,
  GetContextualNudgeSchema,
} from './schemas/engagement.js';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Weigh-ins read for the plateau check; longer than any plateau worth reporting needs. */
const PLATEAU_LOOKBACK_DAYS = 90;

// Whole days between two day strings. Day strings parse as UTC midnight per
// the ES spec, so the difference is exact and DST-free.
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / MS_PER_DAY);
}

export function buildEngagementTools(userId: string, tz: string) {
  return {
    sparky_check_engagement: tool({
      description:
        "Scans the user's data for moments that require a proactive nudge (e.g., missed workout, plateau, achievement).",
      inputSchema: CheckEngagementSchema,
      execute: async () => {
        try {
          const triggers: Array<{ type: string; message: string }> = [];

          // Missed workouts (no exercise in 3+ days)
          const lastExerciseDate =
            await engagementRepository.getLastExerciseDate(userId);
          if (lastExerciseDate !== null) {
            const daysSince = daysBetween(
              dayString(lastExerciseDate),
              todayInZone(tz)
            );
            if (daysSince >= 3) {
              triggers.push({
                type: 'missed_workout',
                message: `No workout logged in ${daysSince} days. Time to get moving!`,
              });
            }
          } else {
            triggers.push({
              type: 'no_workouts',
              message:
                'No workouts logged yet. Start your fitness journey today!',
            });
          }

          // Weight plateau: the same shared check the web and mobile weight
          // charts use, so the assistant and the app never disagree.
          const today = todayInZone(tz);
          const [weightRows, prefs] = await Promise.all([
            engagementRepository.getWeightsSince(
              userId,
              addDays(today, -(PLATEAU_LOOKBACK_DAYS - 1))
            ),
            preferenceService.getUserPreferences(
              actorUserIdFor(userId),
              userId
            ),
          ]);
          const direction = weightGoalDirection(prefs);
          const plateau = detectWeightPlateau(
            weightRows.map((r) => ({
              date: dayString(r.entry_date),
              weight: Number(r.weight),
            })),
            direction,
            { today }
          );
          if (plateau) {
            const goal =
              plateau.direction === 'lose' ? 'losing weight' : 'gaining weight';
            triggers.push({
              type: 'weight_plateau',
              message: `The weight trend has been flat for ${plateau.days} days (${plateau.weighIns} weigh-ins) while the goal is ${goal}. This is common: check that logging is complete, see whether the adaptive TDEE is still adjusting, allow for water and scale noise, or consider a stretch at maintenance.`,
            });
          }

          // Achievements (logged days in the past week)
          const streakDays = await engagementRepository.getWeeklyLoggedDayCount(
            userId,
            todayInZone(tz)
          );
          if (streakDays >= 7) {
            triggers.push({
              type: 'achievement',
              message:
                "Amazing! You've logged data every day for the past week. Keep it up!",
            });
          } else if (streakDays >= 3) {
            triggers.push({
              type: 'streak_building',
              message: `You're on a ${streakDays}-day logging streak. Keep going!`,
            });
          }

          return formatSuccess(
            {
              triggers,
              trigger_count: triggers.length,
              checked_at: new Date().toISOString(),
            },
            'Engagement Triggers'
          );
        } catch (error) {
          log('error', '[Engagement Tool] checkEngagement error:', error);
          return ERRORS.DB_ERROR(error);
        }
      },
    }),

    sparky_get_logging_streak: tool({
      description:
        "Retrieves the user's current consecutive logging streak for any health or fitness data.",
      inputSchema: GetLoggingStreakSchema,
      execute: async () => {
        try {
          const rows = await engagementRepository.getLoggedDates(userId);
          if (rows.length === 0) {
            return formatSuccess(
              { current_streak: 0, last_logged: null },
              'Logging Streak'
            );
          }

          // Count consecutive days, allowing the streak to start from
          // yesterday if nothing is logged today yet. Rows arrive newest
          // first with no duplicate days (SELECT DISTINCT).
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const days = rows.map((r: any) => dayString(r.entry_date));
          const today = todayInZone(tz);
          let streak = 0;
          if (days[0] === today || days[0] === addDays(today, -1)) {
            streak = 1;
            for (
              let i = 1;
              i < days.length && days[i] === addDays(days[0], -i);
              i++
            ) {
              streak++;
            }
          }

          return formatSuccess(
            {
              current_streak: streak,
              last_logged: days[0],
            },
            'Logging Streak'
          );
        } catch (error) {
          log('error', '[Engagement Tool] getLoggingStreak error:', error);
          return ERRORS.DB_ERROR(error);
        }
      },
    }),

    sparky_get_contextual_nudge: tool({
      description:
        'Generates a context-aware nudge based on recent user activity or inactivity.',
      inputSchema: GetContextualNudgeSchema,
      execute: async () => {
        try {
          const counts = await engagementRepository.getTodayActivityCounts(
            userId,
            todayInZone(tz),
            tz
          );
          const foodCount = counts.food_count;
          const exerciseCount = counts.exercise_count;
          const checkinCount = counts.checkin_count;

          let nudge: string;
          let nudge_type: string;

          if (foodCount === 0 && exerciseCount === 0 && checkinCount === 0) {
            nudge =
              "You haven't logged anything today yet. Start with a quick check-in or log your breakfast!";
            nudge_type = 'start_day';
          } else if (foodCount > 0 && exerciseCount === 0) {
            nudge =
              "You've logged your meals but no exercise today. Even a short walk counts!";
            nudge_type = 'suggest_exercise';
          } else if (exerciseCount > 0 && foodCount === 0) {
            nudge =
              "Great workout! Don't forget to log your meals to track your nutrition.";
            nudge_type = 'suggest_food';
          } else if (checkinCount === 0) {
            nudge =
              "You're doing great with logging today! Consider a quick check-in to track your weight or mood.";
            nudge_type = 'suggest_checkin';
          } else {
            nudge =
              "Excellent! You've been thorough with your logging today. Keep up the great work!";
            nudge_type = 'encouragement';
          }

          return formatSuccess(
            {
              nudge,
              nudge_type,
              today_summary: {
                food_entries: foodCount,
                exercise_entries: exerciseCount,
                checkin_entries: checkinCount,
              },
              generated_at: new Date().toISOString(),
            },
            'Contextual Nudge'
          );
        } catch (error) {
          log('error', '[Engagement Tool] getContextualNudge error:', error);
          return ERRORS.DB_ERROR(error);
        }
      },
    }),
  };
}
