import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import type { BikeDetailResponse, CreateBikeBody } from '@workspace/shared';

import FormInput from '../components/FormInput';
import StatusView from '../components/StatusView';
import SettingsRow, { SettingsRowGroup } from '../components/SettingsRow';
import Button from '../components/ui/Button';
import Switch from '../components/ui/Switch';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { usePreferences } from '../hooks/usePreferences';
import { useBike, useBikeMutations } from '../hooks/useBikes';
import { addLog } from '../services/LogService';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { kmToMiles, milesToKm } from '../utils/unitConversions';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'BikeForm'>;

const parseNumber = (text: string): number | null => {
  const n = Number(text.replace(',', '.').trim());
  return text.trim() !== '' && Number.isFinite(n) ? n : null;
};

const FieldLabel: React.FC<{ title: string }> = ({ title }) => (
  <Text className="text-base font-semibold text-text-primary mb-2">
    {title}
  </Text>
);

const toDisplay = (km: number, unit: 'km' | 'miles') =>
  String(Math.round((unit === 'miles' ? kmToMiles(km) : km) * 10) / 10);

const BikeForm: React.FC<{
  bike: BikeDetailResponse | null;
  distanceUnit: 'km' | 'miles';
  onDone: () => void;
  onDeleted: () => void;
}> = ({ bike, distanceUnit, onDone, onDeleted }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const { createMutation, updateMutation, deleteMutation } = useBikeMutations();
  const unitLabel = distanceUnit === 'miles' ? 'mi' : 'km';

  const [name, setName] = useState(bike?.name ?? '');
  const [brand, setBrand] = useState(bike?.brand ?? '');
  const [model, setModel] = useState(bike?.model ?? '');
  const [startingDistance, setStartingDistance] = useState(
    bike ? toDisplay(bike.starting_distance_km, distanceUnit) : '0'
  );
  const [isDefault, setIsDefault] = useState(bike?.is_default ?? false);

  const starting = parseNumber(startingDistance || '0');
  const errors = {
    name: name.trim() === '',
    starting: starting == null || starting < 0,
  };
  const hasErrors = Object.values(errors).some(Boolean);
  const isSaving = createMutation.isPending || updateMutation.isPending;
  const isBusy = isSaving || deleteMutation.isPending;
  const optionalText = (value: string) => value.trim() || null;

  const handleError = (error: unknown) => {
    addLog('Failed to save bike', 'ERROR', [String(error)]);
    Toast.show({
      type: 'error',
      text1: t('bikes.saveFailed', { defaultValue: 'Failed to save bike' }),
      text2: t('common.tryAgain', { defaultValue: 'Please try again.' }),
    });
  };

  const handleSave = () => {
    if (hasErrors || starting == null) return;
    const data: CreateBikeBody = {
      name: name.trim(),
      brand: optionalText(brand),
      model: optionalText(model),
      // An untouched field keeps the stored km value: converting the rounded
      // display string back would drift it.
      starting_distance_km:
        bike &&
        startingDistance === toDisplay(bike.starting_distance_km, distanceUnit)
          ? bike.starting_distance_km
          : distanceUnit === 'miles'
            ? milesToKm(starting)
            : starting,
      is_default: isDefault,
    };
    if (bike) {
      // The update mutation reports its own failures.
      updateMutation.mutate({ id: bike.id, data }, { onSuccess: onDone });
    } else {
      createMutation.mutate(data, { onSuccess: onDone, onError: handleError });
    }
  };

  const handleToggleRetired = () => {
    if (!bike || isBusy) return;
    updateMutation.mutate(
      {
        id: bike.id,
        data: { status: bike.status === 'retired' ? 'active' : 'retired' },
      },
      { onSuccess: onDone }
    );
  };

  const handleDelete = () => {
    if (!bike || isBusy) return;
    Alert.alert(
      t('bikes.deleteTitle', { defaultValue: 'Delete this bike?' }),
      t('bikes.deleteDescription', {
        defaultValue:
          'Its components are deleted. Rides logged with this bike stay in your diary, but they will no longer be linked to a bike.',
      }),
      [
        {
          text: t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
        {
          text: t('common.delete', { defaultValue: 'Delete' }),
          style: 'destructive',
          onPress: () =>
            deleteMutation.mutate(bike.id, {
              onSuccess: onDeleted,
              onError: handleError,
            }),
        },
      ]
    );
  };

  const errorText = (message: string) => (
    <Text className="text-sm text-red-500 mt-1">{message}</Text>
  );

  return (
    <ScrollView
      contentContainerStyle={{
        padding: 16,
        paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
        <FieldLabel title={t('bikes.name', { defaultValue: 'Name' })} />
        <FormInput
          value={name}
          onChangeText={setName}
          maxLength={120}
          returnKeyType="next"
          accessibilityLabel={t('bikes.name', { defaultValue: 'Name' })}
        />
        {errors.name &&
          errorText(t('bikes.nameRequired', { defaultValue: 'Enter a name.' }))}
        <View className="mt-4">
          <FieldLabel title={t('bikes.brand', { defaultValue: 'Brand' })} />
          <FormInput
            value={brand}
            onChangeText={setBrand}
            maxLength={120}
            accessibilityLabel={t('bikes.brand', { defaultValue: 'Brand' })}
          />
        </View>
        <View className="mt-4">
          <FieldLabel title={t('bikes.model', { defaultValue: 'Model' })} />
          <FormInput
            value={model}
            onChangeText={setModel}
            maxLength={120}
            accessibilityLabel={t('bikes.model', { defaultValue: 'Model' })}
          />
        </View>
      </View>

      <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
        <FieldLabel
          title={t('bikes.startingDistance', {
            defaultValue: 'Starting distance ({{unit}})',
            unit: unitLabel,
          })}
        />
        <FormInput
          value={startingDistance}
          onChangeText={setStartingDistance}
          keyboardType="decimal-pad"
          maxLength={8}
          returnKeyType="done"
          accessibilityLabel={t('bikes.startingDistance', {
            defaultValue: 'Starting distance ({{unit}})',
            unit: unitLabel,
          })}
        />
        {errors.starting &&
          errorText(
            t('bikes.startingInvalid', { defaultValue: 'Enter 0 or more.' })
          )}
      </View>

      <SettingsRowGroup>
        <SettingsRow
          title={t('bikes.useAsDefault', {
            defaultValue: 'Use as my default bike',
          })}
          subtitle={t('bikes.useAsDefaultHint', {
            defaultValue:
              'New rides recorded in the app are logged with your default bike.',
          })}
          subtitleNumberOfLines={0}
          rightAccessory={
            <Switch
              value={isDefault}
              onValueChange={setIsDefault}
              disabled={bike?.status === 'retired'}
              accessibilityLabel={t('bikes.useAsDefault', {
                defaultValue: 'Use as my default bike',
              })}
            />
          }
        />
      </SettingsRowGroup>

      <Button
        variant="primary"
        onPress={handleSave}
        loading={isSaving}
        disabled={hasErrors || isBusy}
      >
        {t('common.save', { defaultValue: 'Save' })}
      </Button>

      {bike && (
        <View className="mt-3">
          <Button
            variant="outline"
            onPress={handleToggleRetired}
            disabled={isBusy}
          >
            {bike.status === 'retired'
              ? t('bikes.reactivate', { defaultValue: 'Reactivate' })
              : t('bikes.retire', { defaultValue: 'Retire' })}
          </Button>
          <View className="mt-3">
            <Button
              variant="destructive"
              onPress={handleDelete}
              disabled={isBusy}
            >
              {t('common.delete', { defaultValue: 'Delete' })}
            </Button>
          </View>
        </View>
      )}
    </ScrollView>
  );
};

const BikeFormScreen: React.FC<Props> = ({ navigation, route }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const { preferences } = usePreferences();
  const distanceUnit =
    (preferences?.default_distance_unit as 'km' | 'miles') ?? 'km';
  const bikeId = route.params?.bikeId;
  const { bike, isLoading, isError, refetch } = useBike(bikeId);

  const header = useScreenHeader({
    title: bikeId
      ? t('bikes.editBike', { defaultValue: 'Edit bike' })
      : t('bikes.addBike', { defaultValue: 'Add bike' }),
    left: { kind: 'back' },
  });

  // Wait for the bike before mounting the form so its fields start from the
  // saved values instead of a blank bike.
  const ready = !bikeId || (!isLoading && !isError && bike !== null);

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      {ready ? (
        <BikeForm
          key={bike?.id ?? 'new-bike'}
          bike={bike}
          distanceUnit={distanceUnit}
          onDone={() => navigation.goBack()}
          // The detail screen below this one no longer has a bike to show.
          onDeleted={() =>
            bikeId ? navigation.popTo('Bikes') : navigation.goBack()
          }
        />
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

export default BikeFormScreen;
