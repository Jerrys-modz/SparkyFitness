import React from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import type { WidgetLayout } from '@workspace/shared';
import Toast from 'react-native-toast-message';

import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import Icon from '../components/Icon';
import StatusView from '../components/StatusView';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useWidgetLayoutStore } from '../stores/widgetLayoutStore';
import type { RootStackScreenProps } from '../types/navigation';
import {
  capWidgetName,
  widgetFamilyLabels,
  widgetMetricLabels,
  widgetStyleLabels,
} from '../utils/widgetBuilder';

type WidgetsScreenProps = RootStackScreenProps<'Widgets'>;

/**
 * Settings > Widgets: the widgets built in the app. Each one is placed on the
 * Home Screen or Lock Screen as the "Custom widget" and chosen in Edit Widget.
 */
const WidgetsScreen: React.FC<WidgetsScreenProps> = ({ navigation }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const [iconColor, dangerColor] = useCSSVariable([
    '--color-text-secondary',
    '--color-icon-danger',
  ]) as [string, string];
  const layouts = useWidgetLayoutStore((state) => state.layouts);
  const deleteLayout = useWidgetLayoutStore((state) => state.deleteLayout);
  const duplicateLayout = useWidgetLayoutStore(
    (state) => state.duplicateLayout
  );

  const familyLabels = widgetFamilyLabels(t);
  const styleLabels = widgetStyleLabels(t);
  const metricLabels = widgetMetricLabels(t);

  const header = useScreenHeader({
    title: t('widgets.title', { defaultValue: 'Widgets' }),
    left: { kind: 'back' },
    right: {
      kind: 'icon',
      sfSymbol: 'plus',
      ionicon: 'add',
      accessibilityLabel: t('widgets.add', { defaultValue: 'New widget' }),
      onPress: () => navigation.navigate('WidgetEditor', {}),
    },
  });

  const confirmDelete = (layout: WidgetLayout) => {
    Alert.alert(
      t('widgets.deleteTitle', { defaultValue: 'Delete widget?' }),
      t('widgets.deleteMessage', {
        defaultValue:
          '"{{name}}" will stop showing on any Home Screen or Lock Screen widget that uses it.',
        name: layout.name,
      }),
      [
        {
          text: t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
        {
          text: t('common.delete', { defaultValue: 'Delete' }),
          style: 'destructive',
          onPress: () => deleteLayout(layout.id),
        },
      ]
    );
  };

  const duplicate = (layout: WidgetLayout) => {
    const name = capWidgetName(
      t('widgets.copyName', {
        defaultValue: '{{name}} copy',
        name: layout.name,
      })
    );
    const id = duplicateLayout(layout.id, name);
    if (id === null) {
      Toast.show({
        type: 'error',
        text1: t('widgets.editor.limitReached', {
          defaultValue: 'You have reached the widget limit',
        }),
        text2: t('widgets.editor.limitReachedHelp', {
          defaultValue: 'Delete one you no longer use to make room.',
        }),
      });
      return;
    }
    navigation.navigate('WidgetEditor', { layoutId: id });
  };

  const renderLayout = ({ item }: { item: WidgetLayout }) => (
    <View className="bg-surface rounded-xl mb-3 shadow-sm flex-row items-center">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('widgets.editNamed', {
          defaultValue: 'Edit {{name}}',
          name: item.name,
        })}
        className="flex-1 px-4 py-4"
        style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
        onPress={() =>
          navigation.navigate('WidgetEditor', { layoutId: item.id })
        }
      >
        <Text className="text-base font-semibold text-text-primary">
          {item.name}
        </Text>
        <Text className="text-sm text-text-secondary mt-1">
          {`${familyLabels[item.family]} • ${styleLabels[item.style]}`}
        </Text>
        <Text className="text-xs text-text-muted mt-0.5" numberOfLines={1}>
          {item.metrics
            .map((m) => m.label?.trim() || metricLabels[m.metric])
            .join(', ')}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('widgets.duplicateNamed', {
          defaultValue: 'Duplicate {{name}}',
          name: item.name,
        })}
        className="py-4 pl-2"
        onPress={() => duplicate(item)}
      >
        <Icon name="copy" size={20} color={iconColor} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('widgets.deleteNamed', {
          defaultValue: 'Delete {{name}}',
          name: item.name,
        })}
        className="p-4"
        onPress={() => confirmDelete(item)}
      >
        <Icon name="trash" size={20} color={dangerColor} />
      </Pressable>
    </View>
  );

  return (
    <View
      className="flex-1 bg-background"
      style={!usesNativeHeader ? { paddingTop: insets.top } : undefined}
    >
      {header}
      <FlatList
        data={layouts}
        keyExtractor={(item) => item.id}
        renderItem={renderLayout}
        contentInsetAdjustmentBehavior={
          usesNativeHeader ? 'automatic' : 'never'
        }
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: insets.bottom + activeWorkoutBarPadding + 16,
          flexGrow: 1,
        }}
        ListHeaderComponent={
          <Text className="text-sm text-text-secondary mb-4">
            {t('widgets.howTo', {
              defaultValue:
                'Build a widget here, then touch and hold your Home Screen or Lock Screen, tap Add, choose SparkyFitness and add "Custom widget". Touch and hold it, tap Edit Widget and pick yours.',
            })}
          </Text>
        }
        ListEmptyComponent={
          <StatusView
            inline
            icon="chart-bar"
            title={t('widgets.emptyTitle', {
              defaultValue: 'No widgets yet',
            })}
            subtitle={t('widgets.emptySubtitle', {
              defaultValue:
                'Choose the numbers, the size and the look of your own Home Screen or Lock Screen widget.',
            })}
            action={{
              label: t('widgets.add', { defaultValue: 'New widget' }),
              onPress: () => navigation.navigate('WidgetEditor', {}),
              variant: 'primary',
            }}
          />
        }
      />
    </View>
  );
};

export default WidgetsScreen;
