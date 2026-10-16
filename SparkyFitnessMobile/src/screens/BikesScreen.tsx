import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BikeResponse } from '@workspace/shared';

import StatusView from '../components/StatusView';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { usePreferences } from '../hooks/usePreferences';
import { useBikes } from '../hooks/useBikes';
import { formatLocalizedNumber } from '../localization';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { formatMovingTime } from '../utils/bikeComponents';
import { kmToMiles } from '../utils/unitConversions';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'Bikes'>;

const BikeCard: React.FC<{
  bike: BikeResponse;
  distanceUnit: 'km' | 'miles';
  onPress: () => void;
}> = ({ bike, distanceUnit, onPress }) => {
  const { t } = useTranslation();
  const unit = distanceUnit === 'miles' ? 'mi' : 'km';
  const distance = formatLocalizedNumber(
    distanceUnit === 'miles'
      ? kmToMiles(bike.total_distance_km)
      : bike.total_distance_km,
    { maximumFractionDigits: 1 }
  );
  const subtitle = [bike.brand, bike.model].filter(Boolean).join(' ');
  const due = bike.due_now_component_count;
  const soon = bike.due_soon_component_count;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={bike.name}
      className={`bg-surface rounded-xl p-4 mb-3 shadow-sm ${
        bike.status === 'retired' ? 'opacity-60' : ''
      }`}
    >
      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-2">
          <Text
            className="text-base font-semibold text-text-primary"
            numberOfLines={1}
          >
            {bike.name}
            {bike.is_default ? '  ★' : ''}
          </Text>
          {subtitle ? (
            <Text className="text-sm text-text-secondary" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {bike.status === 'retired' ? (
          <Text className="text-xs font-semibold text-text-secondary">
            {t('bikes.retired', { defaultValue: 'Retired' })}
          </Text>
        ) : null}
      </View>
      <View className="flex-row justify-between mt-3">
        <Text className="text-sm font-medium text-text-primary">
          {distance} {unit}
        </Text>
        <Text className="text-sm text-text-secondary">
          {formatMovingTime(bike.total_moving_time_seconds)}
        </Text>
      </View>
      {bike.status === 'active' && (due > 0 || soon > 0) ? (
        <View className="mt-2 flex-row">
          {due > 0 ? (
            <Text className="text-xs font-semibold text-red-500 mr-3">
              {t('bikes.componentsDueNow', {
                count: due,
                defaultValue: '{{count}} parts due now',
                defaultValue_one: '{{count}} part due now',
                defaultValue_other: '{{count}} parts due now',
              })}
            </Text>
          ) : null}
          {soon > 0 ? (
            <Text className="text-xs font-semibold text-amber-500">
              {t('bikes.componentsDueSoon', {
                count: soon,
                defaultValue: '{{count}} parts due soon',
                defaultValue_one: '{{count}} part due soon',
                defaultValue_other: '{{count}} parts due soon',
              })}
            </Text>
          ) : null}
        </View>
      ) : null}
      <Text className="text-xs text-text-secondary mt-2">
        {t('bikes.rideCount', {
          count: bike.ride_count,
          defaultValue: '{{count}} rides',
          defaultValue_one: '{{count}} ride',
          defaultValue_other: '{{count}} rides',
        })}
        {bike.last_used_date
          ? ` · ${t('bikes.lastUsed', {
              defaultValue: 'last used {{date}}',
              date: bike.last_used_date,
            })}`
          : ''}
      </Text>
    </Pressable>
  );
};

const BikesScreen: React.FC<Props> = ({ navigation }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();
  const { preferences } = usePreferences();
  const distanceUnit =
    (preferences?.default_distance_unit as 'km' | 'miles') ?? 'km';
  const { bikes, isLoading, isError, refetch } = useBikes();

  const header = useScreenHeader({
    title: t('bikes.title', { defaultValue: 'Bikes' }),
    left: { kind: 'back' },
    right: [
      {
        kind: 'primary',
        label: t('bikes.add', { defaultValue: 'Add' }),
        onPress: () => navigation.navigate('BikeForm', {}),
      },
    ],
  });

  const active = bikes.filter((bike) => bike.status === 'active');
  const retired = bikes.filter((bike) => bike.status === 'retired');
  const renderList = (list: BikeResponse[]) =>
    list.map((bike) => (
      <BikeCard
        key={bike.id}
        bike={bike}
        distanceUnit={distanceUnit}
        onPress={() => navigation.navigate('BikeDetail', { bikeId: bike.id })}
      />
    ));

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      {isError ? (
        <StatusView
          icon="alert-circle"
          iconTone="danger"
          title={t('bikes.loadFailed', {
            defaultValue: 'Could not load your bikes.',
          })}
          action={{
            label: t('common.retry', { defaultValue: 'Retry' }),
            onPress: () => void refetch(),
          }}
        />
      ) : isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : bikes.length === 0 ? (
        <StatusView
          icon="exercise-cycling"
          title={t('bikes.empty', { defaultValue: 'No bikes yet' })}
          subtitle={t('bikes.emptyHint', {
            defaultValue:
              'Add a bike, then pick it on a ride to count its distance and track component wear.',
          })}
          action={{
            label: t('bikes.addBike', { defaultValue: 'Add bike' }),
            onPress: () => navigation.navigate('BikeForm', {}),
          }}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{
            padding: 16,
            paddingBottom: insets.bottom + 24 + activeWorkoutBarPadding,
          }}
        >
          {renderList(active)}
          {retired.length > 0 && (
            <>
              <Text className="text-sm font-semibold text-text-secondary mt-2 mb-2">
                {t('bikes.retiredSection', { defaultValue: 'Retired' })}
              </Text>
              {renderList(retired)}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
};

export default BikesScreen;
