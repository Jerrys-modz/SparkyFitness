import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import { buildGutTrainingRamp } from '@workspace/shared';

import { useRunGoals } from '../../hooks/useRunGoals';
import { getGutTrainingStartDay } from '../../services/gutTrainingStart';
import { formatLocalizedNumber } from '../../localization';
import { getTodayDate } from '../../utils/dateUtils';
import { formatDateWithYear, formatDayLabel } from '../../utils/dayLabel';

/** How many upcoming steps the card lists. */
const WEEKS_SHOWN = 4;

interface FuelingRaceCardProps {
  /** The carbohydrate per hour the plan aims at on race day. */
  targetCarbsPerHour: number;
  /** Fills the plan's carbohydrate field with this week's practice amount. */
  onUseAmount: (carbsPerHour: number) => void;
}

/**
 * The race from the person's running goals, with the gradual build-up of
 * carbohydrate per hour that gets the gut ready for the race-day target.
 * Renders nothing without a race ahead or a target to build toward.
 */
const FuelingRaceCard: React.FC<FuelingRaceCardProps> = ({
  targetCarbsPerHour,
  onUseAmount,
}) => {
  const { t } = useTranslation();
  const { data } = useRunGoals();
  const [accent] = useCSSVariable(['--color-accent-primary']) as [string];
  const raceDay = data?.goals?.race_date ?? null;
  const raceName = data?.goals?.race_name ?? null;
  const today = getTodayDate();

  // Kept with the race it was read for, so a changed race never briefly uses
  // the previous race's start day.
  const [stored, setStored] = useState<{
    raceDay: string;
    startDay: string;
  } | null>(null);
  useEffect(() => {
    if (!raceDay) return;
    let cancelled = false;
    void getGutTrainingStartDay(raceDay, today).then((day) => {
      if (!cancelled) setStored({ raceDay, startDay: day });
    });
    return () => {
      cancelled = true;
    };
  }, [raceDay, today]);
  const startDay =
    stored && stored.raceDay === raceDay ? stored.startDay : null;

  const ramp = useMemo(
    () =>
      raceDay && startDay
        ? buildGutTrainingRamp({
            today,
            raceDay,
            targetCarbsPerHour,
            startDay,
          })
        : null,
    [raceDay, startDay, today, targetCarbsPerHour]
  );

  if (!raceDay || !ramp) return null;

  const number = (value: number) =>
    formatLocalizedNumber(value, { maximumFractionDigits: 0 });

  const upcoming = ramp.weeks
    .filter((week) => week.startDay > today)
    .slice(0, WEEKS_SHOWN);

  const statusText = (() => {
    switch (ramp.status) {
      case 'not_started':
        return t('fuelingPlan.race.notStarted', {
          defaultValue:
            'The build-up starts on {{date}}. Until then keep practising {{current}} g/h.',
          date: ramp.rampStartDay ? formatDayLabel(ramp.rampStartDay) : '',
          current: number(ramp.currentCarbsPerHour),
        });
      case 'ramping':
        return t('fuelingPlan.race.ramping', {
          defaultValue:
            'This week practise {{current}} g/h. The race target is {{target}} g/h.',
          current: number(ramp.currentCarbsPerHour),
          target: number(ramp.targetCarbsPerHour),
        });
      case 'holding':
        return t('fuelingPlan.race.holding', {
          defaultValue:
            'Practise the race amount, {{target}} g/h, until race day.',
          target: number(ramp.targetCarbsPerHour),
        });
      case 'short':
        return t('fuelingPlan.race.short', {
          defaultValue:
            'Under three weeks to go is not enough time to build up to {{target}} g/h. Stay at what your stomach already handles, or aim lower on race day.',
          target: number(ramp.targetCarbsPerHour),
        });
    }
  })();

  return (
    <View testID="fueling-race-card" className="bg-surface rounded-xl p-4 mb-4">
      <Text className="text-text-primary text-base font-semibold">
        {raceName
          ? t('fuelingPlan.race.title', {
              defaultValue: 'Race: {{name}}',
              name: raceName,
            })
          : t('fuelingPlan.race.titleNoName', { defaultValue: 'Your race' })}
      </Text>
      <Text className="text-text-secondary text-sm mt-0.5">
        {t('fuelingPlan.race.when', {
          defaultValue: '{{date}}, in {{count}} days',
          defaultValue_one: '{{date}}, in {{count}} day',
          defaultValue_other: '{{date}}, in {{count}} days',
          date: formatDateWithYear(raceDay),
          count: ramp.daysToRace,
        })}
      </Text>
      <Text
        testID="fueling-race-status"
        className="text-text-primary text-sm mt-3"
      >
        {statusText}
      </Text>
      {upcoming.length > 0 ? (
        <Text
          testID="fueling-race-weeks"
          className="text-text-secondary text-sm mt-2"
        >
          {upcoming
            .map((week) =>
              t('fuelingPlan.race.week', {
                defaultValue: '{{date}}: {{carbs}} g/h',
                date: formatDayLabel(week.startDay),
                carbs: number(week.carbsPerHour),
              })
            )
            .join('\n')}
        </Text>
      ) : null}
      <Pressable
        testID="fueling-race-use"
        accessibilityRole="button"
        onPress={() => onUseAmount(ramp.currentCarbsPerHour)}
        className="mt-3"
        style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
      >
        <Text style={{ color: accent }} className="text-sm font-semibold">
          {t('fuelingPlan.race.use', {
            defaultValue: 'Plan this run at {{carbs}} g/h',
            carbs: number(ramp.currentCarbsPerHour),
          })}
        </Text>
      </Pressable>
    </View>
  );
};

export default FuelingRaceCard;
