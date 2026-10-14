import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useCSSVariable } from 'uniwind';
import Button from '../components/ui/Button';
import Icon from '../components/Icon';
import { useScreenHeader } from '../hooks/useScreenHeader';
import {
  removeCustomProgram,
  saveCustomProgram,
  useCustomRunPrograms,
} from '../services/runProgramService';
import { addLog } from '../services/LogService';
import type { RootStackScreenProps } from '../types/navigation';
import {
  addStep,
  addWorkout,
  canAddWorkout,
  cycleStepKind,
  draftFromProgram,
  draftProblem,
  draftToInput,
  duplicateWorkout,
  emptyDraft,
  moveWorkout,
  nudgeStep,
  removeStep,
  removeWorkout,
  setWorkoutTitle,
  workoutSeconds,
  type DraftActivity,
  type ProgramDraft,
  type StepKind,
} from '../utils/customProgramDraft';

type Props = RootStackScreenProps<'RunProgramEdit'>;

const clock = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

const kindLabel = (
  t: ReturnType<typeof useTranslation>['t'],
  kind: StepKind,
  activity: DraftActivity
): string => {
  switch (kind) {
    case 'warmup':
      return t('runPrograms.custom.kind.warmup', { defaultValue: 'Warm up' });
    case 'cooldown':
      return t('runPrograms.custom.kind.cooldown', {
        defaultValue: 'Cool down',
      });
    case 'recovery':
      return t('runPrograms.custom.kind.recovery', {
        defaultValue: 'Easy',
      });
    default:
      return activity === 'walk'
        ? t('runPrograms.custom.kind.workWalk', { defaultValue: 'Brisk walk' })
        : t('runPrograms.custom.kind.workRun', { defaultValue: 'Run' });
  }
};

const IconButton: React.FC<{
  icon: React.ComponentProps<typeof Icon>['name'];
  label: string;
  onPress: () => void;
  disabled?: boolean;
  color: string;
  testID?: string;
}> = ({ icon, label, onPress, disabled, color, testID }) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    accessibilityRole="button"
    accessibilityLabel={label}
    hitSlop={8}
    className="p-2"
    style={{ opacity: disabled ? 0.3 : 1 }}
    testID={testID}
  >
    <Icon name={icon} size={18} color={color} />
  </Pressable>
);

/**
 * Builds or changes one of the person's own programs: a name, run or walk, and
 * a free list of workouts, each a list of timed steps.
 */
