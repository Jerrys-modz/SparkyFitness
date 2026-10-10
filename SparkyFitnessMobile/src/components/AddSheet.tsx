import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { View, Text, Pressable, LayoutAnimation } from 'react-native';
import { BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { useCSSVariable } from 'uniwind';
import { useTranslation } from 'react-i18next';

import Icon, { type IconName } from './Icon';
import Button from './ui/Button';
import { useSheetBackdrop } from './ui/sheetChrome';
import {
  ADD_MENU_ITEM_ICONS,
  type AddMenuItemKey,
} from '../constants/addMenuItems';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import { resolveAddMenuCards, rowKeys } from '../utils/addMenu';

export interface AddSheetRef {
  present: (options?: { initialMenu?: 'exercise' }) => void;
  dismiss: () => void;
}

export const addSheetRef = React.createRef<AddSheetRef>();

interface AddSheetProps {
  onAddFood: () => void;
  onStartWorkout: () => void;
  onAddActivity: () => void;
  onLogWorkout: () => void;
  onSyncHealthData: () => void;
  onBarcodeScan: () => void;
  onAddMeasurements: () => void;
  onAddProgressPhotos: () => void;
  onAskSparky: () => void;
  onAddSymptoms?: () => void;
  onAddMood?: () => void;
  onAddMindfulness?: () => void;
  onOpenCycle?: () => void;
  showCycleCard?: boolean;
  cycleLabel?: string;
  cycleIcon?: IconName;
  onDismissWithoutAction?: () => void;
}

/** What one item in the sheet looks like and does, as a card or a row. */
interface MenuItemDef {
  label: string;
  icon: IconName;
  /** Missing for Exercise, which opens the sub-menu instead. */
  onPress?: () => void;
}

const AddSheet = React.forwardRef<AddSheetRef, AddSheetProps>(
  (
    {
      onAddFood,
      onStartWorkout,
      onAddActivity,
      onLogWorkout,
      onSyncHealthData,
      onBarcodeScan,
      onAddMeasurements,
      onAddProgressPhotos,
      onAskSparky,
      onAddSymptoms,
      onAddMood,
      onAddMindfulness,
      onOpenCycle,
      showCycleCard,
      cycleLabel,
      cycleIcon,
      onDismissWithoutAction,
    },
    ref
  ) => {
    const { t } = useTranslation();
    const bottomSheetRef = useRef<BottomSheetModal>(null);
    const isDismissingRef = useRef(false);
    const isOpenRef = useRef(false);
    const isPresentingRef = useRef(false);
    const selectedActionRef = useRef(false);
    const pendingPresentRef = useRef(false);
    const pendingInitialMenuRef = useRef<'exercise' | null>(null);
    const presentFrameRef = useRef<number | null>(null);
    const [showExerciseMenu, setShowExerciseMenu] = useState(false);
    const addMenuCards = useAppPreferencesStore((st) => st.addMenuCards);
    const addMenuOrder = useAppPreferencesStore((st) => st.addMenuOrder);
    const hiddenAddMenuItems = useAppPreferencesStore(
      (st) => st.hiddenAddMenuItems
    );

    const [surfaceBg, textMuted, accentPrimary, raisedBg, textSecondary] =
      useCSSVariable([
        '--color-surface',
        '--color-text-muted',
        '--color-accent-primary',
        '--color-raised',
        '--color-text-secondary',
      ]) as [string, string, string, string, string];

    const clearScheduledPresent = useCallback(() => {
      if (presentFrameRef.current != null) {
        cancelAnimationFrame(presentFrameRef.current);
        presentFrameRef.current = null;
      }
    }, []);

    const schedulePresent = useCallback(() => {
      clearScheduledPresent();
      isPresentingRef.current = true;
      presentFrameRef.current = requestAnimationFrame(() => {
        presentFrameRef.current = null;
        bottomSheetRef.current?.present();
      });
    }, [clearScheduledPresent]);

    useImperativeHandle(
      ref,
      () => ({
        present: (options) => {
          const initialMenu = options?.initialMenu ?? null;
          if (isDismissingRef.current) {
            pendingPresentRef.current = true;
            pendingInitialMenuRef.current = initialMenu;
            setShowExerciseMenu(initialMenu === 'exercise');
            return;
          }

          if (isOpenRef.current || isPresentingRef.current) {
            return;
          }

          pendingPresentRef.current = false;
          pendingInitialMenuRef.current = null;
          selectedActionRef.current = false;
          setShowExerciseMenu(initialMenu === 'exercise');
          schedulePresent();
        },
        dismiss: () => {
          pendingPresentRef.current = false;
          pendingInitialMenuRef.current = null;
          isPresentingRef.current = false;
          isDismissingRef.current = true;
          clearScheduledPresent();
          bottomSheetRef.current?.dismiss();
        },
      }),
      [clearScheduledPresent, schedulePresent]
    );

    useEffect(() => {
      const sheetRef = bottomSheetRef.current;
      return () => {
        clearScheduledPresent();
        sheetRef?.dismiss();
      };
    }, [clearScheduledPresent]);

    const renderBackdrop = useSheetBackdrop();

    const handleAction = useCallback(
      (action?: () => void) => {
        pendingPresentRef.current = false;
        pendingInitialMenuRef.current = null;
        selectedActionRef.current = true;
        isPresentingRef.current = false;
        isDismissingRef.current = true;
        clearScheduledPresent();
        bottomSheetRef.current?.dismiss();
        action?.();
      },
      [clearScheduledPresent]
    );

    const handleDismiss = useCallback(() => {
      isDismissingRef.current = false;
      isOpenRef.current = false;
      if (pendingPresentRef.current) {
        const initialMenu = pendingInitialMenuRef.current;
        pendingPresentRef.current = false;
        pendingInitialMenuRef.current = null;
        selectedActionRef.current = false;
        setShowExerciseMenu(initialMenu === 'exercise');
        schedulePresent();
      } else {
        if (!selectedActionRef.current) {
          onDismissWithoutAction?.();
        }
        selectedActionRef.current = false;
        isPresentingRef.current = false;
        pendingInitialMenuRef.current = null;
      }
    }, [onDismissWithoutAction, schedulePresent]);

    const handleAnimate = useCallback(
      (fromIndex: number, toIndex: number) => {
        if (fromIndex >= 0 && toIndex === -1) {
          isDismissingRef.current = true;
          isOpenRef.current = false;
          isPresentingRef.current = false;
          return;
        }

        if (toIndex >= 0) {
          isDismissingRef.current = false;
          isOpenRef.current = true;
          isPresentingRef.current = false;
          pendingPresentRef.current = false;
          pendingInitialMenuRef.current = null;
          clearScheduledPresent();
        }
      },
      [clearScheduledPresent]
    );

    // Exercise has no action of its own: it opens the sub-menu, wherever it sits.
    const press = (onPress?: () => void) => {
      if (onPress) {
        handleAction(onPress);
        return;
      }
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setShowExerciseMenu(true);
    };

    const renderCard = (key: string, def: MenuItemDef) => (
      <Button
        key={key}
        variant="primary"
        className="flex-1 py-5 mx-1.5"
        style={{ backgroundColor: raisedBg }}
        onPress={() => press(def.onPress)}
      >
        <Icon name={def.icon} size={32} color={accentPrimary} />
        <Text
          className="text-text-primary text-sm font-medium mt-2 text-center"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
        >
          {def.label}
        </Text>
      </Button>
    );

    const renderSecondaryRow = (key: string, def: MenuItemDef) => (
      <Button
        key={key}
        variant="primary"
        className="flex-row items-center justify-center py-3 mx-1.5 mt-3"
        style={{ backgroundColor: raisedBg }}
        onPress={() => press(def.onPress)}
      >
        <Icon name={def.icon} size={20} color={accentPrimary} />
        <Text className="text-text-primary text-sm font-medium ml-2">
          {def.label}
        </Text>
      </Button>
    );

    const renderExerciseOption = (
      label: string,
      subtitle: string,
      icon: IconName,
      onPress: () => void
    ) => (
      <Button
        key={label}
        variant="primary"
        className="flex-1 py-5 mx-1.5"
        style={{ backgroundColor: raisedBg }}
        onPress={() => handleAction(onPress)}
      >
        <View className="h-10 items-center justify-center">
          <Icon name={icon} size={32} color={accentPrimary} />
        </View>
        <Text
          className="text-text-primary text-sm font-medium mt-2 text-center"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
        >
          {label}
        </Text>
        <Text
          className="text-xs mt-1 text-center"
          numberOfLines={2}
          style={{ color: textSecondary, minHeight: 32 }}
        >
          {subtitle}
        </Text>
      </Button>
    );

    // Everything the app can offer right now, keyed so the saved arrangement
    // from Settings → Add menu can place it. An item whose handler or feature
    // is off is simply absent, whatever the arrangement says.
    const itemDefs: Partial<Record<AddMenuItemKey, MenuItemDef>> = {
      food: {
        label: t('addSheet.food', { defaultValue: 'Food' }),
        icon: ADD_MENU_ITEM_ICONS.food,
        onPress: onAddFood,
      },
      exercise: {
        label: t('addSheet.exercise', { defaultValue: 'Exercise' }),
        icon: ADD_MENU_ITEM_ICONS.exercise,
      },
      measurements: {
        label: t('addSheet.measurements', { defaultValue: 'Measurements' }),
        icon: ADD_MENU_ITEM_ICONS.measurements,
        onPress: onAddMeasurements,
      },
      scanFood: {
        label: t('addSheet.scanFood', { defaultValue: 'Scan Food' }),
        icon: ADD_MENU_ITEM_ICONS.scanFood,
        onPress: onBarcodeScan,
      },
      progressPhotos: {
        label: t('addSheet.progressPhotos', {
          defaultValue: 'Progress Photos',
        }),
        icon: ADD_MENU_ITEM_ICONS.progressPhotos,
        onPress: onAddProgressPhotos,
      },
      wellness:
        showCycleCard && onOpenCycle
          ? {
              label:
                cycleLabel ??
                t('addSheet.wellness', { defaultValue: 'Wellness' }),
              icon: cycleIcon ?? ADD_MENU_ITEM_ICONS.wellness,
              onPress: onOpenCycle,
            }
          : undefined,
      symptoms: onAddSymptoms && {
        label: t('addSheet.symptoms', { defaultValue: 'Symptoms' }),
        icon: ADD_MENU_ITEM_ICONS.symptoms,
        onPress: onAddSymptoms,
      },
      mood: onAddMood && {
        label: t('addSheet.mood', { defaultValue: 'Mood' }),
        icon: ADD_MENU_ITEM_ICONS.mood,
        onPress: onAddMood,
      },
      mindfulness: onAddMindfulness && {
        label: t('addSheet.mindfulness', { defaultValue: 'Mindfulness' }),
        icon: ADD_MENU_ITEM_ICONS.mindfulness,
        onPress: onAddMindfulness,
      },
      askSparky: {
        label: t('addSheet.askSparky', { defaultValue: 'Ask Sparky' }),
        icon: ADD_MENU_ITEM_ICONS.askSparky,
        onPress: onAskSparky,
      },
      syncHealth: {
        label: t('addSheet.syncHealth', { defaultValue: 'Sync Health Data' }),
        icon: ADD_MENU_ITEM_ICONS.syncHealth,
        onPress: onSyncHealthData,
      },
    };
    const cardKeys = resolveAddMenuCards(addMenuCards);
    // The four big cards, two to a line. An unavailable one leaves its slot
    // empty, so a line with one card keeps that card at half width.
    const cardLines: React.ReactNode[] = [];
    for (let start = 0; start < cardKeys.length; start += 2) {
      const line = cardKeys.slice(start, start + 2).flatMap((key) => {
        const def = itemDefs[key];
        return def ? [renderCard(key, def)] : [];
      });
      if (line.length === 0) continue;
      if (line.length === 1) {
        line.push(<View key={`spacer-${start}`} className="flex-1 mx-1.5" />);
      }
      cardLines.push(
        <View
          key={`line-${start}`}
          className={start === 0 ? 'flex-row mb-3' : 'flex-row'}
        >
          {line}
        </View>
      );
    }
    const secondaryRows = rowKeys(addMenuOrder, cardKeys)
      .filter((key) => !hiddenAddMenuItems.includes(key))
      .flatMap((key) => {
        const def = itemDefs[key];
        return def ? [renderSecondaryRow(key, def)] : [];
      });

    return (
      <BottomSheetModal
        ref={bottomSheetRef}
        enableDynamicSizing
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: surfaceBg }}
        handleIndicatorStyle={{ backgroundColor: textMuted }}
        onAnimate={handleAnimate}
        onDismiss={handleDismiss}
      >
        <BottomSheetView className="pb-safe-or-5 px-2.5">
          {showExerciseMenu ? (
            <>
              <Pressable
                className="flex-row items-center mb-3 px-1.5"
                accessibilityRole="button"
                accessibilityLabel={t('common.back', { defaultValue: 'Back' })}
                onPress={() => {
                  LayoutAnimation.configureNext(
                    LayoutAnimation.Presets.easeInEaseOut
                  );
                  setShowExerciseMenu(false);
                }}
              >
                <Icon name="chevron-back" size={20} color={accentPrimary} />
                <Text
                  className="text-sm font-medium ml-1"
                  style={{ color: accentPrimary }}
                >
                  {t('common.back', { defaultValue: 'Back' })}
                </Text>
              </Pressable>
              <View className="flex-row">
                {renderExerciseOption(
                  t('addSheet.workout', { defaultValue: 'Workout' }),
                  t('addSheet.liveSets', { defaultValue: 'Live sets & reps' }),
                  'exercise-weights',
                  onStartWorkout
                )}
                {renderExerciseOption(
                  t('addSheet.activity', { defaultValue: 'Activity' }),
                  t('addSheet.durationDistance', {
                    defaultValue: 'Duration & distance',
                  }),
                  'exercise-running-filled',
                  onAddActivity
                )}
                {renderExerciseOption(
                  t('addSheet.logWorkout', { defaultValue: 'Log Workout' }),
                  t('addSheet.pastSets', { defaultValue: 'Past sets & reps' }),
                  'pencil',
                  onLogWorkout
                )}
              </View>
            </>
          ) : (
            <>
              {cardLines}
              {secondaryRows}
            </>
          )}
        </BottomSheetView>
      </BottomSheetModal>
    );
  }
);

AddSheet.displayName = 'AddSheet';

export default AddSheet;
