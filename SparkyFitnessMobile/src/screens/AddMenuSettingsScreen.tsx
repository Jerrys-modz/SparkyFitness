import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { ReorderSwitchList } from '../components/ReorderSwitchList';
import Button from '../components/ui/Button';
import {
  ADD_MENU_ITEM_KEYS,
  ADD_MENU_ITEM_LABELS,
} from '../constants/addMenuItems';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import type { RootStackScreenProps } from '../types/navigation';
import { resolveKeyOrder } from '../utils/reorderUtils';

type AddMenuSettingsScreenProps = RootStackScreenProps<'AddMenuSettings'>;

/**
 * Which rows the + sheet shows under its four cards, and in what order. A
 * row can also be absent for another reason (a feature turned off, a section
 * hidden elsewhere); this screen lists every row either way.
 */
const AddMenuSettingsScreen: React.FC<AddMenuSettingsScreenProps> = () => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();

  const addMenuOrder = useAppPreferencesStore((s) => s.addMenuOrder);
  const hiddenAddMenuItems = useAppPreferencesStore(
    (s) => s.hiddenAddMenuItems
  );
  const setAddMenuOrder = useAppPreferencesStore((s) => s.setAddMenuOrder);
  const setAddMenuItemHidden = useAppPreferencesStore(
    (s) => s.setAddMenuItemHidden
  );
  const resetAddMenu = useAppPreferencesStore((s) => s.resetAddMenu);

  const items = useMemo(
    () =>
      resolveKeyOrder(addMenuOrder, ADD_MENU_ITEM_KEYS).map((key) => ({
        key,
        label: ADD_MENU_ITEM_LABELS[key](t),
      })),
    [addMenuOrder, t]
  );
  const isDefault =
    hiddenAddMenuItems.length === 0 &&
    items.every(({ key }, index) => key === ADD_MENU_ITEM_KEYS[index]);

  const header = useScreenHeader({
    title: t('screens.addMenuSettings', { defaultValue: 'Add menu' }),
    left: { kind: 'back' },
  });

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
        <Text className="text-text-secondary text-sm mb-4">
          {t('addMenuSettings.description', {
            defaultValue:
              'Drag a row by its handle to change where it sits in the + menu. Toggle a row off to hide it. Food, Exercise, Measurements and Scan Food always stay on top.',
          })}
        </Text>
        <ReorderSwitchList
          items={items}
          testIDPrefix="add-menu"
          isEnabled={(key) => !hiddenAddMenuItems.includes(key)}
          onToggle={(key, enabled) => setAddMenuItemHidden(key, !enabled)}
          onReorder={setAddMenuOrder}
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
