import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import FormInput from '../components/FormInput';
import Button from '../components/ui/Button';
import Switch from '../components/ui/Switch';
import { useImportWorkoutProgram } from '../hooks/useWorkoutProgramSharing';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'WorkoutProgramImport'>;

/**
 * Adds a workout file someone shared (a preset, or a plan with its presets):
 * shows what is in it, lets the plan be renamed or made active, and asks for
 * the medical disclaimer before anything is added. The file was checked
 * against the shared schema when it was picked.
 */
const WorkoutProgramImportScreen: React.FC<Props> = ({ navigation, route }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const { program } = route.params;
  const { importProgramAsync, isPending } = useImportWorkoutProgram();
  const [planName, setPlanName] = useState(program.plan?.name ?? '');
  const [activate, setActivate] = useState(false);
  const [accepted, setAccepted] = useState(false);

  const header = useScreenHeader({
    title: t('workoutPrograms.import.screenTitle', {
      defaultValue: 'Add workouts',
    }),
    left: { kind: 'back' },
  });

  const trimmedName = planName.trim();
  const canAdd =
    accepted && !isPending && (!program.plan || trimmedName !== '');

  const add = async () => {
    if (!canAdd) return;
    try {
      await importProgramAsync({
        program,
        planName: program.plan ? trimmedName : undefined,
        activate: program.plan ? activate : false,
      });
    } catch {
      // The mutation already showed the error toast; stay here to retry.
      return;
    }
    Toast.show({
      type: 'success',
      text1: t('workoutPrograms.import.success', {
        defaultValue: 'Workouts added. Find them under your presets and plans.',
      }),
    });
    navigation.navigate(
      program.plan ? 'WorkoutPlans' : 'WorkoutPresetsLibrary'
    );
  };

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      <KeyboardAwareScrollView
        className="flex-1 bg-background"
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 24,
        }}
        keyboardShouldPersistTaps="handled"
        bottomOffset={20}
      >
        <Text className="text-text-secondary text-sm">
          {t('workoutPrograms.import.message', {
            defaultValue:
              'Its exercises are added to your library and its workouts become your own presets and plan, which you can change afterwards.',
          })}
        </Text>

        <View className="bg-surface rounded-xl p-4 mt-4">
          {program.presets.map((preset) => (
            <Text
              key={preset.key}
              className="text-text-primary text-sm mb-1"
              testID={`workout-program-preset-${preset.key}`}
            >
              {t('workoutPrograms.import.presetLine', {
                defaultValue: '{{name}} ({{count}} exercises)',
                defaultValue_one: '{{name}} ({{count}} exercise)',
                defaultValue_other: '{{name}} ({{count}} exercises)',
                name: preset.name,
                count: preset.exercises.length,
              })}
            </Text>
          ))}
        </View>

        {program.plan ? (
          <>
            <Text className="text-text-muted text-xs mt-5 mb-1">
              {t('workoutSplits.import.planName', {
                defaultValue: 'Plan name',
              })}
            </Text>
            <FormInput
              value={planName}
              onChangeText={setPlanName}
              maxLength={120}
              accessibilityLabel={t('workoutSplits.import.planName', {
                defaultValue: 'Plan name',
              })}
            />

            <View className="flex-row items-center justify-between mt-5">
              <Text className="text-text-primary text-base flex-1 mr-3">
                {t('workoutSplits.import.activate', {
                  defaultValue: 'Make it my active plan',
                })}
              </Text>
              <Switch
                value={activate}
                onValueChange={setActivate}
                accessibilityLabel={t('workoutSplits.import.activate', {
                  defaultValue: 'Make it my active plan',
                })}
              />
            </View>
          </>
        ) : null}

        <View className="flex-row items-start justify-between mt-5">
          <Text className="text-text-secondary text-sm flex-1 mr-3">
            {t('workoutSplits.import.disclaimer', {
              defaultValue:
                'I understand that I should check with a doctor or healthcare professional before starting a new workout program, especially with a medical condition or an injury. A program does not replace medical advice, and I am responsible for my own health.',
            })}
          </Text>
          <Switch
            value={accepted}
            onValueChange={setAccepted}
            accessibilityLabel={t('workoutSplits.import.disclaimerAccept', {
              defaultValue: 'Accept the medical disclaimer',
            })}
          />
        </View>

        <View className="mt-6">
          <Button
            variant="primary"
            onPress={() => void add()}
            disabled={!canAdd}
            loading={isPending}
          >
            {t('workoutPrograms.import.add', { defaultValue: 'Add workouts' })}
          </Button>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
};

export default WorkoutProgramImportScreen;
