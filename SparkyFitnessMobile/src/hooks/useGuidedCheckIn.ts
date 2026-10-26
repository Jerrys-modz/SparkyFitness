import { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Keyboard } from 'react-native';
import Toast from 'react-native-toast-message';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { offerCheckinRemindersAfterLeaving } from '../services/offerCheckinReminders';
import type {
  GuidedCheckInParams,
  RootStackParamList,
} from '../types/navigation';

type GuidedCheckInNavigation = Pick<
  NativeStackNavigationProp<RootStackParamList>,
  'replace' | 'goBack' | 'isFocused'
>;

/** The routes the guided check-in walks through, in order. */
type GuidedCheckInStep = 'MoodLog' | 'MeasurementsAdd' | 'ProgressPhotos';

const STEP_NUMBER: Record<GuidedCheckInStep, number> = {
  MoodLog: 1,
  MeasurementsAdd: 2,
  ProgressPhotos: 3,
};
const TOTAL_STEPS = 3;

/** What a step reports as it hands over. */
interface GuidedCheckInStepResult {
  saved?: boolean;
  offerReminders?: boolean;
}

export interface GuidedCheckIn {
  step: number;
  total: number;
  /** Hands over to the next step; on the last one it finishes. */
  advance: (result?: GuidedCheckInStepResult) => void;
  /** Moves on without saving, asking first when the step has unsaved edits. */
  skip: (hasUnsavedEdits: boolean) => void;
  /** Leaves the flow from the last step. */
  finish: (result?: GuidedCheckInStepResult) => void;
  /** True once this step has handed over or finished. */
  hasLeft: () => boolean;
}

interface UseGuidedCheckInArgs {
  navigation: GuidedCheckInNavigation;
  step: GuidedCheckInStep;
  date: string | undefined;
  params: GuidedCheckInParams | undefined;
}

/**
 * The guided check-in for a step screen, or null when the screen was opened
 * on its own. Every step works on the one day the flow started with, and each
 * hop replaces the step, so leaving (X, Back, a swipe) always lands where the
 * flow began, with what was saved kept.
 */
export function useGuidedCheckIn({
  navigation,
  step,
  date,
  params,
}: UseGuidedCheckInArgs): GuidedCheckIn | null {
  const { t } = useTranslation();
  // Set once the step hands over, so a second press, or a save that resolves
  // after the user already left, never moves the stack again.
  const leftRef = useRef(false);
  const confirmingRef = useRef(false);

  return useMemo(() => {
    if (!params || !date) return null;

    const merged = (result?: GuidedCheckInStepResult): GuidedCheckInParams => ({
      offerReminders: Boolean(params.offerReminders || result?.offerReminders),
      saved: Boolean(params.saved || result?.saved),
    });

    // Replace and goBack act on whichever route is focused, so a step that
    // is no longer on top must not move.
    const leave = (): boolean => {
      if (leftRef.current || !navigation.isFocused()) return false;
      leftRef.current = true;
      Keyboard.dismiss();
      return true;
    };

    const finish = (result?: GuidedCheckInStepResult) => {
      if (!leave()) return;
      const flags = merged(result);
      navigation.goBack();
      if (flags.saved) {
        Toast.show({
          type: 'success',
          text1: t('guidedCheckIn.done', { defaultValue: 'Check-in complete' }),
        });
      }
      if (flags.offerReminders) offerCheckinRemindersAfterLeaving(t);
    };

    const advance = (result?: GuidedCheckInStepResult) => {
      if (step === 'ProgressPhotos') {
        finish(result);
        return;
      }
      if (!leave()) return;
      const guidedCheckIn = merged(result);
      if (step === 'MoodLog') {
        navigation.replace('MeasurementsAdd', { date, guidedCheckIn });
      } else {
        navigation.replace('ProgressPhotos', { date, guidedCheckIn });
      }
    };

    const skip = (hasUnsavedEdits: boolean) => {
      if (leftRef.current || confirmingRef.current) return;
      if (!hasUnsavedEdits) {
        advance();
        return;
      }
      confirmingRef.current = true;
      const release = () => {
        confirmingRef.current = false;
      };
      Alert.alert(
        t('guidedCheckIn.skipUnsavedTitle', {
          defaultValue: 'Skip this step?',
        }),
        t('guidedCheckIn.skipUnsavedMessage', {
          defaultValue: "Your changes on this step won't be saved.",
        }),
        [
          {
            text: t('common.cancel', { defaultValue: 'Cancel' }),
            style: 'cancel',
            onPress: release,
          },
          {
            text: t('guidedCheckIn.skip', { defaultValue: 'Skip' }),
            style: 'destructive',
            onPress: () => {
              release();
              advance();
            },
          },
        ],
        { cancelable: true, onDismiss: release }
      );
    };

    return {
      step: STEP_NUMBER[step],
      total: TOTAL_STEPS,
      advance,
      skip,
      finish,
      hasLeft: () => leftRef.current,
    };
  }, [date, navigation, params, step, t]);
}
