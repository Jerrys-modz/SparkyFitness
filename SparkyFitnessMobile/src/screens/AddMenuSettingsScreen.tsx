import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';

import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import BottomSheetPicker from '../components/BottomSheetPicker';
import Icon from '../components/Icon';
import { ReorderSwitchList } from '../components/ReorderSwitchList';
import Button from '../components/ui/Button';
import {
  ADD_MENU_ITEM_ICONS,
  ADD_MENU_ITEM_KEYS,
  ADD_MENU_ITEM_LABELS,
  DEFAULT_ADD_MENU_CARDS,
  type AddMenuItemKey,
} from '../constants/addMenuItems';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import type { RootStackScreenProps } from '../types/navigation';
import {
  mergeRowOrder,
  placeInCardSlot,
  resolveAddMenuCards,
  rowKeys,
} from '../utils/addMenu';
import { resolveKeyOrder } from '../utils/reorderUtils';

type AddMenuSettingsScreenProps = RootStackScreenProps<'AddMenuSettings'>;

/**
 * Lays out the + sheet: the four big cards (tap one to pick what goes there)
 * and the rows under them (drag to reorder, switch off to hide). An item
 * appears in one place only. An item the app cannot offer right now, such as
 * Wellness with the cycle feature off, is listed here and left out of the
 * sheet.
 */
const AddMenuSettingsScreen: React.FC<AddMenuSettingsScreenProps> = () => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();
  const [accentPrimary, raisedBg] = useCSSVariable([
    '--color-accent-primary',
    '--color-raised',
  ]) as [string, string];

  const savedCards = useAppPreferencesStore((s) => s.addMenuCards);
  const addMenuOrder = useAppPreferencesStore((s) => s.addMenuOrder);
  const hiddenAddMenuItems = useAppPreferencesStore(
    (s) => s.hiddenAddMenuItems
  );
  const setAddMenuCards = useAppPreferencesStore((s) => s.setAddMenuCards);
  const setAddMenuOrder = useAppPreferencesStore((s) => s.setAddMenuOrder);
  const setAddMenuItemHidden = useAppPreferencesStore(
    (s) => s.setAddMenuItemHidden
  );
  const resetAddMenu = useAppPreferencesStore((s) => s.resetAddMenu);

  const cards = useMemo(() => resolveAddMenuCards(savedCards), [savedCards]);
  const rows = useMemo(
    () =>
      rowKeys(addMenuOrder, cards).map((key) => ({
        key,
        label: ADD_MENU_ITEM_LABELS[key](t),
      })),
    [addMenuOrder, cards, t]
  );
  const pickerOptions = useMemo(
    () =>
      ADD_MENU_ITEM_KEYS.map((key) => ({
        value: key,
        label: ADD_MENU_ITEM_LABELS[key](t),
      })),
    [t]
  );
  const isDefault =
    hiddenAddMenuItems.length === 0 &&
    cards.every((key, index) => key === DEFAULT_ADD_MENU_CARDS[index]) &&
    resolveKeyOrder(addMenuOrder, ADD_MENU_ITEM_KEYS).every(
      (key, index) => key === ADD_MENU_ITEM_KEYS[index]
    );

  const header = useScreenHeader({
    title: t('screens.addMenuSettings', { defaultValue: 'Add menu' }),
    left: { kind: 'back' },
  });

  const renderSlot = (slotIndex: number) => {
    const key = cards[slotIndex]!;
    return (
      <BottomSheetPicker<AddMenuItemKey>
        key={slotIndex}
        value={key}
        options={pickerOptions}
        onSelect={(picked) =>
          setAddMenuCards(placeInCardSlot(cards, slotIndex, picked))
        }
        title={t('addMenuSettings.chooseCard', {
          defaultValue: 'Choose a big button',
        })}
        renderTrigger={({ onPress }) => (
          <Pressable
            testID={`add-menu-slot-${slotIndex}`}
            accessibilityRole="button"
            accessibilityLabel={t('addMenuSettings.slotLabel', {
              defaultValue: 'Big button {{number}}: {{name}}',
              number: slotIndex + 1,
              name: ADD_MENU_ITEM_LABELS[key](t),
            })}
            accessibilityHint={t('addMenuSettings.slotHint', {
              defaultValue: 'Opens a list to choose what goes here',
            })}
            onPress={onPress}
            className="flex-1 mx-1.5 py-5 rounded-xl items-center"
            style={({ pressed }) => ({
              backgroundColor: raisedBg,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Icon
              name={ADD_MENU_ITEM_ICONS[key]}
              size={32}
              color={accentPrimary}
            />
            <Text
              className="text-text-primary text-sm font-medium mt-2 text-center"
              numberOfLines={1}
            >
              {ADD_MENU_ITEM_LABELS[key](t)}
            </Text>
          </Pressable>
        )}
      />
    );
  };

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingTop: 16,
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
        contentInsetAdjustmentBehavior={
          usesNativeHeader ? 'automatic' : 'never'
        }
      >
        <Text className="text-text-primary text-base font-semibold mb-1">
          {t('addMenuSettings.cardsTitle', { defaultValue: 'Big buttons' })}
        </Text>
        <Text className="text-text-secondary text-sm mb-4">
          {t('addMenuSettings.cardsDescription', {
            defaultValue:
              'The four buttons at the top of the + menu. Tap one to choose what goes there. Choosing something already placed swaps the two.',
          })}
        </Text>
        <View className="-mx-1.5">
          <View className="flex-row mb-3">
            {[0, 1].map((slot) => renderSlot(slot))}
          </View>
          <View className="flex-row">
            {[2, 3].map((slot) => renderSlot(slot))}
          </View>
        </View>

        <Text className="text-text-primary text-base font-semibold mt-8 mb-1">
          {t('addMenuSettings.rowsTitle', { defaultValue: 'Rows' })}
        </Text>
        <Text className="text-text-secondary text-sm mb-4">
          {t('addMenuSettings.rowsDescription', {
            defaultValue:
              'Everything else, listed under the buttons. Drag a row by its handle to move it. Toggle a row off to hide it.',
          })}
        </Text>
        <ReorderSwitchList
          items={rows}
          testIDPrefix="add-menu"
          isEnabled={(key) => !hiddenAddMenuItems.includes(key)}
          onToggle={(key, enabled) => setAddMenuItemHidden(key, !enabled)}
          onReorder={(reordered) =>
            setAddMenuOrder(mergeRowOrder(addMenuOrder, cards, reordered))
          }
          reorderA11yLabel={(name) =>
            t('addMenuSettings.reorder', {
              defaultValue: 'Reorder {{name}}',
              name,
            })
          }
          reorderA11yHint={t('addMenuSettings.reorderHint', {
            defaultValue: 'Changes where this row sits in the + menu',
          })}
        />
        <View className="mt-6">
          <Button
            variant="secondary"
            onPress={resetAddMenu}
            disabled={isDefault}
            testID="add-menu-reset"
          >
            <Text className="text-text-primary text-base font-medium">
              {t('addMenuSettings.reset', {
                defaultValue: 'Reset to default',
              })}
            </Text>
          </Button>
        </View>
      </ScrollView>
    </View>
  );
};

export default AddMenuSettingsScreen;
