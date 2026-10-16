import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import {
  BIKE_COMPONENT_TYPES,
  DEFAULT_COMPONENT_LIFE,
  type BikeComponentResponse,
  type BikeComponentType,
} from '@workspace/shared';

import BottomSheetPicker from '../components/BottomSheetPicker';
import CalendarSheet, {
  type CalendarSheetRef,
} from '../components/CalendarSheet';
import FormInput from '../components/FormInput';
import Icon from '../components/Icon';
import StatusView from '../components/StatusView';
import Button from '../components/ui/Button';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { usePreferences } from '../hooks/usePreferences';
import { useBike, useBikeComponentMutations } from '../hooks/useBikes';
import { getAppLocale } from '../localization';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { componentTypeLabel } from '../utils/bikeComponents';
import { formatDate, toLocalDateString } from '../utils/dateUtils';
import { kmToMiles, milesToKm } from '../utils/unitConversions';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'BikeComponentForm'>;

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

const ComponentForm: React.FC<{
  bikeId: string;
  component: BikeComponentResponse | null;
  distanceUnit: 'km' | 'miles';
  onDone: () => void;
}> = ({ bikeId, component, distanceUnit, onDone }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const { createMutation, updateMutation, deleteMutation } =
    useBikeComponentMutations(bikeId);
  const unitLabel = distanceUnit === 'miles' ? 'mi' : 'km';
  const calendarSheetRef = useRef<CalendarSheetRef>(null);
  const [accentPrimary, borderSubtle, raisedBg] = useCSSVariable([
    '--color-accent-primary',
    '--color-border-subtle',
    '--color-raised',
  ]) as [string, string, string];

  const [type, setType] = useState<BikeComponentType>(
    component?.component_type ?? 'chain'
  );
  const [name, setName] = useState(component?.name ?? '');
  const [installedOn, setInstalledOn] = useState(
    component?.installed_on ?? toLocalDateString(new Date())
  );
  const [lifeDistance, setLifeDistance] = useState(
    component
      ? component.expected_life_km != null
        ? toDisplay(component.expected_life_km, distanceUnit)
        : ''
      : toDisplay(DEFAULT_COMPONENT_LIFE.chain.km ?? 0, distanceUnit)
  );
  const [lifeHours, setLifeHours] = useState(
    component?.expected_life_hours != null
      ? String(component.expected_life_hours)
      : ''
  );

  const distance =
    lifeDistance.trim() === '' ? null : parseNumber(lifeDistance);
  const hours = lifeHours.trim() === '' ? null : parseNumber(lifeHours);
  const errors = {
    distance: lifeDistance.trim() !== '' && (distance == null || distance <= 0),
    hours: lifeHours.trim() !== '' && (hours == null || hours <= 0),
    // Wear needs at least one limit to be measured against.
    noLife: lifeDistance.trim() === '' && lifeHours.trim() === '',
  };
  const hasErrors = Object.values(errors).some(Boolean);
  const isSaving = createMutation.isPending || updateMutation.isPending;
  const isBusy = isSaving || deleteMutation.isPending;

  const handleTypeChange = (next: BikeComponentType) => {
    // Only a still-untouched new component follows the type's defaults.
    if (!component) {
      setType(next);
      const km = DEFAULT_COMPONENT_LIFE[next].km;
      setLifeDistance(km != null ? toDisplay(km, distanceUnit) : '');
    }
  };

  const handleSave = () => {
    if (hasErrors) return;
    const expectedKm =
      distance == null
        ? null
        : // An untouched field keeps the stored km value.
          component?.expected_life_km != null &&
            lifeDistance === toDisplay(component.expected_life_km, distanceUnit)
          ? component.expected_life_km
          : distanceUnit === 'miles'
            ? milesToKm(distance)
            : distance;
    const finalName = name.trim() || componentTypeLabel(t, type);
    if (component) {
      updateMutation.mutate(
        {
          id: component.id,
          data: {
            name: finalName,
            installed_on: installedOn,
            expected_life_km: expectedKm,
            expected_life_hours: hours,
          },
        },
        { onSuccess: onDone }
      );
    } else {
      createMutation.mutate(
        {
          component_type: type,
          name: finalName,
          installed_on: installedOn,
          expected_life_km: expectedKm,
          expected_life_hours: hours,
        },
        { onSuccess: onDone }
      );
    }
  };

  const handleDelete = () => {
    if (!component || isBusy) return;
    Alert.alert(
      t('bikes.deleteComponentTitle', {
        defaultValue: 'Delete this component?',
      }),
      t('bikes.deleteComponentDescription', {
        defaultValue:
          'Its wear is lost. To keep it in the history, retire it instead.',
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
            deleteMutation.mutate(component.id, { onSuccess: onDone }),
        },
      ]
    );
  };

  const errorText = (message: string) => (
    <Text className="text-sm text-red-500 mt-1">{message}</Text>
  );

  return (
    <>
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
          {!component && (
            <View className="mb-4">
              <FieldLabel
                title={t('bikes.componentTypeLabel', { defaultValue: 'Type' })}
              />
              <BottomSheetPicker
                value={type}
                options={BIKE_COMPONENT_TYPES.map((value) => ({
                  label: componentTypeLabel(t, value),
                  value,
                }))}
                title={t('bikes.componentTypeLabel', { defaultValue: 'Type' })}
                onSelect={(value) =>
                  handleTypeChange(value as BikeComponentType)
                }
              />
            </View>
          )}
          <FieldLabel title={t('bikes.name', { defaultValue: 'Name' })} />
          <FormInput
            value={name}
            onChangeText={setName}
            maxLength={120}
            placeholder={componentTypeLabel(t, type)}
            accessibilityLabel={t('bikes.name', { defaultValue: 'Name' })}
          />
          <View className="mt-4">
            <FieldLabel
              title={t('bikes.installedOn', { defaultValue: 'Installed on' })}
            />
            <Pressable
              onPress={() => calendarSheetRef.current?.present()}
              accessibilityRole="button"
              accessibilityLabel={t('bikes.installedOn', {
                defaultValue: 'Installed on',
              })}
              className="flex-row items-center justify-between rounded-lg"
              style={{
                backgroundColor: raisedBg,
                borderWidth: 1,
                borderColor: borderSubtle,
                paddingVertical: 10,
                paddingHorizontal: 12,
              }}
            >
              <Text className="text-base text-text-primary">
                {formatDate(installedOn, getAppLocale())}
              </Text>
              <Icon name="chevron-down" size={16} color={accentPrimary} />
            </Pressable>
          </View>
        </View>

        <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
          <FieldLabel
            title={t('bikes.lifeDistance', {
              defaultValue: 'Expected life ({{unit}})',
              unit: unitLabel,
            })}
          />
          <FormInput
            value={lifeDistance}
            onChangeText={setLifeDistance}
            keyboardType="decimal-pad"
            maxLength={8}
            returnKeyType="done"
            accessibilityLabel={t('bikes.lifeDistance', {
              defaultValue: 'Expected life ({{unit}})',
              unit: unitLabel,
            })}
          />
          {errors.distance &&
            errorText(
              t('bikes.lifeInvalid', {
                defaultValue: 'Enter a number above 0.',
              })
            )}
          <View className="mt-4">
            <FieldLabel
              title={t('bikes.lifeHours', {
                defaultValue: 'Expected life (hours)',
              })}
            />
            <FormInput
              value={lifeHours}
              onChangeText={setLifeHours}
              keyboardType="decimal-pad"
              maxLength={8}
              returnKeyType="done"
              accessibilityLabel={t('bikes.lifeHours', {
                defaultValue: 'Expected life (hours)',
              })}
            />
            {errors.hours &&
              errorText(
                t('bikes.lifeInvalid', {
                  defaultValue: 'Enter a number above 0.',
                })
              )}
          </View>
          {errors.noLife &&
            errorText(
              t('bikes.lifeRequired', {
                defaultValue: 'Set a distance, hours or both.',
              })
            )}
          <Text className="text-xs text-text-secondary mt-3">
            {t('bikes.lifeHint', {
              defaultValue:
                'With both set, the part is due when either is reached.',
            })}
          </Text>
        </View>

        <Button
          variant="primary"
          onPress={handleSave}
          loading={isSaving}
          disabled={hasErrors || isBusy}
        >
          {t('common.save', { defaultValue: 'Save' })}
        </Button>
        {component && (
          <View className="mt-3">
            <Button
              variant="destructive"
              onPress={handleDelete}
              disabled={isBusy}
            >
              {t('common.delete', { defaultValue: 'Delete' })}
            </Button>
          </View>
        )}
      </ScrollView>
      <CalendarSheet
        ref={calendarSheetRef}
        selectedDate={installedOn}
        onSelectDate={setInstalledOn}
      />
    </>
  );
};

const BikeComponentFormScreen: React.FC<Props> = ({ navigation, route }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const { preferences } = usePreferences();
  const distanceUnit =
    (preferences?.default_distance_unit as 'km' | 'miles') ?? 'km';
  const { bikeId, componentId } = route.params;
  const { bike, isLoading, isError, refetch } = useBike(bikeId);
  const component = componentId
    ? (bike?.components.find((c) => c.id === componentId) ?? null)
    : null;

  const header = useScreenHeader({
    title: componentId
      ? t('bikes.editComponent', { defaultValue: 'Edit component' })
      : t('bikes.addComponent', { defaultValue: 'Add component' }),
    left: { kind: 'back' },
  });

  // Wait for the bike so an edit starts from the saved values.
  const ready = !componentId || (bike !== null && component !== null);

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      {ready ? (
        <ComponentForm
          key={component?.id ?? 'new-component'}
          bikeId={bikeId}
          component={component}
          distanceUnit={distanceUnit}
          onDone={() => navigation.goBack()}
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
              : t('bikes.componentNotFound', {
                  defaultValue: 'Component not found.',
                })
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

export default BikeComponentFormScreen;
