import { addDays, buildRunReview, todayInZone } from '@workspace/shared';
import type { RunReview, TrainingLoad } from '@workspace/shared';
import reportRepository from '../models/reportRepository.js';
import reportService from './reportService.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';

export const DEFAULT_RUN_REVIEW_WINDOW_DAYS = 28;

export interface RunReviewResult {
  review: RunReview;
  load: TrainingLoad;
}

/**
 * Reads recent running for the AI assistant: frequency, distance, week-to-week
 * jumps and pace, with the acute-against-chronic training load that already
 * drives the app's recovery hint. The numbers are computed here, not by the
 * model. Reads one extra window back so pace has something to compare with.
 */
async function getRunReview(
  userId: string,
  windowDays: number = DEFAULT_RUN_REVIEW_WINDOW_DAYS
): Promise<RunReviewResult> {
  const timezone = await loadUserTimezone(userId);
  const today = todayInZone(timezone);
  const [runs, load] = await Promise.all([
    reportRepository.getRunSessions(
      userId,
      addDays(today, -(windowDays * 2 - 1)),
      today
    ),
    reportService.getTrainingLoad(userId, userId),
  ]);
  return { review: buildRunReview(runs, today, windowDays), load };
}

export { getRunReview };
export default { getRunReview };
