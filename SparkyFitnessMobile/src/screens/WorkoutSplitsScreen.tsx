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
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import SegmentedControl, { type Segment } from '../components/SegmentedControl';
import Button from '../components/ui/Button';
import WorkoutSplitCard from '../components/WorkoutSplitCard';
import { useNavigationActionGuard } from '../hooks/useNavigationActionGuard';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import type { RootStackScreenProps } from '../types/navigation';
import { goalLabel, levelLabel, venueLabel } from '../utils/workoutSplits';

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
  const usesNativeHeader = useNativeIOSHeadersActive();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const { runNavigationAction } = useNavigationActionGuard(navigation);
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
        {' '}
        <Text className="text-text-secondary text-sm">
          {t('workoutSplits.page.intro', {
            defaultValue:
              'Ready-made strength splits for getting started. Each exercise has a rep range: reach the top on every set and the next session suggests a little more weight. Add one and change anything you like afterwards.',
          })}
        </Text>
        <View className="mt-3">
          <Button
            variant="outline"
            onPress={() =>
              runNavigationAction(() => navigation.navigate('WorkoutFinder'))
            }
          >
            {t('workoutSplits.page.finder', {
              defaultValue: 'Find my program',
            })}
          </Button>
        </View>
        {filters.map((filter) => (
          <View key={filter.id} className="mt-4" testID={`filter-${filter.id}`}>
            <Text className="text-sm font-medium text-text-secondary mb-1">
              {filter.label}
            </Text>
            <SegmentedControl
              segments={filter.segments}
              activeKey={filter.value}
              onSelect={filter.onChange}
            />
          </View>
        ))}
        <View className="mt-4">
          {visible.length === 0 ? (
            <Text className="text-text-secondary text-sm mt-6">
              {t('workoutSplits.page.none', {
                defaultValue:
                  'No program matches those filters. Try a different one.',
              })}
            </Text>
          ) : (
            visible.map((split) => (
              <WorkoutSplitCard
                key={split.id}
                split={split}
                expanded={expandedId === split.id}
                onToggle={() =>
                  setExpandedId(expandedId === split.id ? null : split.id)
                }
                onAdd={() =>
                  runNavigationAction(() =>
                    navigation.navigate('WorkoutSplitImport', {
                      splitId: split.id,
                    })
                  )
                }
              />
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
};

export default WorkoutSplitsScreen;
