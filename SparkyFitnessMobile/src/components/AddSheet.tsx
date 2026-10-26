import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  View,
  Text,
  Pressable,
  LayoutAnimation,
  StyleSheet,
} from 'react-native';
import { BottomSheetModal, BottomSheetView } from '@gorhom/bottom-sheet';
import { useCSSVariable } from 'uniwind';
import { useTranslation } from 'react-i18next';

import Icon, { type IconName } from './Icon';
import Button from './ui/Button';
import { useSheetBackdrop } from './ui/sheetChrome';
import {
  ADD_MENU_ITEM_ICONS,
  ADD_MENU_ITEM_ROW_STYLES,
  ADD_MENU_ITEM_TINTS,
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
  /** A shorter name for the narrow card, when the label is long. */
  cardLabel?: string;
  /** A word at the right of a list row, or under the label of a compact one. */
  hint?: string;
  icon: IconName;
  /** Missing for Exercise, which opens the sub-menu instead. */
  onPress?: () => void;
}

/** An icon on a softly tinted rounded square. */
const IconTile = ({
  icon,
  color,
  size,
}: {
  icon: IconName;
  color: string;
  size: 'card' | 'row';
}) => {
  const box = size === 'card' ? 52 : 40;
  return (
    <View
      style={{
        width: box,
        height: box,
        borderRadius: size === 'card' ? 18 : 12,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: color, opacity: 0.14 },
        ]}
      />
      <Icon name={icon} size={size === 'card' ? 26 : 20} color={color} />
    </View>
  );
};

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

    const [
      surfaceBg,
      textMuted,
      accentPrimary,
      raisedBg,
      textSecondary,
      borderSubtle,
      tintGreen,
      tintViolet,
      tintRed,
      tintAmber,
      tintSky,
      tintPink,
    ] = useCSSVariable([
      '--color-surface',
      '--color-text-muted',
      '--color-accent-primary',
      '--color-raised',
      '--color-text-secondary',
      '--color-border-subtle',
      '--color-cat-green',
      '--color-cat-violet',
      '--color-icon-danger',
      '--color-icon-warning',
      '--color-macro-fat',
      '--color-cat-pink',
    ]) as string[];
    const tintColors = {
      accent: accentPrimary,
      green: tintGreen,
      violet: tintViolet,
      red: tintRed,
      amber: tintAmber,
      sky: tintSky,
      pink: tintPink,
    };

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

    const renderCard = (key: AddMenuItemKey, def: MenuItemDef) => (
      <Pressable
        key={key}
        className="flex-1 items-center px-0.5"
        accessibilityRole="button"
        accessibilityLabel={def.label}
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        onPress={() => press(def.onPress)}
      >
        <IconTile
          icon={def.icon}
          color={tintColors[ADD_MENU_ITEM_TINTS[key]]}
          size="card"
        />
        <Text
          className="text-text-primary text-sm font-medium mt-2 text-center"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
        >
          {def.cardLabel ?? def.label}
        </Text>
      </Pressable>
    );

    const renderListRow = (key: AddMenuItemKey, def: MenuItemDef) => (
      <Pressable
        key={key}
        className="flex-row items-center px-4 py-3"
        accessibilityRole="button"
        accessibilityLabel={def.label}
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        onPress={() => press(def.onPress)}
      >
        <IconTile
          icon={def.icon}
          color={tintColors[ADD_MENU_ITEM_TINTS[key]]}
          size="row"
        />
        <Text
          className="flex-1 text-text-primary text-base font-medium ml-3"
          numberOfLines={1}
        >
          {def.label}
        </Text>
        {def.hint ? (
          <Text className="text-sm mr-2" style={{ color: textMuted }}>
            {def.hint}
          </Text>
        ) : null}
        <Icon name="chevron-forward" size={14} color={textMuted} />
      </Pressable>
    );

    const renderCompactRow = (key: AddMenuItemKey, def: MenuItemDef) => (
      <Pressable
        key={key}
        className="flex-1 flex-row items-center px-4 py-3"
        accessibilityRole="button"
        accessibilityLabel={def.label}
        style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        onPress={() => press(def.onPress)}
      >
        <IconTile
          icon={def.icon}
          color={tintColors[ADD_MENU_ITEM_TINTS[key]]}
          size="row"
        />
        <View className="flex-1 ml-3">
          <Text
            className="text-text-primary text-base font-medium"
            numberOfLines={1}
          >
            {def.label}
          </Text>
          {def.hint ? (
            <Text
              className="text-xs mt-0.5"
              numberOfLines={1}
              style={{ color: textSecondary }}
            >
              {def.hint}
            </Text>
          ) : null}
        </View>
      </Pressable>
    );

    const renderActionButton = (key: AddMenuItemKey, def: MenuItemDef) => {
      const isAccent = key === 'askSparky';
      return (
        <Pressable
          key={key}
          className="flex-1 flex-row items-center justify-center py-3.5 rounded-2xl mx-1.5"
          accessibilityRole="button"
          accessibilityLabel={def.label}
          style={({ pressed }) => ({
            backgroundColor: isAccent ? 'transparent' : raisedBg,
            borderWidth: 1,
            borderColor: isAccent ? accentPrimary : borderSubtle,
            opacity: pressed ? 0.7 : 1,
          })}
          onPress={() => press(def.onPress)}
        >
          {isAccent ? (
            <View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                {
                  borderRadius: 16,
                  backgroundColor: accentPrimary,
                  opacity: 0.1,
                },
              ]}
            />
          ) : null}
          <Icon
            name={def.icon}
            size={20}
            color={isAccent ? accentPrimary : textSecondary}
          />
          <Text
            className="text-text-primary text-base font-medium ml-2"
            style={isAccent ? { color: accentPrimary } : undefined}
          >
            {def.label}
          </Text>
        </Pressable>
      );
    };

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
        cardLabel: t('addSheet.measureShort', { defaultValue: 'Measure' }),
        icon: ADD_MENU_ITEM_ICONS.measurements,
        onPress: onAddMeasurements,
      },
      scanFood: {
        label: t('addSheet.scanFood', { defaultValue: 'Scan Food' }),
        cardLabel: t('addSheet.scanShort', { defaultValue: 'Scan' }),
        icon: ADD_MENU_ITEM_ICONS.scanFood,
        onPress: onBarcodeScan,
      },
      progressPhotos: {
        label: t('addSheet.progressPhotos', {
          defaultValue: 'Progress Photos',
        }),
        hint: t('addSheet.photosHint', { defaultValue: 'Visual' }),
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
        label: t('addSheet.symptomsHealth', {
          defaultValue: 'Symptoms & Health',
        }),
        hint: t('addSheet.symptomsHint', { defaultValue: 'Log' }),
        icon: ADD_MENU_ITEM_ICONS.symptoms,
        onPress: onAddSymptoms,
      },
      mood: onAddMood && {
        label: t('addSheet.mood', { defaultValue: 'Mood' }),
        hint: t('addSheet.moodHint', { defaultValue: 'Track state' }),
        icon: ADD_MENU_ITEM_ICONS.mood,
        onPress: onAddMood,
      },
      mindfulness: onAddMindfulness && {
        label: t('addSheet.mindfulness', { defaultValue: 'Mindfulness' }),
        hint: t('addSheet.mindfulnessHint', {
          defaultValue: 'Breathing, zen',
        }),
        icon: ADD_MENU_ITEM_ICONS.mindfulness,
        onPress: onAddMindfulness,
      },
      askSparky: {
        label: t('addSheet.askSparky', { defaultValue: 'Ask Sparky' }),
        icon: ADD_MENU_ITEM_ICONS.askSparky,
        onPress: onAskSparky,
      },
      syncHealth: {
        label: t('addSheet.syncHealthShort', { defaultValue: 'Sync Health' }),
        icon: ADD_MENU_ITEM_ICONS.syncHealth,
        onPress: onSyncHealthData,
      },
    };
    const cardKeys = resolveAddMenuCards(addMenuCards);
    // The four cards share one panel. An unavailable one leaves its slot
    // empty so the others keep their width.
    const cards = cardKeys.map((key) => {
      const def = itemDefs[key];
      return def ? renderCard(key, def) : <View key={key} className="flex-1" />;
    });
    // Below the cards, each style gathers in its own place, keeping the
    // arranged order within it: list rows and compact pairs in one panel,
    // actions side by side at the foot.
    const shown = rowKeys(addMenuOrder, cardKeys).flatMap((key) => {
      const def = itemDefs[key];
      return def && !hiddenAddMenuItems.includes(key) ? [{ key, def }] : [];
    });
    const withStyle = (style: 'list' | 'compact' | 'action') =>
      shown.filter(({ key }) => ADD_MENU_ITEM_ROW_STYLES[key] === style);
    const listRows = withStyle('list').map(({ key, def }) =>
      renderListRow(key, def)
    );
    const compactItems = withStyle('compact');
    const compactLines: React.ReactNode[] = [];
    for (let start = 0; start < compactItems.length; start += 2) {
      const line = compactItems
        .slice(start, start + 2)
        .map(({ key, def }) => renderCompactRow(key, def));
      if (line.length === 1) {
        line.push(<View key={`spacer-${start}`} className="flex-1" />);
      } else {
        line.splice(
          1,
          0,
          <View
            key={`divider-${start}`}
            style={{
              width: StyleSheet.hairlineWidth,
              backgroundColor: borderSubtle,
            }}
          />
        );
      }
      compactLines.push(
        <View key={`compact-${start}`} className="flex-row">
          {line}
        </View>
      );
    }
    const actionButtons = withStyle('action').map(({ key, def }) =>
      renderActionButton(key, def)
    );
    // Hairlines between the panel's lines, in place of a border on each row.
    const panelLines = [...listRows, ...compactLines];

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
              <View className="flex-row items-center justify-between px-3 pt-1 pb-3">
                <Text className="text-text-primary text-2xl font-bold">
                  {t('addSheet.title', { defaultValue: 'Quick Actions' })}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('common.done', {
                    defaultValue: 'Done',
                  })}
                  hitSlop={10}
                  onPress={() => bottomSheetRef.current?.dismiss()}
                >
                  <Text
                    className="text-base font-semibold"
                    style={{ color: accentPrimary }}
                  >
                    {t('common.done', { defaultValue: 'Done' })}
                  </Text>
                </Pressable>
              </View>
              <View
                className="flex-row rounded-2xl mx-1.5 px-2 py-4"
                style={{ backgroundColor: raisedBg }}
              >
                {cards}
              </View>
              {panelLines.length > 0 ? (
                <View
                  className="rounded-2xl mx-1.5 mt-3 overflow-hidden"
                  style={{ backgroundColor: raisedBg }}
                >
                  {panelLines.map((line, index) => (
                    <View key={index}>
                      {index > 0 ? (
                        <View
                          style={{
                            height: StyleSheet.hairlineWidth,
                            backgroundColor: borderSubtle,
                          }}
                        />
                      ) : null}
                      {line}
                    </View>
                  ))}
                </View>
              ) : null}
              {actionButtons.length > 0 ? (
                <View className="flex-row mt-3">{actionButtons}</View>
              ) : null}
            </>
          )}
        </BottomSheetView>
      </BottomSheetModal>
    );
  }
);

AddSheet.displayName = 'AddSheet';

export default AddSheet;
