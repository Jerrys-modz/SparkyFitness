import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import { getDueDosesForDate, type ReadinessLevel } from '@workspace/shared';

import { useFitnessFatigue } from '../../hooks/useFitnessFatigue';
import {
  useMedicationEntries,
  useMedications,
} from '../../hooks/useMedications';
import { getDeviceTimezone } from '../../utils/dateUtils';
import { isDoseLogged } from '../../utils/medications';

interface SummaryStatusLineProps {
  date: string;
  /** Readiness is worked out for today only, so it is named only on today. */
  isToday: boolean;
}

const DOT_VARIABLE: Record<ReadinessLevel, string> = {
  noData: '--color-text-muted',
  low: '--color-text-danger-subtle',
  moderate: '--color-text-warning',
  high: '--color-icon-success',
};

/**
 * The one-line status at the top of the Summary tab: today's readiness in plain words
 * and how many scheduled doses are still due, e.g. "Ready for a normal session · 2 doses
 * still due". It reads the same cached queries as the Readiness and Medications cards,
 * and shows nothing when it has nothing to say.
 */
const SummaryStatusLine: React.FC<SummaryStatusLineProps> = ({
  date,
  isToday,
}) => {
  const { t } = useTranslation();
  const { data: fitness } = useFitnessFatigue(isToday);
  const { data: medications } = useMedications({ activeOnly: true });
  const { data: entries } = useMedicationEntries({
    fromDate: date,
    toDate: date,
  });
  const level: ReadinessLevel =
    isToday && fitness?.readiness.score != null
      ? fitness.readiness.level
      : 'noData';
  const dotColor = useCSSVariable(DOT_VARIABLE[level]) as string;

  const doses = useMemo(() => {
    if (!medications) return null;
    const due = getDueDosesForDate(medications, date, getDeviceTimezone());
    const remaining = due.filter(
      (dose) =>
        !isDoseLogged(entries ?? [], dose.medication.id, dose.schedule.id)
    ).length;
    return { total: due.length, remaining };
  }, [medications, entries, date]);

  const parts: string[] = [];
  if (level === 'high') {
    parts.push(
      t('dashboard.status.readyHard', {
        defaultValue: 'Ready for a hard session',
      })
    );
  } else if (level === 'moderate') {
    parts.push(
      t('dashboard.status.readyNormal', {
        defaultValue: 'Ready for a normal session',
      })
    );
  } else if (level === 'low') {
    parts.push(
      t('dashboard.status.takeItEasy', { defaultValue: 'Take it easy today' })
    );
  }
  if (doses && doses.total > 0) {
    parts.push(
      doses.remaining > 0
        ? t('dashboard.status.dosesDue', {
            defaultValue: '{{count}} doses still due',
            defaultValue_one: '{{count}} dose still due',
            defaultValue_other: '{{count}} doses still due',
            count: doses.remaining,
          })
        : t('dashboard.status.dosesDone', {
            defaultValue: 'All doses taken',
          })
    );
  }
  if (parts.length === 0) return null;

  return (
    <View
      testID="summary-status-line"
      className="flex-row items-center bg-surface rounded-xl px-4 py-3 mb-3 shadow-sm gap-3"
    >
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          backgroundColor: dotColor,
        }}
      />
      <Text className="text-sm text-text-primary flex-1">
        {parts.join(' · ')}
      </Text>
    </View>
  );
};

export default SummaryStatusLine;
