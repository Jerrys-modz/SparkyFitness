import React from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BikeComponentResponse } from '@workspace/shared';

import ComponentWearBar from '../components/ComponentWearBar';
import StatusView from '../components/StatusView';
import Button from '../components/ui/Button';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { usePreferences } from '../hooks/usePreferences';
import { useBike, useBikeComponentMutations } from '../hooks/useBikes';
import { formatLocalizedNumber } from '../localization';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { componentTypeLabel, formatMovingTime } from '../utils/bikeComponents';
import { toLocalDateString } from '../utils/dateUtils';
import { kmToMiles } from '../utils/unitConversions';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'BikeDetail'>;

const ComponentCard: React.FC<{
  component: BikeComponentResponse;
  distanceUnit: 'km' | 'miles';
  busy: boolean;
  onEdit: () => void;
  onReplace: () => void;
  onRetire: () => void;
}> = ({ component, distanceUnit, busy, onEdit, onReplace, onRetire }) => {
  const { t } = useTranslation();
  const unit = distanceUnit === 'miles' ? 'mi' : 'km';
  const show = (km: number) =>
    formatLocalizedNumber(distanceUnit === 'miles' ? kmToMiles(km) : km, {
      maximumFractionDigits: 1,
    });
  const limits = [
    component.expected_life_km != null
      ? `${show(component.expected_life_km)} ${unit}`
      : null,
    component.expected_life_hours != null
      ? `${formatLocalizedNumber(component.expected_life_hours, { maximumFractionDigits: 1 })} h`
      : null,
  ]
    .filter(Boolean)
    .join(' / ');
  const title = componentTypeLabel(t, component.component_type);

  return (
    <View className="bg-surface rounded-xl p-4 mb-3 shadow-sm">
      <Pressable
        onPress={onEdit}
        accessibilityRole="button"
        accessibilityLabel={component.name}
      >
        <View className="flex-row justify-between mb-1">
          <Text
            className="flex-1 pr-2 text-base font-semibold text-text-primary"
            numberOfLines={1}
          >
            {component.name}
          </Text>
          <Text className="text-xs text-text-secondary">{title}</Text>
        </View>
        <Text className="text-sm text-text-secondary mb-3">
          {t('bikes.componentUsage', {
            defaultValue: '{{distance}} {{unit}} · {{time}} since {{date}}',
            distance: show(component.distance_km),
            unit,
            time: formatMovingTime(component.hours * 3600),
            date: component.installed_on,
          })}
        </Text>
        <ComponentWearBar
          wearPercent={component.wear_percent}
          state={component.wear_state}
        />
        <Text className="text-xs text-text-secondary mt-1">
          {t('bikes.expectedLife', {
            defaultValue: 'Expected life: {{limits}}',
            limits,
          })}
        </Text>
      </Pressable>
      <View className="flex-row mt-3">
        <View className="mr-2">
          <Button variant="outline" onPress={onReplace} disabled={busy}>
            {t('bikes.replace', { defaultValue: 'Replace' })}
          </Button>
        </View>
        <Button variant="outline" onPress={onRetire} disabled={busy}>
          {t('bikes.retireComponent', { defaultValue: 'Retire' })}
        </Button>
      </View>
    </View>
  );
};

