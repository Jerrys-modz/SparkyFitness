import type { TFunction } from 'i18next';
import { findBuiltinCoach, type CoachMessage } from '@workspace/shared';
import { BUILTIN_COACH_NAMES } from '../constants/coaches';

/**
 * What a coach message says (#2013): the AI wording when there is one, else
 * our own sentence built from the numbers behind it.
 */
export function coachMessageText(message: CoachMessage, t: TFunction): string {
  if (message.text) return message.text;
  const facts = message.facts;
  switch (message.trigger_type) {
    case 'low_protein_after_training':
      return t('coachMessages.lowProteinAfterTraining', {
        defaultValue:
          'You trained yesterday and logged {{protein}} g of protein against your {{goal}} g goal. A protein-rich meal today would help you recover.',
        protein: facts.protein,
        goal: facts.goal,
      });
    case 'short_sleep_under_load':
      return t('coachMessages.shortSleepUnderLoad', {
        defaultValue:
          'You slept about {{hours}} hours last night after {{workouts}} workouts in three days. An easier session or an early night could pay off.',
        hours: facts.hours,
        workouts: facts.workouts,
      });
    case 'logging_gap':
      return t('coachMessages.loggingGap', {
        defaultValue:
          'It has been {{days}} days since your last entry. No catching up needed: logging one meal today is enough to get going again.',
        days: facts.days,
      });
    case 'streak_milestone':
      return t('coachMessages.streakMilestone', {
        defaultValue:
          'You have logged {{days}} days in a row. That consistency is what makes the numbers useful.',
        days: facts.days,
      });
  }
}

/** The name of the coach that left a message. */
export function coachMessageCoachName(
  message: CoachMessage,
  t: TFunction
): string {
  const coach = findBuiltinCoach(message.coach_id);
  return coach
    ? BUILTIN_COACH_NAMES[coach.key](t)
    : t('coaches.sparky.name', { defaultValue: 'Sparky' });
}
