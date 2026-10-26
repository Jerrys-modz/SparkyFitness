import React, { useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  applyTrainerOptions,
  recommendWorkoutSplits,
  TRAINER_DAYS_PER_WEEK,
  TRAINER_FOCUSES,
  TRAINER_SESSION_MINUTES,
  WORKOUT_SPLIT_GOALS,
  WORKOUT_SPLIT_VENUES,
  type TrainerFocus,
  type TrainerRecommendation,
  type TrainerSessionMinutes,
  type WorkoutSplitGoal,
  type WorkoutSplitLevel,
  type WorkoutSplitVenue,
} from '@workspace/shared';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import SegmentedControl, { type Segment } from '../components/SegmentedControl';
import WorkoutSplitCard from '../components/WorkoutSplitCard';
import { useNavigationActionGuard } from '../hooks/useNavigationActionGuard';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import type { RootStackScreenProps } from '../types/navigation';
import {
  focusLabel,
  goalLabel,
  levelLabel,
  venueLabel,
} from '../utils/workoutSplits';

type Props = RootStackScreenProps<'WorkoutFinder'>;

const BALANCED = 'balanced';
const LEVELS: readonly WorkoutSplitLevel[] = ['beginner', 'intermediate'];

/**
 * The program finder: a few answers pick the closest ready-made program,
 * fitted to the person's session length and a muscle to focus on. Adding sends
 * only the answers; the server rebuilds the same program from them.
 */
const WorkoutFinderScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const { runNavigationAction } = useNavigationActionGuard(navigation);
  const [goal, setGoal] = useState<WorkoutSplitGoal>('muscle');
  const [level, setLevel] = useState<WorkoutSplitLevel>('beginner');
  const [days, setDays] = useState<number>(3);
  const [minutes, setMinutes] = useState<TrainerSessionMinutes>(60);
  const [venue, setVenue] = useState<WorkoutSplitVenue>('gym');
  const [focus, setFocus] = useState<TrainerFocus | typeof BALANCED>(BALANCED);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const header = useScreenHeader({
    title: t('workoutSplits.finder.title', { defaultValue: 'Find my program' }),
    left: { kind: 'back' },
  });

  const focusValue = focus === BALANCED ? undefined : focus;
  const recommendations = recommendWorkoutSplits({
    goal,
    level,
    daysPerWeek: days,
    venue,
  });

  const noteFor = (rec: TrainerRecommendation): string => {
    const differs: string[] = [];
    if (rec.daysDifference !== 0) {
      differs.push(
        t('workoutSplits.finder.differsDays', {
          days: rec.split.daysPerWeek,
          defaultValue: '{{days}} days a week',
        })
      );
    }
    if (!rec.matchesGoal) {
      differs.push(
        t('workoutSplits.finder.differsGoal', {
          goal: goalLabel(t, rec.split.goal).toLowerCase(),
          defaultValue: 'a {{goal}} program',
        })
      );
    }
    if (!rec.matchesLevel) {
      differs.push(
        t('workoutSplits.finder.differsLevel', {
          level: levelLabel(t, rec.split.level).toLowerCase(),
          defaultValue: 'a {{level}} program',
        })
      );
    }
    return differs.length === 0
      ? t('workoutSplits.finder.matches', {
          defaultValue: 'Matches everything you asked for.',
        })
      : t('workoutSplits.finder.differs', {
          differences: differs.join(', '),
          defaultValue: 'Closest match: {{differences}}.',
        });
  };

  const rows: {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    segments: Segment<string>[];
  }[] = [
    {
      id: 'goal',
      label: t('workoutSplits.filters.goal', { defaultValue: 'Goal' }),
      value: goal,
      onChange: (value) => setGoal(value as WorkoutSplitGoal),
      segments: WORKOUT_SPLIT_GOALS.map((value) => ({
        key: value as string,
        label: goalLabel(t, value),
      })),
    },
    {
      id: 'level',
      label: t('workoutSplits.finder.experience', {
        defaultValue: 'Training experience',
      }),
      value: level,
      onChange: (value) => setLevel(value as WorkoutSplitLevel),
      segments: LEVELS.map((value) => ({
        key: value as string,
        label: levelLabel(t, value),
      })),
    },
    {
      id: 'days',
      label: t('workoutSplits.filters.days', { defaultValue: 'Days a week' }),
      value: String(days),
      onChange: (value) => setDays(Number(value)),
      segments: TRAINER_DAYS_PER_WEEK.map((value) => ({
        key: String(value),
        label: String(value),
      })),
    },
    {
      id: 'minutes',
      label: t('workoutSplits.finder.minutes', {
        defaultValue: 'Workout length',
      }),
      value: String(minutes),
      onChange: (value) => setMinutes(Number(value) as TrainerSessionMinutes),
      segments: TRAINER_SESSION_MINUTES.map((value) => ({
        key: String(value),
        label: t('workoutSplits.finder.minutesShort', {
          minutes: value,
          defaultValue: '{{minutes}} min',
        }),
      })),
    },
    {
      id: 'venue',
      label: t('workoutSplits.filters.venue', {
        defaultValue: 'Where I train',
      }),
      value: venue,
      onChange: (value) => setVenue(value as WorkoutSplitVenue),
      segments: WORKOUT_SPLIT_VENUES.map((value) => ({
        key: value as string,
        label: venueLabel(t, value),
      })),
    },
  ];

  const focusOptions: { key: TrainerFocus | typeof BALANCED; label: string }[] =
    [
      {
        key: BALANCED,
        label: t('workoutSplits.finder.balanced', {
          defaultValue: 'Balanced program',
        }),
      },
      ...TRAINER_FOCUSES.map((value) => ({
        key: value,
        label: focusLabel(t, value),
      })),
    ];

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      <ScrollView
        className="flex-1"
        contentInsetAdjustmentBehavior={
          usesNativeHeader ? 'automatic' : 'never'
        }
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
      >
        <Text className="text-text-secondary text-sm">
          {t('workoutSplits.finder.intro', {
            defaultValue:
              'Answer a few questions and get the closest ready-made program, fitted to how long you want to train and a muscle you want to give extra attention.',
          })}
        </Text>

        {rows.map((row) => (
          <View key={row.id} className="mt-4" testID={`finder-${row.id}`}>
            <Text className="text-sm font-medium text-text-secondary mb-1">
              {row.label}
            </Text>
            <SegmentedControl
              segments={row.segments}
              activeKey={row.value}
              onSelect={row.onChange}
            />
          </View>
        ))}

        <View className="mt-4" testID="finder-focus">
          <Text className="text-sm font-medium text-text-secondary mb-1">
            {t('workoutSplits.finder.focus', {
              defaultValue: 'Muscle to focus on',
            })}
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {focusOptions.map((option) => {
              const selected = focus === option.key;
              return (
                <TouchableOpacity
                  key={option.key}
                  onPress={() => setFocus(option.key)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  className={`px-4 py-2 rounded-full border ${
                    selected
                      ? 'bg-accent-primary border-accent-primary'
                      : 'bg-raised border-border-subtle'
                  }`}
                >
                  <Text
                    className={`text-sm font-medium ${
                      selected ? 'text-white' : 'text-text-primary'
                    }`}
                    numberOfLines={1}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View className="mt-4">
          {recommendations.map((rec, index) => (
            <View key={rec.split.id} testID={`finder-result-${index}`}>
              <WorkoutSplitCard
                split={rec.split}
                fitted={applyTrainerOptions(rec.split, {
                  venue,
                  sessionMinutes: minutes,
                  focus: focusValue,
                })}
                note={
                  index === 0
                    ? `${t('workoutSplits.finder.bestMatch', {
                        defaultValue: 'Best match.',
                      })} ${noteFor(rec)}`
                    : noteFor(rec)
                }
                expanded={expandedId === rec.split.id}
                onToggle={() =>
                  setExpandedId(
                    expandedId === rec.split.id ? null : rec.split.id
                  )
                }
                onAdd={() =>
                  runNavigationAction(() =>
                    navigation.navigate('WorkoutSplitImport', {
                      splitId: rec.split.id,
                      trainer: {
                        venue,
                        sessionMinutes: minutes,
                        focus: focusValue,
                      },
                    })
                  )
                }
              />
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
};

export default WorkoutFinderScreen;
