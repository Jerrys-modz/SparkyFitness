import type { TFunction } from 'i18next';
import type {
  CoachingDataNote,
  CoachingGoalDirection,
  CoachingLimit,
  CoachingReason,
} from '@workspace/shared';

import { formatLocalizedNumber } from '../localization';

// Every string below is a literal key so the i18n audit can see it.

export function coachingReasonTitle(
  t: TFunction,
  reason: CoachingReason
): string {
  switch (reason) {
    case 'insufficient-data':
      return t('coaching.reason.insufficientData.title', {
        defaultValue: 'Not enough data yet',
      });
    case 'low-adherence':
      return t('coaching.reason.lowAdherence.title', {
        defaultValue: 'Too many unlogged days to judge',
      });
    case 'implausible-estimate':
      return t('coaching.reason.implausible.title', {
        defaultValue: 'The estimate looks off',
      });
    case 'on-track':
      return t('coaching.reason.onTrack.title', { defaultValue: 'On track' });
    case 'behind':
      return t('coaching.reason.behind.title', {
        defaultValue: 'Behind your goal',
      });
    case 'ahead':
      return t('coaching.reason.ahead.title', {
        defaultValue: 'Ahead of your goal',
      });
  }
}

export function coachingReasonBody(
  t: TFunction,
  reason: CoachingReason,
  direction: CoachingGoalDirection
): string {
  switch (reason) {
    case 'insufficient-data':
      return t('coaching.reason.insufficientData.body', {
        defaultValue:
          'A check-in needs a few weeks of weigh-ins and logged meals. Keep logging and it will appear here.',
      });
    case 'low-adherence':
      return t('coaching.reason.lowAdherence.body', {
        defaultValue:
          'Several recent days have no food logged, so what you ate cannot be compared with your weight reliably. Log most days and check again.',
      });
    case 'implausible-estimate':
      return t('coaching.reason.implausible.body', {
        defaultValue:
          'The numbers imply an energy use that does not look realistic, usually from missing food logs or a stray weigh-in. Nothing was changed.',
      });
    case 'on-track':
      return t('coaching.reason.onTrack.body', {
        defaultValue:
          'Your weight is moving at about the rate you asked for. Your targets stay as they are.',
      });
    case 'behind':
      if (direction === 'lose') {
        return t('coaching.reason.behind.bodyLose', {
          defaultValue:
            'Your weight is dropping more slowly than your goal rate, so a lower calorie target is suggested.',
        });
      }
      if (direction === 'gain') {
        return t('coaching.reason.behind.bodyGain', {
          defaultValue:
            'Your weight is rising more slowly than your goal rate, so a higher calorie target is suggested.',
        });
      }
      return t('coaching.reason.behind.bodyMaintain', {
        defaultValue:
          'Your weight is drifting away from steady, so a small adjustment is suggested.',
      });
    case 'ahead':
      if (direction === 'gain') {
        return t('coaching.reason.ahead.bodyGain', {
          defaultValue:
            'You are gaining faster than your goal rate. A slightly lower target keeps the gain steady.',
        });
      }
      return t('coaching.reason.ahead.bodyLose', {
        defaultValue:
          'You are losing faster than your goal rate. A slightly higher target keeps the pace sustainable.',
      });
  }
}

export function coachingDirectionLabel(
  t: TFunction,
  direction: CoachingGoalDirection
): string {
  switch (direction) {
    case 'lose':
      return t('coaching.direction.lose', { defaultValue: 'Lose' });
    case 'gain':
      return t('coaching.direction.gain', { defaultValue: 'Gain' });
    case 'maintain':
      return t('coaching.direction.maintain', { defaultValue: 'Maintain' });
  }
}

export function coachingLimitText(t: TFunction, limit: CoachingLimit): string {
  switch (limit) {
    case 'weekly-cap':
      return t('coaching.limit.weeklyCap', {
        defaultValue:
          'Limited to a 10% change this week; a further change may follow next week.',
      });
    case 'safety-floor':
      return t('coaching.limit.safetyFloor', {
        defaultValue: 'Held at your minimum safe calorie level.',
      });
  }
}

export function coachingNoteText(t: TFunction, note: CoachingDataNote): string {
  switch (note.kind) {
    case 'logDays':
      return t('coaching.note.logDays', {
        count: note.count,
        defaultValue: 'Log {{count}} more days for a reliable estimate',
        defaultValue_one: 'Log {{count}} more day for a reliable estimate',
        defaultValue_other: 'Log {{count}} more days for a reliable estimate',
      });
    case 'weighIns':
      return t('coaching.note.weighIns', {
        count: note.count,
        defaultValue: 'Weigh in {{count}} more times',
        defaultValue_one: 'Weigh in {{count}} more time',
        defaultValue_other: 'Weigh in {{count}} more times',
      });
    case 'weighSpan':
      return t('coaching.note.weighSpan', {
        count: note.count,
        defaultValue:
          'Keep weighing in for {{count}} more days to cover two weeks',
        defaultValue_one:
          'Keep weighing in for {{count}} more day to cover two weeks',
        defaultValue_other:
          'Keep weighing in for {{count}} more days to cover two weeks',
      });
    case 'lowAdherence':
      return t('coaching.note.lowAdherence', {
        percent: formatLocalizedNumber(note.percent),
        defaultValue: 'Only {{percent}}% of recent days have food logged',
      });
    case 'excludedDays':
      return t('coaching.note.excludedDays', {
        count: note.count,
        defaultValue: '{{count}} days left out because little food was logged',
        defaultValue_one:
          '{{count}} day left out because little food was logged',
        defaultValue_other:
          '{{count}} days left out because little food was logged',
      });
    case 'outliers':
      return t('coaching.note.outliers', {
        count: note.count,
        defaultValue:
          '{{count}} weigh-ins ignored as out of line with your trend',
        defaultValue_one:
          '{{count}} weigh-in ignored as out of line with your trend',
        defaultValue_other:
          '{{count}} weigh-ins ignored as out of line with your trend',
      });
  }
}
