import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { programWeeks, type RunProgram } from '@workspace/shared';
import Icon from '../Icon';
import { formatLocalizedNumber } from '../../localization';

interface Props {
  program: RunProgram;
  testID?: string;
}

/**
 * Every workout of a program, week by week, behind a "Show every week"
 * toggle. Read-only: looking at a program here never changes the person's own.
 */
const RunProgramWeekPreview: React.FC<Props> = ({ program, testID }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const weeks = useMemo(() => programWeeks(program), [program]);

  return (
    <View className="mt-3" testID={testID}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        className="flex-row items-center justify-between py-1"
        testID={testID ? `${testID}-toggle` : undefined}
      >
        <Text className="text-text-primary text-sm font-medium">
          {open
            ? t('runPrograms.browse.hideWeeks', {
                defaultValue: 'Hide the weeks',
              })
            : t('runPrograms.browse.showWeeks', {
                defaultValue: 'Show every week',
              })}
        </Text>
        <Icon
          name={open ? 'chevron-down' : 'chevron-forward'}
          size={16}
          color="#999"
        />
      </Pressable>
      {open
        ? weeks.map(({ week, workouts }) => (
            <View key={week} className="mt-2">
              <Text className="text-text-secondary text-xs font-semibold">
                {t('runPrograms.browse.week', {
                  week: formatLocalizedNumber(week + 1),
                  defaultValue: 'Week {{week}}',
                })}
              </Text>
              {workouts.map(
                ({ index, workout, totalMinutes, effortMinutes }) => (
                  <Text
                    key={index}
                    className="text-text-muted text-xs mt-0.5"
                    testID={testID ? `${testID}-workout-${index}` : undefined}
                  >
                    {program.activity === 'walk'
                      ? t('runPrograms.browse.workoutWalk', {
                          number: formatLocalizedNumber(workout.day + 1),
                          total: formatLocalizedNumber(totalMinutes),
                          effort: formatLocalizedNumber(effortMinutes),
                          defaultValue:
                            'Walk {{number}} · {{total}} min, {{effort}} min brisk',
                        })
                      : t('runPrograms.browse.workoutRun', {
                          number: formatLocalizedNumber(workout.day + 1),
                          total: formatLocalizedNumber(totalMinutes),
                          effort: formatLocalizedNumber(effortMinutes),
                          defaultValue:
                            'Run {{number}} · {{total}} min, {{effort}} min of effort',
                        })}
                  </Text>
                )
              )}
            </View>
          ))
        : null}
    </View>
  );
};

export default RunProgramWeekPreview;
