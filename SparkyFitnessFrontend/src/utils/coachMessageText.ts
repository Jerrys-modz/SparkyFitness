import type { TFunction } from 'i18next';
import {
  findBuiltinCoach,
  type CoachMessage,
  type CoachTriggerType,
} from '@workspace/shared';
import { BUILTIN_COACH_LABELS } from '@/utils/builtinCoachLabels';

// Translation key and English fallback for each kind of check-in. The numbers
// come from the message's `facts`.
const TRIGGER_TEXT: Record<CoachTriggerType, [string, string]> = {
  low_protein_after_training: [
    'coachMessages.lowProteinAfterTraining',
    'You trained yesterday and logged {{protein}} g of protein against your {{goal}} g goal. A protein-rich meal today would help you recover.',
  ],
  short_sleep_under_load: [
    'coachMessages.shortSleepUnderLoad',
    'You slept about {{hours}} hours last night after {{workouts}} workouts in three days. An easier session or an early night could pay off.',
  ],
  logging_gap: [
    'coachMessages.loggingGap',
    'It has been {{days}} days since your last entry. No catching up needed: logging one meal today is enough to get going again.',
  ],
  streak_milestone: [
    'coachMessages.streakMilestone',
    'You have logged {{days}} days in a row. That consistency is what makes the numbers useful.',
  ],
};

/** What a coach message says: the AI wording when there is one, else ours. */
export function coachMessageText(message: CoachMessage, t: TFunction): string {
  if (message.text) return message.text;
  const [key, fallback] = TRIGGER_TEXT[message.trigger_type];
  return t(key, { defaultValue: fallback, ...message.facts });
}

/** The name of the coach that left a message. */
export function coachMessageCoachName(
  message: CoachMessage,
  t: TFunction
): string {
  const coach = findBuiltinCoach(message.coach_id);
  if (!coach) return t('coaches.sparky.name', 'Sparky');
  const [key, fallback] = BUILTIN_COACH_LABELS[coach.key].name;
  return t(key, fallback);
}
