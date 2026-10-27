import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, ScrollView, TextInput, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import Toast from 'react-native-toast-message';
import {
  computeFuelingPlan,
  type FuelingExperience,
  type FuelingIntensityZone,
} from '@workspace/shared';

import SegmentedControl from '../components/SegmentedControl';
import FuelFoodSheet, {
  type FuelFoodSheetRef,
} from '../components/FuelFoodSheet';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { requestNotificationPermission } from '../services/notifications';
import {
  cancelFuelingSession,
  getFuelingSession,
  startFuelingSession,
  type FuelingSession,
} from '../services/fuelingReminders';
import { addLog } from '../services/LogService';
import { formatLocalizedNumber } from '../localization';
import type { FoodItem } from '../types/foods';
import type { FuelingFoodRef } from '../utils/fuelingLog';
import type { RootStackScreenProps } from '../types/navigation';

type FuelingPlanScreenProps = RootStackScreenProps<'FuelingPlan'>;

const ZONE_KEYS = ['1', '2', '3', '4', '5'] as const;
type StartKey = '0' | '15' | '30' | '60';

/** A whole number from what was typed, or null for an empty field. */
const parseWhole = (text: string): number | null => {
  const digits = text.replace(/[^0-9]/g, '');
  return digits === '' ? null : Number(digits);
};

const formatClock = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
};

interface NumberFieldProps {
  label: string;
  value: string;
  placeholder?: string;
  onChangeText: (text: string) => void;
  testID: string;
}

const NumberField: React.FC<NumberFieldProps> = ({
  label,
  value,
  placeholder,
  onChangeText,
  testID,
}) => {
  const textPrimary = useCSSVariable('--color-text-primary') as string;
  return (
    <View className="flex-1">
      <Text className="text-text-secondary text-sm mb-1">{label}</Text>
      <TextInput
        testID={testID}
        accessibilityLabel={label}
        value={value}
        placeholder={placeholder}
        onChangeText={(text) => onChangeText(text.replace(/[^0-9]/g, ''))}
        keyboardType="number-pad"
        selectTextOnFocus
        className="font-semibold text-center bg-raised rounded-lg"
        style={{
          height: 44,
          paddingVertical: 0,
          fontSize: 16,
          lineHeight: 16,
          color: textPrimary,
        }}
      />
    </View>
  );
};

