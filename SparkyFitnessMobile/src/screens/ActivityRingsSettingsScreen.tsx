import React from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import SegmentedControl from '../components/SegmentedControl';
import {
  ACTIVITY_RING_KEYS,
  ACTIVITY_RING_LABELS,
} from '../constants/activityRings';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import type { RootStackScreenProps } from '../types/navigation';
import { resolveActivityRingKeys } from '../utils/activityRings';

type ActivityRingsSettingsScreenProps =
  RootStackScreenProps<'ActivityRingsSettings'>;

const ActivityRingsSettingsScreen: React.FC<
  ActivityRingsSettingsScreenProps
> = () => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();

  const style = useAppPreferencesStore((s) => s.activityRingStyle);
  const setStyle = useAppPreferencesStore((s) => s.setActivityRingStyle);
  const custom = useAppPreferencesStore((s) => s.activityRingCustom);
  const setCustom = useAppPreferencesStore((s) => s.setActivityRingCustom);

  const shown = resolveActivityRingKeys('custom', custom);

  const header = useScreenHeader({
    title: t('screens.activityRingsSettings', {
      defaultValue: 'Activity Rings',
    }),
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
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
        contentInsetAdjustmentBehavior={
          usesNativeHeader ? 'automatic' : 'never'
        }
      >
        <Text className="text-text-secondary text-sm mb-4">
          {t('activityRings.settingsDescription', {
            defaultValue:
              'Rings fill toward your daily goals. Move and Exercise use your exercise goals; Steps uses your steps goal.',
          })}
        </Text>

        <Text className="text-text-primary text-lg font-semibold mb-2">
          {t('activityRings.style', { defaultValue: 'Style' })}
        </Text>
        <SegmentedControl
          segments={[
            {
              key: 'apple',
              label: t('activityRings.styleApple', {
                defaultValue: 'Move',
              }),
            },
            {
              key: 'google',
              label: t('activityRings.styleGoogle', {
                defaultValue: 'Points',
              }),
            },
            {
              key: 'custom',
              label: t('activityRings.styleCustom', { defaultValue: 'Custom' }),
            },
          ]}
          activeKey={style}
          onSelect={setStyle}
        />

        {style === 'apple' && (
          <Text className="text-sm text-text-secondary mt-2">
            {t('activityRings.styleAppleDescription', {
              defaultValue: 'Move (calories) and Exercise (minutes) rings.',
            })}
          </Text>
        )}

        {style === 'google' && (
          <Text className="text-sm text-text-secondary mt-2">
            {t('activityRings.styleGoogleDescription', {
              defaultValue: 'Exercise minutes and Active points rings.',
            })}
          </Text>
        )}

        {style === 'custom' && (
          <View className="mt-4">
            <Text className="text-text-secondary text-sm mb-2">
              {t('activityRings.customDescription', {
                defaultValue: 'Choose which rings to show.',
              })}
            </Text>
            <View className="flex-row flex-wrap">
              {ACTIVITY_RING_KEYS.map((key) => {
                const isShown = shown.includes(key);
                // Keep at least one ring: an empty card has nothing to show.
                const isLast = isShown && shown.length === 1;
                return (
                  <Pressable
                    key={key}
                    testID={`activity-ring-toggle-${key}`}
                    accessibilityRole="checkbox"
                    accessibilityState={{
                      checked: isShown,
                      disabled: isLast,
                    }}
                    disabled={isLast}
                    onPress={() => setCustom(key, !isShown)}
                    className={`px-3 py-2 mr-2 mb-2 rounded-full border ${
                      isShown
                        ? 'bg-accent-primary border-accent-primary'
                        : 'bg-raised border-border-subtle'
                    } ${isLast ? 'opacity-70' : ''}`}
                  >
                    <Text
                      className={`text-sm font-medium ${
                        isShown ? 'text-white' : 'text-text-primary'
                      }`}
                    >
                      {ACTIVITY_RING_LABELS[key](t)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

export default ActivityRingsSettingsScreen;
