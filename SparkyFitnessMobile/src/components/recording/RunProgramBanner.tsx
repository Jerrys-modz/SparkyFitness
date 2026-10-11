import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useCSSVariable } from 'uniwind';
import { planMinutes } from '@workspace/shared';
import Icon from '../Icon';
import Button from '../ui/Button';
import { useRunReminders } from '../../services/runReminderService';
import {
  useProgramDoneDay,
  useRunProgram,
} from '../../services/runProgramService';
import { toLocalDateString } from '../../utils/dateUtils';
import { programDayCard } from '../../utils/runProgramDay';
import { programName } from './RunProgramCard';

/**
 * The Diary's card for today's training program workout, in the style of a
 * scheduled workout plan: on a run day (or any day, when no run days are
 * chosen) it offers the next workout with a Start button.
 */
const RunProgramBanner: React.FC<{
  /** The day the Diary is showing, YYYY-MM-DD. */
  date: string;
  onStart: () => void;
}> = ({ date, onStart }) => {
  const { t } = useTranslation();
  const [accent] = useCSSVariable(['--color-accent-primary']) as [string];
  const [today] = useState(() => toLocalDateString(new Date()));
  const { status, enabled, loaded } = useRunProgram();
  const { days } = useRunReminders();
  const doneDay = useProgramDoneDay();

  const card = loaded
    ? programDayCard({
        enabled,
        status,
        runDays: days,
        doneDay,
        today,
        date,
      })
    : null;
  if (!card || !status?.workout) return null;

  const workout = status.workout;
  return (
    <View
      className="bg-surface rounded-xl p-4 mb-2 shadow-sm"
      testID="run-program-banner"
    >
      <View className="flex-row items-center gap-1.5 mb-2">
        <Icon name="calendar" size={14} color={accent || '#3B82F6'} />
        <Text
          className="text-xs font-semibold text-text-secondary flex-1"
          numberOfLines={1}
        >
          {programName(t, status.program.id)} •{' '}
          {card === 'scheduled'
            ? t('runPrograms.banner.scheduledToday', {
                defaultValue: 'Scheduled Today',
              })
            : t('runPrograms.banner.upNext', { defaultValue: 'Up next' })}
        </Text>
      </View>
      <View className="flex-row items-center justify-between">
        <Text
          className="text-base font-semibold text-text-primary flex-1 mr-3"
          numberOfLines={2}
        >
          {t('runPrograms.banner.title', {
            week: workout.week + 1,
            run: workout.day + 1,
            minutes: planMinutes(workout.plan),
            defaultValue: 'Week {{week}}, run {{run}} · {{minutes}} min',
          })}
        </Text>
        <Button variant="primary" onPress={onStart}>
          {t('runPrograms.banner.start', { defaultValue: 'Start' })}
        </Button>
      </View>
    </View>
  );
};

export default RunProgramBanner;
