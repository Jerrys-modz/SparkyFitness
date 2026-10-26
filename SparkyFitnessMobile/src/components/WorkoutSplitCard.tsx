import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { estimateSessionMinutes, type WorkoutSplit } from '@workspace/shared';
import Button from './ui/Button';
import {
  exerciseLabel,
  exerciseTarget,
  goalLabel,
  levelLabel,
  sessionName,
  splitDescription,
  splitName,
  venueLabel,
} from '../utils/workoutSplits';

interface WorkoutSplitCardProps {
  split: WorkoutSplit;
  expanded: boolean;
  onToggle: () => void;
  onAdd: () => void;
  /** The program as fitted to the person; its sessions are shown, with their length. */
  fitted?: WorkoutSplit;
  /** Where the program differs from what was asked, for the program finder. */
  note?: string;
}

/** One built-in program: what it is, what it needs, a look at its sessions, and the way to add it. */
const WorkoutSplitCard: React.FC<WorkoutSplitCardProps> = ({
  split,
  expanded,
  onToggle,
  onAdd,
  fitted,
  note,
}) => {
  const { t } = useTranslation();
  return (
    <View
      className="bg-surface rounded-xl p-4 mt-4"
      testID={`workout-split-${split.id}`}
    >
      <Text className="text-text-primary text-base font-semibold">
        {splitName(t, split.id)}
      </Text>
      <Text className="text-text-muted text-xs mt-0.5">
        {`${levelLabel(t, split.level)} · ${goalLabel(t, split.goal)} · ${venueLabel(t, split.venue)}`}
      </Text>
      <Text className="text-text-muted text-xs mt-0.5">
        {t('workoutSplits.card.summary', {
          days: split.daysPerWeek,
          sessions: split.sessions.length,
          defaultValue:
            '{{days}} days a week, {{sessions}} sessions in rotation',
        })}
      </Text>
      <Text className="text-text-secondary text-sm mt-2">
        {splitDescription(t, split.id)}
      </Text>
      {note ? (
        <Text className="text-text-primary text-sm font-medium mt-2">
          {note}
        </Text>
      ) : null}
      {expanded ? (
        <View className="mt-3" testID={`workout-split-sessions-${split.id}`}>
          {(fitted ?? split).sessions.map((session) => (
            <View key={session.id} className="mb-3">
              <Text className="text-text-primary text-sm font-medium">
                {fitted
                  ? t('workoutSplits.card.sessionMinutes', {
                      name: sessionName(t, session.id),
                      minutes: estimateSessionMinutes(session),
                      defaultValue: '{{name}} · about {{minutes}} min',
                    })
                  : sessionName(t, session.id)}
              </Text>
              {session.exercises.map((exercise) => (
                <View
                  key={exercise.exerciseId}
                  className="flex-row justify-between mt-0.5"
                >
                  <Text className="text-text-secondary text-sm flex-1 mr-3">
                    {exerciseLabel(exercise.exerciseId)}
                  </Text>
                  <Text className="text-text-secondary text-sm">
                    {exerciseTarget(t, exercise)}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      ) : null}
      <View className="mt-1">
        <Button
          variant="ghost"
          onPress={onToggle}
          accessibilityState={{ expanded }}
        >
          {expanded
            ? t('workoutSplits.card.hideSessions', {
                defaultValue: 'Hide sessions',
              })
            : t('workoutSplits.card.showSessions', {
                defaultValue: 'Show sessions',
              })}
        </Button>
      </View>
      <View className="mt-2">
        <Button variant="outline" onPress={onAdd}>
          {t('workoutSplits.card.add', { defaultValue: 'Add to my workouts' })}
        </Button>
      </View>
    </View>
  );
};

export default WorkoutSplitCard;