const BikeDetailScreen: React.FC<Props> = ({ navigation, route }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();
  const { preferences } = usePreferences();
  const distanceUnit =
    (preferences?.default_distance_unit as 'km' | 'miles') ?? 'km';
  const unit = distanceUnit === 'miles' ? 'mi' : 'km';
  const { bikeId } = route.params;
  const { bike, isLoading, isError, refetch } = useBike(bikeId);
  const { replaceMutation, retireMutation } = useBikeComponentMutations(bikeId);
  const busy = replaceMutation.isPending || retireMutation.isPending;

  const header = useScreenHeader({
    title: bike?.name ?? t('bikes.title', { defaultValue: 'Bikes' }),
    left: { kind: 'back' },
    right: [
      {
        kind: 'primary',
        label: t('bikes.edit', { defaultValue: 'Edit' }),
        onPress: () => navigation.navigate('BikeForm', { bikeId }),
      },
    ],
  });

  const confirmReplace = (component: BikeComponentResponse) =>
    Alert.alert(
      t('bikes.replaceTitle', {
        defaultValue: 'Replace {{name}}?',
        name: component.name,
      }),
      t('bikes.replaceMessage', {
        defaultValue:
          'The old part is kept in the history and the new one starts counting from today.',
      }),
      [
        {
          text: t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
        {
          text: t('bikes.replace', { defaultValue: 'Replace' }),
          onPress: () =>
            replaceMutation.mutate({
              id: component.id,
              data: { replaced_on: toLocalDateString(new Date()) },
            }),
        },
      ]
    );

  const confirmRetire = (component: BikeComponentResponse) =>
    Alert.alert(
      t('bikes.retireTitle', {
        defaultValue: 'Retire {{name}}?',
        name: component.name,
      }),
      t('bikes.retireMessage', {
        defaultValue:
          'It stops counting and moves to the history. Add a new part when you fit one.',
      }),
      [
        {
          text: t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
        {
          text: t('bikes.retireComponent', { defaultValue: 'Retire' }),
          style: 'destructive',
          onPress: () =>
            retireMutation.mutate({
              id: component.id,
              data: { retired_on: toLocalDateString(new Date()) },
            }),
        },
      ]
    );

  const active = bike?.components.filter((c) => c.status === 'active') ?? [];
  const history = bike?.components.filter((c) => c.status === 'retired') ?? [];

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      {bike ? (
        <ScrollView
          contentContainerStyle={{
            padding: 16,
            paddingBottom: insets.bottom + 24 + activeWorkoutBarPadding,
          }}
        >
          <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
            {bike.brand || bike.model ? (
              <Text className="text-sm text-text-secondary mb-2">
                {[bike.brand, bike.model].filter(Boolean).join(' ')}
                {bike.status === 'retired'
                  ? ` · ${t('bikes.retired', { defaultValue: 'Retired' })}`
                  : ''}
              </Text>
            ) : null}
            <Text className="text-2xl font-bold text-text-primary">
              {formatLocalizedNumber(
                distanceUnit === 'miles'
                  ? kmToMiles(bike.total_distance_km)
                  : bike.total_distance_km,
                { maximumFractionDigits: 1 }
              )}{' '}
              {unit}
            </Text>
            <Text className="text-sm text-text-secondary mt-1">
              {formatMovingTime(bike.total_moving_time_seconds)}
              {' · '}
              {t('bikes.rideCount', {
                count: bike.ride_count,
                defaultValue: '{{count}} rides',
                defaultValue_one: '{{count}} ride',
                defaultValue_other: '{{count}} rides',
              })}
            </Text>
          </View>

          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-lg font-semibold text-text-primary">
              {t('bikes.components', { defaultValue: 'Components' })}
            </Text>
            <Button
              variant="ghost"
              onPress={() =>
                navigation.navigate('BikeComponentForm', { bikeId })
              }
            >
              {t('bikes.addComponent', { defaultValue: 'Add component' })}
            </Button>
          </View>
          {active.length === 0 ? (
            <Text className="text-sm text-text-secondary mb-4">
              {t('bikes.noComponents', {
                defaultValue:
                  'No components yet. Add a chain, tires or brake pads to track their wear.',
              })}
            </Text>
          ) : (
            active.map((component) => (
              <ComponentCard
                key={component.id}
                component={component}
                distanceUnit={distanceUnit}
                busy={busy}
                onEdit={() =>
                  navigation.navigate('BikeComponentForm', {
                    bikeId,
                    componentId: component.id,
                  })
                }
                onReplace={() => confirmReplace(component)}
                onRetire={() => confirmRetire(component)}
              />
            ))
          )}

          {history.length > 0 && (
            <>
              <Text className="text-sm font-semibold text-text-secondary mt-2 mb-2">
                {t('bikes.componentHistory', { defaultValue: 'History' })}
              </Text>
              {history.map((component) => (
                <View
                  key={component.id}
                  className="bg-surface rounded-xl p-3 mb-2 opacity-70"
                >
                  <Text className="text-sm font-medium text-text-primary">
                    {component.name} ·{' '}
                    {componentTypeLabel(t, component.component_type)}
                  </Text>
                  <Text className="text-xs text-text-secondary mt-1">
                    {t('bikes.historyUsage', {
                      defaultValue:
                        '{{distance}} {{unit}} · {{from}} to {{to}}',
                      distance: formatLocalizedNumber(
                        distanceUnit === 'miles'
                          ? kmToMiles(component.distance_km)
                          : component.distance_km,
                        { maximumFractionDigits: 1 }
                      ),
                      unit,
                      from: component.installed_on,
                      to: component.retired_on ?? '',
                    })}
                  </Text>
                </View>
              ))}
            </>
          )}
        </ScrollView>
      ) : isLoading ? (
        <StatusView loading />
      ) : (
        <StatusView
          icon="alert-circle"
          iconTone="danger"
          title={
            isError
              ? t('bikes.loadFailed', {
                  defaultValue: 'Could not load your bikes.',
                })
              : t('bikes.notFound', { defaultValue: 'Bike not found.' })
          }
          action={{
            label: t('common.retry', { defaultValue: 'Retry' }),
            onPress: () => void refetch(),
          }}
        />
      )}
    </View>
  );
};

export default BikeDetailScreen;
