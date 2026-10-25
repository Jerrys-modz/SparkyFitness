import React from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { CalendarWeekTotals } from '@workspace/shared';
import { STATUS_COLORS, weekProgress } from '../../utils/trainingCalendar';

/** Done, partly done and missed shares of a week's planned sessions; the rest is still to come. */
const WeekProgressBar: React.FC<{ week: CalendarWeekTotals }> = ({ week }) => {
  const { t } = useTranslation();
  const p = weekProgress(week);
  if (p.planned <= 0) return null;
  const segments = [
    { key: 'done', size: p.done, color: STATUS_COLORS.done },
    { key: 'partial', size: p.partial, color: STATUS_COLORS.partial },
    { key: 'missed', size: p.missed, color: STATUS_COLORS.missed },
    { key: 'rest', size: p.rest, color: STATUS_COLORS.upcoming },
  ].filter((segment) => segment.size > 0);
  return (
    <View
      testID={`week-progress-${week.start}`}
      accessible
      accessibilityLabel={t('trainingCalendar.progressA11y', {
        done: p.done,
        partial: p.partial,
        missed: p.missed,
        planned: p.planned,
        defaultValue:
          '{{done}} done, {{partial}} partly done, {{missed}} missed, of {{planned}} planned',
      })}
      className="flex-row rounded-full overflow-hidden my-1"
      style={{ height: 4, gap: 1 }}
    >
      {segments.map((segment) => (
        <View
          key={segment.key}
          testID={`week-progress-${segment.key}`}
          style={{ flex: segment.size, backgroundColor: segment.color }}
        />
      ))}
    </View>
  );
};

export default WeekProgressBar;