const RunProgramEditScreen: React.FC<Props> = ({ navigation, route }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const id = route.params?.id;
  const { programs, loaded } = useCustomRunPrograms();
  const existing = id ? programs.find((p) => p.id === id) : undefined;
  const [muted, accent] = useCSSVariable([
    '--color-text-muted',
    '--color-accent-primary',
  ]) as [string, string];
  const [draft, setDraft] = useState<ProgramDraft | null>(() =>
    id ? null : emptyDraft()
  );
  const [saving, setSaving] = useState(false);
  // An existing program fills the form once, when it arrives.
  if (id && !draft && existing) setDraft(draftFromProgram(existing));

  const header = useScreenHeader({
    title: id
      ? t('screens.runProgramEdit', { defaultValue: 'Edit plan' })
      : t('screens.runProgramNew', { defaultValue: 'New plan' }),
    left: { kind: 'back' },
  });

  if (!draft) {
    return (
      <>
        {header}
        <View className="flex-1 bg-background p-4">
          <Text className="text-text-secondary text-sm">
            {loaded
              ? t('runPrograms.custom.missing', {
                  defaultValue: 'This plan is no longer there.',
                })
              : t('common.loading', { defaultValue: 'Loading...' })}
          </Text>
        </View>
      </>
    );
  }

  const problem = draftProblem(draft);
  const problemText =
    problem === 'name'
      ? t('runPrograms.custom.problem.name', {
          defaultValue: 'Give the plan a name.',
        })
      : problem === 'noWorkouts'
        ? t('runPrograms.custom.problem.noWorkouts', {
            defaultValue: 'Add at least one workout.',
          })
        : problem === 'emptyWorkout'
          ? t('runPrograms.custom.problem.emptyWorkout', {
              defaultValue: 'Every workout needs at least one step.',
            })
          : null;

  const update = (next: ProgramDraft) => setDraft(next);

  const save = async () => {
    if (problem || saving) return;
    setSaving(true);
    try {
      await saveCustomProgram(draftToInput(draft), id);
      navigation.goBack();
    } catch (error) {
      addLog(`[Run Program] Could not save the plan: ${error}`, 'WARNING');
      Toast.show({
        type: 'error',
        text1: t('runPrograms.custom.saveError', {
          defaultValue: 'Could not save your plan',
        }),
        text2: t('common.tryAgain', { defaultValue: 'Please try again.' }),
      });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = () => {
    if (!id) return;
    Alert.alert(
      t('runPrograms.custom.deleteTitle', {
        defaultValue: 'Delete this plan?',
      }),
      t('runPrograms.custom.deleteMessage', {
        defaultValue:
          'If you are following it, you can carry on; it just leaves your list of plans.',
      }),
      [
        {
          text: t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
        {
          text: t('common.delete', { defaultValue: 'Delete' }),
          style: 'destructive',
          onPress: () => {
            void removeCustomProgram(id)
              .then(() => navigation.goBack())
              .catch((error: unknown) => {
                addLog(
                  `[Run Program] Could not delete the plan: ${error}`,
                  'WARNING'
                );
                Toast.show({
                  type: 'error',
                  text1: t('runPrograms.custom.deleteError', {
                    defaultValue: 'Could not delete your plan',
                  }),
                });
              });
          },
        },
      ]
    );
  };

  return (
    <>
      {header}
      <ScrollView
        className="flex-1 bg-background"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 24,
        }}
      >
        <Text className="text-text-secondary text-xs mb-1">
          {t('runPrograms.custom.nameLabel', { defaultValue: 'Name' })}
        </Text>
        <TextInput
          className="bg-surface rounded-xl px-3 py-3 text-text-primary"
          style={{ fontSize: 16 }}
          value={draft.name}
          onChangeText={(name) => update({ ...draft, name })}
          maxLength={60}
          placeholder={t('runPrograms.custom.namePlaceholder', {
            defaultValue: 'My plan',
          })}
          placeholderTextColor={muted}
          testID="plan-name"
        />

        <View className="flex-row mt-4">
          {(['run', 'walk'] as const).map((activity) => (
            <Pressable
              key={activity}
              onPress={() => update({ ...draft, activity })}
              accessibilityRole="button"
              accessibilityState={{ selected: draft.activity === activity }}
              className={`flex-1 items-center py-2 rounded-lg mr-2 ${
                draft.activity === activity ? 'bg-accent-primary' : 'bg-surface'
              }`}
              testID={`plan-activity-${activity}`}
            >
              <Text
                className={
                  draft.activity === activity
                    ? 'text-white font-semibold'
                    : 'text-text-primary'
                }
              >
                {activity === 'run'
                  ? t('runPrograms.custom.activityRun', { defaultValue: 'Run' })
                  : t('runPrograms.custom.activityWalk', {
                      defaultValue: 'Walk',
                    })}
              </Text>
            </Pressable>
          ))}
        </View>

        {draft.workouts.map((workout, index) => (
          <View
            key={index}
            className="bg-surface rounded-xl p-4 mt-4"
            testID={`plan-workout-${index}`}
          >
            <View className="flex-row items-center justify-between">
              <Text className="text-text-primary text-base font-semibold">
                {t('runPrograms.custom.workoutNumber', {
                  number: index + 1,
                  defaultValue: 'Workout {{number}}',
                })}
              </Text>
              <View className="flex-row">
                <IconButton
                  icon="chevron-up"
                  label={t('runPrograms.custom.moveUp', {
                    defaultValue: 'Move earlier',
                  })}
                  disabled={index === 0}
                  onPress={() => update(moveWorkout(draft, index, -1))}
                  color={muted}
                  testID={`plan-workout-up-${index}`}
                />
                <IconButton
                  icon="chevron-down"
                  label={t('runPrograms.custom.moveDown', {
                    defaultValue: 'Move later',
                  })}
                  disabled={index === draft.workouts.length - 1}
                  onPress={() => update(moveWorkout(draft, index, 1))}
                  color={muted}
                  testID={`plan-workout-down-${index}`}
                />
                <IconButton
                  icon="copy"
                  label={t('runPrograms.custom.duplicate', {
                    defaultValue: 'Duplicate workout',
                  })}
                  disabled={!canAddWorkout(draft)}
                  onPress={() => update(duplicateWorkout(draft, index))}
                  color={muted}
                  testID={`plan-workout-copy-${index}`}
                />
                <IconButton
                  icon="trash"
                  label={t('runPrograms.custom.removeWorkout', {
                    defaultValue: 'Remove workout',
                  })}
                  onPress={() => update(removeWorkout(draft, index))}
                  color={muted}
                  testID={`plan-workout-remove-${index}`}
                />
              </View>
            </View>
            <TextInput
              className="border-b border-border-subtle text-text-primary mt-2 py-1"
              style={{ fontSize: 15 }}
              value={workout.title}
              onChangeText={(title) =>
                update(setWorkoutTitle(draft, index, title))
              }
              maxLength={40}
              placeholder={t('runPrograms.custom.titlePlaceholder', {
                defaultValue: 'Name (optional)',
              })}
              placeholderTextColor={muted}
            />
            <Text className="text-text-muted text-xs mt-2">
              {t('runPrograms.custom.totalMinutes', {
                minutes: Math.round(workoutSeconds(workout) / 60),
                defaultValue: '{{minutes}} minutes in all',
              })}
            </Text>

            {workout.steps.map((step, stepIndex) => (
              <View
                key={stepIndex}
                className="flex-row items-center mt-2"
                testID={`plan-step-${index}-${stepIndex}`}
              >
                <Pressable
                  onPress={() => update(cycleStepKind(draft, index, stepIndex))}
                  accessibilityRole="button"
                  accessibilityHint={t('runPrograms.custom.kindHint', {
                    defaultValue: 'Changes the kind of step',
                  })}
                  className="flex-1 bg-background rounded-lg px-3 py-2"
                  testID={`plan-step-kind-${index}-${stepIndex}`}
                >
                  <Text className="text-text-primary text-sm">
                    {kindLabel(t, step.kind, draft.activity)}
                  </Text>
                </Pressable>
                <IconButton
                  icon="remove-circle"
                  label={t('runPrograms.custom.shorter', {
                    defaultValue: 'Shorter',
                  })}
                  onPress={() => update(nudgeStep(draft, index, stepIndex, -1))}
                  color={accent}
                  testID={`plan-step-less-${index}-${stepIndex}`}
                />
                <Text className="text-text-primary text-sm w-12 text-center">
                  {clock(step.seconds)}
                </Text>
                <IconButton
                  icon="add-circle"
                  label={t('runPrograms.custom.longer', {
                    defaultValue: 'Longer',
                  })}
                  onPress={() => update(nudgeStep(draft, index, stepIndex, 1))}
                  color={accent}
                  testID={`plan-step-more-${index}-${stepIndex}`}
                />
                <IconButton
                  icon="close"
                  label={t('runPrograms.custom.removeStep', {
                    defaultValue: 'Remove step',
                  })}
                  onPress={() => update(removeStep(draft, index, stepIndex))}
                  color={muted}
                  testID={`plan-step-remove-${index}-${stepIndex}`}
                />
              </View>
            ))}
            <View className="mt-3">
              <Button
                variant="outline"
                onPress={() => update(addStep(draft, index))}
                testID={`plan-add-step-${index}`}
              >
                {t('runPrograms.custom.addStep', {
                  defaultValue: 'Add a step',
                })}
              </Button>
            </View>
          </View>
        ))}

        <View className="mt-4">
          <Button
            variant="outline"
            disabled={!canAddWorkout(draft)}
            onPress={() => update(addWorkout(draft))}
            testID="plan-add-workout"
          >
            {t('runPrograms.custom.addWorkout', {
              defaultValue: 'Add a workout',
            })}
          </Button>
        </View>

        {problemText ? (
          <Text className="text-text-secondary text-xs mt-4">
            {problemText}
          </Text>
        ) : null}
        <View className="mt-4">
          <Button
            variant="primary"
            disabled={!!problem}
            loading={saving}
            onPress={() => void save()}
            testID="plan-save"
          >
            {t('common.save', { defaultValue: 'Save' })}
          </Button>
        </View>
        {id ? (
          <View className="mt-3">
            <Button variant="destructive" onPress={confirmDelete}>
              {t('runPrograms.custom.delete', { defaultValue: 'Delete plan' })}
            </Button>
          </View>
        ) : null}
      </ScrollView>
    </>
  );
};

export default RunProgramEditScreen;