const FuelingPlanScreen: React.FC<FuelingPlanScreenProps> = () => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();
  const [accent] = useCSSVariable(['--color-accent-primary']) as [string];

  const [hours, setHours] = useState('3');
  const [minutes, setMinutes] = useState('0');
  const [zone, setZone] = useState<(typeof ZONE_KEYS)[number]>('3');
  const [experience, setExperience] =
    useState<FuelingExperience>('intermediate');
  const [startKey, setStartKey] = useState<StartKey>('0');
  const [carbsOverride, setCarbsOverride] = useState('');
  const [portionOverride, setPortionOverride] = useState('');
  const [productName, setProductName] = useState('');
  const [fuelFood, setFuelFood] = useState<
    (FuelingFoodRef & { name: string; carbs: number }) | null
  >(null);
  const foodSheetRef = useRef<FuelFoodSheetRef>(null);
  const [session, setSession] = useState<FuelingSession | null>(null);
  const [busy, setBusy] = useState(false);

  const header = useScreenHeader({
    title: t('fuelingPlan.title', { defaultValue: 'Fueling plan' }),
    left: { kind: 'back' },
  });

  const refreshSession = useCallback(async () => {
    try {
      setSession(await getFuelingSession());
    } catch (error) {
      addLog(`Reading the fueling session failed: ${String(error)}`, 'ERROR');
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const durationMin =
    (parseWhole(hours) ?? 0) * 60 + (parseWhole(minutes) ?? 0);

  const plan = useMemo(
    () =>
      computeFuelingPlan({
        durationMin,
        intensityZone: Number(zone) as FuelingIntensityZone,
        experience,
        overrides: {
          carbsPerHour: parseWhole(carbsOverride),
          portionGrams: parseWhole(portionOverride),
        },
      }),
    [durationMin, zone, experience, carbsOverride, portionOverride]
  );

  const zoneSegments = useMemo(
    () =>
      ZONE_KEYS.map((key) => ({
        key,
        label: t('fuelingPlan.zoneOption', {
          defaultValue: 'Z{{zone}}',
          zone: key,
        }),
      })),
    [t]
  );

  const experienceSegments = useMemo(
    () => [
      {
        key: 'beginner' as const,
        label: t('fuelingPlan.experienceBeginner', {
          defaultValue: 'Beginner',
        }),
      },
      {
        key: 'intermediate' as const,
        label: t('fuelingPlan.experienceIntermediate', {
          defaultValue: 'Intermediate',
        }),
      },
      {
        key: 'advanced' as const,
        label: t('fuelingPlan.experienceAdvanced', {
          defaultValue: 'Advanced',
        }),
      },
    ],
    [t]
  );

  const startSegments = useMemo(
    () => [
      {
        key: '0' as const,
        label: t('fuelingPlan.startNow', { defaultValue: 'Now' }),
      },
      {
        key: '15' as const,
        label: t('fuelingPlan.startIn15', { defaultValue: '15 min' }),
      },
      {
        key: '30' as const,
        label: t('fuelingPlan.startIn30', { defaultValue: '30 min' }),
      },
      {
        key: '60' as const,
        label: t('fuelingPlan.startIn60', { defaultValue: '1 hour' }),
      },
    ],
    [t]
  );

  const handleFoodSelected = useCallback(
    (food: FoodItem) => {
      const variant = food.default_variant;
      const carbs = Math.round(variant.carbs);
      if (!(carbs > 0)) {
        Toast.show({
          type: 'error',
          text1: t('fuelingPlan.foodNoCarbs', {
            defaultValue: 'That food has no carbohydrates listed.',
          }),
        });
        return;
      }
      setProductName(food.name);
      setPortionOverride(String(carbs));
      setFuelFood(
        variant.id
          ? {
              foodId: food.id,
              variantId: variant.id,
              servingSize: variant.serving_size,
              servingUnit: variant.serving_unit,
              name: food.name,
              carbs,
            }
          : null
      );
    },
    [t]
  );

  const handleStart = useCallback(async () => {
    if (busy || !plan.needsFuel) return;
    setBusy(true);
    try {
      const permission = await requestNotificationPermission();
      if (permission !== 'granted') {
        Toast.show({
          type: 'error',
          text1: t('fuelingPlan.notPermitted', {
            defaultValue: 'Turn on notifications to get fueling reminders.',
          }),
        });
        return;
      }
      const delayMin = Number(startKey);
      const result = await startFuelingSession({
        startAt: new Date(Date.now() + delayMin * 60_000),
        offsetsMin: plan.reminderOffsetsMin,
        portionGrams: plan.portionGrams,
        productName:
          productName.trim() ||
          t('fuelingPlan.defaultProduct', { defaultValue: 'Energy gel' }),
        // A portion typed over the food's own size no longer matches it.
        food:
          fuelFood && plan.portionGrams === fuelFood.carbs
            ? {
                foodId: fuelFood.foodId,
                variantId: fuelFood.variantId,
                servingSize: fuelFood.servingSize,
                servingUnit: fuelFood.servingUnit,
              }
            : null,
      });
      if (result.status === 'scheduled') {
        Toast.show({
          type: 'success',
          text1: t('fuelingPlan.started', {
            defaultValue: 'Fueling reminders are set.',
          }),
        });
      } else if (result.status === 'nothing_to_schedule') {
        Toast.show({
          type: 'error',
          text1: t('fuelingPlan.nothingToSchedule', {
            defaultValue: 'This plan has no reminders left to schedule.',
          }),
        });
      } else {
        Toast.show({
          type: 'error',
          text1: t('fuelingPlan.notPermitted', {
            defaultValue: 'Turn on notifications to get fueling reminders.',
          }),
        });
      }
      await refreshSession();
    } catch (error) {
      addLog(`Starting fueling reminders failed: ${String(error)}`, 'ERROR');
      Toast.show({
        type: 'error',
        text1: t('fuelingPlan.startFailed', {
          defaultValue: 'Could not set the reminders.',
        }),
      });
    } finally {
      setBusy(false);
    }
  }, [busy, fuelFood, plan, productName, refreshSession, startKey, t]);

  const handleStop = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await cancelFuelingSession();
      await refreshSession();
    } catch (error) {
      addLog(`Stopping fueling reminders failed: ${String(error)}`, 'ERROR');
    } finally {
      setBusy(false);
    }
  }, [busy, refreshSession]);

  const number = (value: number) =>
    formatLocalizedNumber(value, { maximumFractionDigits: 0 });

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
        contentInsetAdjustmentBehavior={
          usesNativeHeader ? 'automatic' : 'never'
        }
      >
        <Text className="text-text-secondary text-sm mb-4">
          {t('fuelingPlan.description', {
            defaultValue:
              'Plan the carbohydrates for a long run or race and get a reminder for each portion.',
          })}
        </Text>

        <View className="flex-row gap-3 mb-4">
          <NumberField
            testID="fueling-hours"
            label={t('fuelingPlan.hours', { defaultValue: 'Hours' })}
            value={hours}
            onChangeText={setHours}
          />
          <NumberField
            testID="fueling-minutes"
            label={t('fuelingPlan.minutes', { defaultValue: 'Minutes' })}
            value={minutes}
            onChangeText={setMinutes}
          />
        </View>

        <Text className="text-text-secondary text-sm mb-1">
          {t('fuelingPlan.effort', {
            defaultValue: 'Effort (heart rate zone)',
          })}
        </Text>
        <View className="mb-4">
          <SegmentedControl
            segments={zoneSegments}
            activeKey={zone}
            onSelect={setZone}
          />
        </View>

        <Text className="text-text-secondary text-sm mb-1">
          {t('fuelingPlan.experience', { defaultValue: 'Gut training' })}
        </Text>
        <View className="mb-4">
          <SegmentedControl
            segments={experienceSegments}
            activeKey={experience}
            onSelect={setExperience}
          />
        </View>

        <View className="flex-row gap-3 mb-4">
          <NumberField
            testID="fueling-carbs-override"
            label={t('fuelingPlan.carbsOverride', {
              defaultValue: 'Your carbs (g/h)',
            })}
            placeholder={t('fuelingPlan.useDefault', {
              defaultValue: 'Default',
            })}
            value={carbsOverride}
            onChangeText={setCarbsOverride}
          />
          <NumberField
            testID="fueling-portion-override"
            label={t('fuelingPlan.portionOverride', {
              defaultValue: 'Portion (g)',
            })}
            placeholder={number(plan.portionGrams)}
            value={portionOverride}
            onChangeText={setPortionOverride}
          />
        </View>

        <Text className="text-text-secondary text-sm mb-1">
          {t('fuelingPlan.product', { defaultValue: 'Fuel product' })}
        </Text>
        <TextInput
          testID="fueling-product"
          accessibilityLabel={t('fuelingPlan.product', {
            defaultValue: 'Fuel product',
          })}
          value={productName}
          onChangeText={(text) => {
            setProductName(text);
            if (fuelFood && text !== fuelFood.name) setFuelFood(null);
          }}
          placeholder={t('fuelingPlan.defaultProduct', {
            defaultValue: 'Energy gel',
          })}
          maxLength={60}
          className="bg-raised rounded-lg px-3 mb-1 text-text-primary"
          style={{ height: 44, paddingVertical: 0, fontSize: 16 }}
        />
        <View className="flex-row items-center gap-3 mb-1">
          <Pressable
            testID="fueling-choose-food"
            accessibilityRole="button"
            onPress={() => foodSheetRef.current?.present()}
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
          >
            <Text className="text-accent-primary text-sm font-semibold">
              {t('fuelingPlan.chooseFoodButton', {
                defaultValue: 'Choose a saved food',
              })}
            </Text>
          </Pressable>
          {fuelFood ? (
            <Pressable
              testID="fueling-clear-food"
              accessibilityRole="button"
              onPress={() => setFuelFood(null)}
              style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
            >
              <Text className="text-text-secondary text-sm">
                {t('fuelingPlan.clearFood', { defaultValue: 'Clear' })}
              </Text>
            </Pressable>
          ) : null}
        </View>
        {fuelFood ? (
          <Text
            testID="fueling-food-linked"
            className="text-text-secondary text-xs mb-1"
          >
            {t('fuelingPlan.foodLinked', {
              defaultValue:
                'Using {{name}}: {{carbs}} g of carbohydrate per serving.',
              name: fuelFood.name,
              carbs: number(fuelFood.carbs),
            })}
          </Text>
        ) : null}
        <Text className="text-text-secondary text-xs mb-4">
          {t('fuelingPlan.productHint', {
            defaultValue:
              'Name of what you carry, or pick a saved food. The Log it button on a reminder adds it to your diary as Snacks.',
          })}
        </Text>

        <View className="bg-surface rounded-xl p-4 mb-4">
          {plan.needsFuel && plan.intervalMin !== null ? (
            <>
              <Text
                testID="fueling-summary"
                className="text-text-primary text-lg font-semibold"
              >
                {t('fuelingPlan.summary', {
                  defaultValue:
                    '{{carbs}} g/h: take {{portion}} g every {{interval}} min',
                  carbs: number(plan.carbsPerHour),
                  portion: number(plan.portionGrams),
                  interval: number(plan.intervalMin),
                })}
              </Text>
              <Text className="text-text-secondary text-sm mt-1">
                {t('fuelingPlan.total', {
                  defaultValue: 'About {{total}} g of carbohydrate in total.',
                  total: number(plan.totalCarbsGrams),
                })}
              </Text>
              {plan.carbsPerHourOverridden && plan.range.max > 0 ? (
                <Text className="text-text-secondary text-sm mt-1">
                  {t('fuelingPlan.defaultRange', {
                    defaultValue:
                      'The usual range for this duration is {{min}} to {{max}} g/h.',
                    min: number(plan.range.min),
                    max: number(plan.range.max),
                  })}
                </Text>
              ) : null}
              {plan.reminderOffsetsMin.length > 0 ? (
                <Text
                  testID="fueling-schedule"
                  className="text-text-secondary text-sm mt-3"
                >
                  {t('fuelingPlan.schedule', {
                    defaultValue: 'Reminders at {{times}} after the start.',
                    times: plan.reminderOffsetsMin.map(formatClock).join(', '),
                  })}
                </Text>
              ) : null}
            </>
          ) : (
            <Text testID="fueling-none" className="text-text-secondary text-sm">
              {t('fuelingPlan.notNeeded', {
                defaultValue:
                  'Runs under an hour usually do not need fueling. Enter your own carbs per hour to plan one anyway.',
              })}
            </Text>
          )}
        </View>

        {session ? (
          <View className="bg-surface rounded-xl p-4 mb-4">
            <Text className="text-text-primary text-base font-semibold">
              {t('fuelingPlan.running', {
                defaultValue: 'Reminders are set',
              })}
            </Text>
            <Text className="text-text-secondary text-sm mt-1">
              {t('fuelingPlan.runningDetail', {
                defaultValue:
                  '{{count}} reminders of {{portion}} g are scheduled.',
                defaultValue_one:
                  '{{count}} reminder of {{portion}} g is scheduled.',
                defaultValue_other:
                  '{{count}} reminders of {{portion}} g are scheduled.',
                count: session.reminderCount,
                portion: number(session.portionGrams),
              })}
            </Text>
            <Pressable
              testID="fueling-stop"
              accessibilityRole="button"
              onPress={handleStop}
              disabled={busy}
              className="mt-3 py-3 rounded-lg items-center border border-border-subtle"
              style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
            >
              <Text className="text-text-primary font-semibold">
                {t('fuelingPlan.stop', { defaultValue: 'Stop reminders' })}
              </Text>
            </Pressable>
          </View>
        ) : null}

        <Text className="text-text-secondary text-sm mb-1">
          {t('fuelingPlan.startsIn', { defaultValue: 'Start reminders' })}
        </Text>
        <View className="mb-4">
          <SegmentedControl
            segments={startSegments}
            activeKey={startKey}
            onSelect={setStartKey}
          />
        </View>

        <Pressable
          testID="fueling-start"
          accessibilityRole="button"
          onPress={handleStart}
          disabled={busy || !plan.needsFuel}
          className="py-3.5 rounded-xl items-center"
          style={({ pressed }) => ({
            backgroundColor: accent,
            opacity: busy || !plan.needsFuel ? 0.4 : pressed ? 0.8 : 1,
          })}
        >
          <Text className="text-white font-semibold text-base">
            {session
              ? t('fuelingPlan.restart', { defaultValue: 'Replace reminders' })
              : t('fuelingPlan.start', { defaultValue: 'Set reminders' })}
          </Text>
        </Pressable>

        <FuelFoodSheet ref={foodSheetRef} onSelect={handleFoodSelected} />

        <Text className="text-text-secondary text-xs mt-4">
          {t('fuelingPlan.disclaimer', {
            defaultValue:
              'General guidance, not medical advice. Practise your plan in training before race day.',
          })}
        </Text>
      </ScrollView>
    </View>
  );
};

export default FuelingPlanScreen;
