import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { getWorkoutSplit } from '@workspace/shared';
import { FooterSaveBar } from '../components/FormScreenChrome';
import FormInput from '../components/FormInput';
import StatusView from '../components/StatusView';
import Switch from '../components/ui/Switch';
import { useImportWorkoutSplit } from '../hooks/useImportWorkoutSplit';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import type { RootStackScreenProps } from '../types/navigation';
import {
  sessionName,
  splitDescription,
  splitName,
  venueLabel,
} from '../utils/workoutSplits';

type Props = RootStackScreenProps<'WorkoutSplitImport'>;

/** Asks for the plan's name and the medical disclaimer before adding a split. */
const WorkoutSplitImportScreen: React.FC<Props> = ({ navigation, route }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const split = getWorkoutSplit(route.params.splitId);
  const { importSplitAsync, isPending } = useImportWorkoutSplit();
  const [planName, setPlanName] = useState(() =>
    // The same program comes in a home, garage and gym version, so the plan
    // name says which one.
    split ? `${splitName(t, split.id)} (${venueLabel(t, split.venue)})` : ''
  );
  const [activate, setActivate] = useState(true);
  const [accepted, setAccepted] = useState(false);

  const header = useScreenHeader({
    title: t('workoutSplits.import.screenTitle', {
      defaultValue: 'Add program',
    }),
    left: { kind: 'back' },
  });

  if (!split) {
    return (
      <View
        className="flex-1 bg-background"
        style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
      >
        {header}
        <StatusView
          icon="alert-circle"
          iconTone="muted"
          title={t('workoutSplits.import.unknown', {
            defaultValue: 'This program is not available.',
          })}
          action={{
            label: t('workoutSplits.import.goBack', {
              defaultValue: 'Go back',
            }),
            onPress: () => navigation.goBack(),
          }}
        />
      </View>
    );
  }

  const trimmedName = planName.trim();
  const canAdd = accepted && trimmedName !== '' && !isPending;

  const add = async () => {
    if (!canAdd) return;
    try {
      await importSplitAsync({
        splitId: split.id,
        body: {
          planName: trimmedName,
          sessionNames: Object.fromEntries(
            split.sessions.map((session) => [
              session.id,
              sessionName(t, session.id),
            ])
          ),
          activate,
          trainer: route.params.trainer,
        },
      });
    } catch {
      // The mutation already showed the error toast; stay here to retry.
      return;
    }
    Toast.show({
      type: 'success',
      text1: t('workoutSplits.import.success', {
        defaultValue:
          'Program added. Find its workouts under your presets and plans.',
      }),
    });
    navigation.navigate('WorkoutPlans');
  };

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      <KeyboardAwareScrollView
        className="flex-1"
        contentInsetAdjustmentBehavior={
          usesNativeHeader ? 'automatic' : 'never'
        }
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        bottomOffset={20}
      >
        <Text className="text-text-primary text-lg font-semibold">
          {splitName(t, split.id)}
        </Text>
        <Text className="text-text-secondary text-sm mt-1">
          {splitDescription(t, split.id)}
        </Text>
        <Text className="text-text-secondary text-sm mt-3">
          {t('workoutSplits.import.message', {
            defaultValue:
              'This adds its exercises to your library, a preset for each session and a plan that runs them in order. You set your starting weights as you log your first workout.',
          })}
        </Text>

        <Text className="text-sm font-medium text-text-secondary mt-5 mb-1">
          {t('workoutSplits.import.planName', { defaultValue: 'Plan name' })}
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
      </KeyboardAwareScrollView>

      <FooterSaveBar
        onPress={() => void add()}
        disabled={!canAdd}
        busy={isPending}
        label={t('workoutSplits.import.add', { defaultValue: 'Add program' })}
      />
    </View>
  );
};

export default WorkoutSplitImportScreen;
