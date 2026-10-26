import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  splitFitsVenue,
  WORKOUT_SPLITS,
  WORKOUT_SPLIT_GOALS,
  WORKOUT_SPLIT_VENUES,
  type WorkoutSplit,
  type WorkoutSplitLevel,
} from '@workspace/shared';
import SegmentedControl, { type Segment } from '../components/SegmentedControl';
import Button from '../components/ui/Button';
import { useScreenHeader } from '../hooks/useScreenHeader';
import type { RootStackScreenProps } from '../types/navigation';
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

type Props = RootStackScreenProps<'WorkoutSplits'>;

const ANY = 'any';
const LEVELS: readonly WorkoutSplitLevel[] = ['beginner', 'intermediate'];

/** The distinct days-a-week values the catalog offers, ascending. */
const DAYS_OPTIONS = [
  ...new Set(WORKOUT_SPLITS.map((split) => split.daysPerWeek)),
].sort((a, b) => a - b);

/**
 * Ready-made strength splits: filter by where the person trains, their level,
 * goal and days a week, look at the sessions, and add one to their own presets
 * and plans.
 */
const WorkoutSplitsScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [venue, setVenue] = useState<string>(ANY);
  const [level, setLevel] = useState<string>(ANY);
  const [goal, setGoal] = useState<string>(ANY);
  const [days, setDays] = useState<string>(ANY);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const header = useScreenHeader({
    title: t('screens.workoutSplits', { defaultValue: 'Workout programs' }),
    left: { kind: 'back' },
  });

  const any: Segment<string> = {
    key: ANY,
    label: t('workoutSplits.filters.any', { defaultValue: 'Any' }),
  };
  const filters: {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    segments: Segment<string>[];
  }[] = [
    {
      id: 'venue',
      label: t('workoutSplits.filters.venue', {
        defaultValue: 'Where I train',
      }),
      value: venue,
      onChange: setVenue,
      segments: [
        any,
        ...WORKOUT_SPLIT_VENUES.map((value) => ({
          key: value as string,
          label: venueLabel(t, value),
        })),
      ],
    },
    {
      id: 'level',
      label: t('workoutSplits.filters.level', { defaultValue: 'Level' }),
      value: level,
      onChange: setLevel,
      segments: [
        any,
        ...LEVELS.map((value) => ({
          key: value as string,
          label: levelLabel(t, value),
        })),
      ],
    },
    {
      id: 'goal',
      label: t('workoutSplits.filters.goal', { defaultValue: 'Goal' }),
      value: goal,
      onChange: setGoal,
      segments: [
        any,
        ...WORKOUT_SPLIT_GOALS.map((value) => ({
          key: value as string,
          label: goalLabel(t, value),
        })),
      ],
    },
    {
      id: 'days',
      label: t('workoutSplits.filters.days', { defaultValue: 'Days a week' }),
      value: days,
      onChange: setDays,
      segments: [
        any,
        ...DAYS_OPTIONS.map((value) => ({
          key: String(value),
          label: String(value),
        })),
      ],
    },
  ];

  const visible = WORKOUT_SPLITS.filter(
    (split) =>
      (venue === ANY ||
        splitFitsVenue(split, venue as WorkoutSplit['venue'])) &&
      (level === ANY || split.level === level) &&
      (goal === ANY || split.goal === goal) &&
      (days === ANY || split.daysPerWeek === Number(days))
  );

  return (
    <>
      {header}
      <ScrollView
        className="flex-1 bg-background"
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 24,
        }}
      >
        <Text className="text-text-secondary text-sm">
          {t('workoutSplits.page.intro', {
            defaultValue:
              'Ready-made strength splits for getting started. Each exercise has a rep range: reach the top on every set and the next session suggests a little more weight. Add one and change anything you like afterwards.',
          })}
        </Text>

        {filters.map((filter) => (
          <View key={filter.id} className="mt-4" testID={`filter-${filter.id}`}>
            <Text className="text-text-muted text-xs mb-1">{filter.label}</Text>
            <SegmentedControl
              segments={filter.segments}
              activeKey={filter.value}
              onSelect={filter.onChange}
            />
          </View>
        ))}

        {visible.length === 0 ? (
          <Text className="text-text-secondary text-sm mt-6">
            {t('workoutSplits.page.none', {
              defaultValue:
                'No program matches those filters. Try a different one.',
            })}
          </Text>
        ) : (
          visible.map((split) => {
            const expanded = expandedId === split.id;
            return (
              <View
                key={split.id}
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
                {expanded ? (
                  <View
                    className="mt-3"
                    testID={`workout-split-sessions-${split.id}`}
                  >
                    {split.sessions.map((session) => (
                      <View key={session.id} className="mb-3">
                        <Text className="text-text-primary text-sm font-medium">
                          {sessionName(t, session.id)}
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
                <View className="mt-3">
                  <Button
                    variant="ghost"
                    onPress={() => setExpandedId(expanded ? null : split.id)}
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
                  <Button
                    variant="outline"
                    onPress={() =>
                      navigation.navigate('WorkoutSplitImport', {
                        splitId: split.id,
                      })
                    }
                  >
                    {t('workoutSplits.card.add', {
                      defaultValue: 'Add to my workouts',
                    })}
                  </Button>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </>
  );
};

export default WorkoutSplitsScreen;
