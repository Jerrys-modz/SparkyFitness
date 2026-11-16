import onboardingRepository from '../models/onboardingRepository.js';
import { todayInZone } from '@workspace/shared';
import { log } from '../config/logging.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import {
  instantToDay,
  type OnboardingStartWeightResponse,
} from '@workspace/shared';
/**
 * Processes and saves the user's onboarding data.
 * @param {string} userId - The UUID of the user.
 * @param {object} data - The onboarding form data.
 * @returns {Promise<void>}
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processOnboardingData(userId: any, data: any) {
  try {
    await onboardingRepository.saveOnboardingData(userId, data);
    log('info', `Successfully processed onboarding for user: ${userId}`);
  } catch (error) {
    log('error', `Error processing onboarding data for user ${userId}:`, error);
    throw new Error('Failed to save onboarding data.', { cause: error });
  }
}
/**
 * Checks if a user has completed the onboarding process.
 * @param {string} userId - The UUID of the user.
 * @returns {Promise<boolean>} True if onboarding is complete, false otherwise.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkOnboardingStatus(userId: any) {
  try {
    const statusRecord = await onboardingRepository.getOnboardingStatus(userId);
    if (!statusRecord) {
      return { onboarding_complete: false, onboarding_skipped: false };
    }
    return {
      onboarding_complete: statusRecord.onboarding_complete,
      onboarding_skipped: statusRecord.onboarding_skipped,
    };
  } catch (error) {
    log('error', `Error checking onboarding status for user ${userId}:`, error);
    return { onboarding_complete: true, onboarding_skipped: false };
  }
}
/**
 * Resets the onboarding completion status for a given user.
 * @param {string} userId - The UUID of the user.
 * @returns {Promise<void>}
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resetOnboardingStatus(userId: any) {
  try {
    await onboardingRepository.resetOnboardingStatus(userId);
    log('info', `Successfully reset onboarding status for user: ${userId}`);
  } catch (error) {
    log(
      'error',
      `Error resetting onboarding status for user ${userId}:`,
      error
    );
    throw new Error('Failed to reset onboarding status.', { cause: error });
  }
}
/**
 * Marks the onboarding wizard as skipped for a given user.
 * @param {string} userId - The UUID of the user.
 * @returns {Promise<void>}
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function skipOnboarding(userId: any) {
  try {
    await onboardingRepository.setOnboardingSkipped(userId);
    log('info', `Successfully set onboarding skipped for user: ${userId}`);
  } catch (error) {
    log('error', `Error setting onboarding skipped for user ${userId}:`, error);
    throw new Error('Failed to skip onboarding.', { cause: error });
  }
}
/**
 * Sets or clears the user's target weight, and its target date when given,
 * without touching the rest of onboarding.
 * @param userId - The UUID of the user.
 * @param targetWeightKg - Target weight in kg, or null to clear it (and the date).
 * @param targetDate - YYYY-MM-DD, null to clear, or undefined to keep the saved date.
 */
async function setTargetWeight(
  userId: string,
  targetWeightKg: number | null,
  targetDate?: string | null
) {
  try {
    const today = todayInZone(await loadUserTimezone(userId));
    await onboardingRepository.setTargetWeight(
      userId,
      targetWeightKg,
      targetDate,
      today
    );
    const saved = await onboardingRepository.getGoalWeight(userId);
    return saved;
  } catch (error) {
    log('error', `Error saving target weight for user ${userId}:`, error);
    throw new Error('Failed to save target weight.', { cause: error });
  }
}
/**
 * Sets or clears the user's target body fat % without touching the rest of onboarding.
 * @param userId - The UUID of the user.
 * @param targetBodyFatPercent - Target body fat in percent, or null to clear it.
 */
async function setTargetBodyFat(
  userId: string,
  targetBodyFatPercent: number | null
) {
  try {
    await onboardingRepository.setTargetBodyFat(userId, targetBodyFatPercent);
  } catch (error) {
    log('error', `Error saving target body fat for user ${userId}:`, error);
    throw new Error('Failed to save target body fat.', { cause: error });
  }
}
/**
 * The setup wizard's weight, with the day it was given in the profile
 * timezone, for the weight progress start point. Nulls when there is none.
 */
async function getStartWeight(
  userId: string
): Promise<OnboardingStartWeightResponse> {
  const row = await onboardingRepository.getOnboardingStartWeight(userId);
  const raw = row?.current_weight;
  const weight = raw === null || raw === undefined ? NaN : Number(raw);
  if (!row || !Number.isFinite(weight) || weight <= 0) {
    return { weightKg: null, date: null };
  }
  const date = row.created_at
    ? instantToDay(row.created_at, await loadUserTimezone(userId))
    : null;
  return { weightKg: weight, date };
}
export { processOnboardingData };
export { getStartWeight };
export { setTargetWeight };
export { setTargetBodyFat };
export { checkOnboardingStatus };
export { resetOnboardingStatus };
export { skipOnboarding };
export default {
  processOnboardingData,
  getStartWeight,
  setTargetWeight,
  setTargetBodyFat,
  checkOnboardingStatus,
  resetOnboardingStatus,
  skipOnboarding,
};
