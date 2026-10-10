import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import Button from '../ui/Button';
import { planMinutes, type ProgramStatus } from '../../utils/runPrograms';

export function programName(t: TFunction, id: string): string {
  switch (id) {
    case 'couchTo5k':
      return t('recordActivity.program.name.couchTo5k', {
        defaultValue: 'Couch to 5K',
      });
    default:
      return id;
  }
}

/** "Week 3, run 2" for a program workout. */
export function programWorkoutLabel(
  t: TFunction,
  status: ProgramStatus
): string {
  const workout = status.workout;
  if (!workout) return programName(t, status.program.id);
  return t('recordActivity.program.workoutLabel', {
    name: programName(t, status.program.id),
    week: workout.week + 1,
    run: workout.day + 1,
    defaultValue: '{{name}} · Week {{week}}, run {{run}}',
  });
}

interface Props {
  status: ProgramStatus | null;
  loaded: boolean;
  /** Whether today's program workout is the plan chosen for this recording. */
  selected: boolean;
  onSelect: () => void;
  onStart: () => void;
  onSkip: () => void;
  onStop: () => void;
}

/** Start, follow and leave a multi-week run program. */
const RunProgramCard: React.FC<Props> = ({
  status,
  loaded,
  selected,
  onSelect,
  onStart,
  onSkip,
  onStop,
}) => {
  const { t } = useTranslation();
  if (!loaded) return null;

  if (!status) {
    return (
      <View className="bg-surface rounded-xl p-4 mt-4">
        <Text className="text-text-primary text-sm font-semibold">
          {t('recordActivity.program.title', {
            defaultValue: 'Training program',
          })}
        </Text>
        <Text className="text-text-secondary text-xs mt-1 mb-3">
          {t('recordActivity.program.couchTo5kDescription', {
            defaultValue:
              'Couch to 5K: nine weeks, three runs a week. You alternate running and walking, and build up to 30 minutes of running.',
          })}
        </Text>
        <Button variant="outline" onPress={onStart}>
          {t('recordActivity.program.start', {
            defaultValue: 'Start Couch to 5K',
          })}
        </Button>
      </View>
    );
  }

  const fraction = status.total > 0 ? status.done / status.total : 0;
  return (
    <View className="bg-surface rounded-xl p-4 mt-4">
      <Text className="text-text-primary text-sm font-semibold">
        {status.finished
          ? t('recordActivity.program.finished', {
              name: programName(t, status.program.id),
              defaultValue: '{{name}} complete',
            })
          : programWorkoutLabel(t, status)}
      </Text>
      <Text className="text-text-secondary text-xs mt-1">
        {status.finished
          ? t('recordActivity.program.finishedHint', {
              defaultValue: 'Well done. You can start it again or move on.',
            })
          : t('recordActivity.program.progress', {
              done: status.done,
              total: status.total,
              minutes: status.workout ? planMinutes(status.workout.plan) : 0,
              defaultValue:
                'Workout {{done}} of {{total}} done · {{minutes}} min today',
            })}
      </Text>
      <View className="h-2 rounded-full bg-raised mt-3 overflow-hidden">
        <View
          className="h-2 rounded-full bg-accent-primary"
          style={{ width: `${Math.round(fraction * 100)}%` }}
        />
      </View>
      <View className="flex-row mt-3">
        {status.finished ? (
          <View className="flex-1 mr-2">
            <Button variant="outline" onPress={onStart}>
              {t('recordActivity.program.restart', {
                defaultValue: 'Start again',
              })}
            </Button>
          </View>
        ) : (
          <View className="flex-1 mr-2">
            <Button
              variant={selected ? 'primary' : 'outline'}
              onPress={onSelect}
            >
              {selected
                ? t('recordActivity.program.using', {
                    defaultValue: 'Using this workout',
                  })
                : t('recordActivity.program.use', {
                    defaultValue: 'Do this workout',
                  })}
            </Button>
          </View>
        )}
      </View>
      <View className="flex-row mt-1">
        {status.finished ? null : (
          <Button variant="link" onPress={onSkip}>
            {t('recordActivity.program.skip', { defaultValue: 'Skip' })}
          </Button>
        )}
        <Button variant="link" onPress={onStop}>
          {t('recordActivity.program.stop', { defaultValue: 'Leave program' })}
        </Button>
      </View>
    </View>
  );
};

export default RunProgramCard;
