import type { TFunction } from 'i18next';
import type { WeightMilestone } from '@workspace/shared';
import { formatWeight } from '@/utils/numberFormatting';

/** A weight change with its sign, e.g. "-2.4 kg"; never "-0 kg". */
export function signedWeight(kg: number, unit: string): string {
  const text = formatWeight(Math.abs(kg), unit);
  // Rounded to nothing (e.g. "0 kg", "0st 0lbs"): no sign.
  if (Number(text.replace(/[^\d.]/g, '')) === 0) return text;
  if (kg > 0) return `+${text}`;
  if (kg < 0) return `-${text}`;
  return text;
}

/** A signed percent with one decimal, e.g. "-4.2%". */
export function signedPercent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) return '0%';
  return `${rounded > 0 ? '+' : '-'}${Math.abs(rounded).toFixed(1)}%`;
}

/** The milestone's name, in neutral words. */
export function milestoneLabel(
  milestone: WeightMilestone,
  t: TFunction
): string {
  switch (milestone.kind) {
    case 'amount': {
      // Ids are `amount:<value>:<unit>`; the unit is the one counted in.
      const unit = milestone.id.endsWith(':lbs') ? 'lbs' : 'kg';
      return t(
        'reports.weightProgress.milestoneAmount',
        '{{amount}} {{unit}} from your start',
        { amount: milestone.value, unit }
      );
    }
    case 'percent':
      return t(
        'reports.weightProgress.milestonePercent',
        '{{percent}}% of your starting weight',
        { percent: milestone.value }
      );
    case 'halfway':
      return t('reports.weightProgress.milestoneHalfway', 'Halfway to goal');
    case 'goal':
      return t('reports.weightProgress.milestoneGoal', 'Goal weight');
  }
}
