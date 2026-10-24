import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import {
  calculatePlateLoad,
  plateCalcInputFor,
  suggestBar,
  type PlateBar,
  type PlateLoad,
  type PlateUnit,
} from '@workspace/shared';
import Button from './ui/Button';
import { usePlateInventory } from '../hooks/usePlateInventory';
import { barLabel, formatPlateWeight } from '../utils/plateFormat';

interface PlateCalculatorSheetProps {
  visible: boolean;
  onClose: () => void;
  /** The set's weight in the person's weight unit, as shown; null if blank. */
  targetWeight: number | null;
  weightUnit: PlateUnit;
  equipment?: readonly string[] | null;
}

const LoadView: React.FC<{ load: PlateLoad; unit: PlateUnit }> = ({
  load,
  unit,
}) => {
  const { t } = useTranslation();
  return (
    <View className="mt-1">
      {load.plates.length === 0 ? (
        <Text className="text-sm text-text-muted">
          {t('plates.noPlates', { defaultValue: 'No plates, the bar alone.' })}
        </Text>
      ) : (
        <View
          className="flex-row flex-wrap gap-2"
          accessibilityLabel={t('plates.perSide', {
            defaultValue: 'Plates on each side',
          })}
        >
          {load.plates.map((plate) => (
            <View
              key={plate.weight}
              className="rounded-lg bg-raised px-3 py-1.5"
            >
              <Text className="text-base font-semibold text-text-primary">
                {plate.count} × {formatPlateWeight(plate.weight)} {unit}
              </Text>
            </View>
          ))}
        </View>
      )}
      <Text className="text-xs text-text-muted mt-1">
        {t('plates.loadSummary', {
          defaultValue:
            '{{perSide}} {{unit}} per side · {{total}} {{unit}} total',
          perSide: formatPlateWeight(load.perSideWeight),
          total: formatPlateWeight(load.totalWeight),
          unit,
        })}
      </Text>
    </View>
  );
};

/** Which plates go on each side of the bar for a set's weight. */
export default function PlateCalculatorSheet({
  visible,
  onClose,
  targetWeight,
  weightUnit,
  equipment,
}: PlateCalculatorSheetProps) {
  const { t } = useTranslation();
  const { inventory } = usePlateInventory(weightUnit);
  const [chosenBarId, setChosenBarId] = useState<string | null>(null);
  const bar: PlateBar | null =
    inventory.bars.find((b) => b.id === chosenBarId) ??
    suggestBar(equipment, inventory.bars);

  const result = useMemo(() => {
    if (!bar || targetWeight == null) return null;
    return calculatePlateLoad(
      plateCalcInputFor(inventory, bar, targetWeight, weightUnit)
    );
  }, [inventory, bar, targetWeight, weightUnit]);

  const unit = inventory.unit;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        className="flex-1 justify-center px-6"
        style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        onPress={onClose}
        accessibilityLabel={t('plates.dismiss', {
          defaultValue: 'Close plate calculator',
        })}
      >
        <Pressable
          className="bg-surface rounded-2xl p-5"
          style={{ maxHeight: '85%' }}
          onPress={() => {}}
          accessible={false}
        >
          <Text className="text-lg font-semibold text-text-primary">
            {t('plates.calculatorTitle', { defaultValue: 'Plate calculator' })}
          </Text>
          <Text className="text-sm text-text-muted mb-3">
            {targetWeight != null
              ? t('plates.target', {
                  defaultValue: 'Target {{weight}} {{unit}}',
                  weight: formatPlateWeight(targetWeight),
                  unit: weightUnit,
                })
              : t('plates.enterWeight', {
                  defaultValue: 'Enter a weight for the set first.',
                })}
          </Text>

          <ScrollView>
            {bar && inventory.bars.length > 1 && (
              <View className="mb-3">
                <Text className="text-sm font-semibold text-text-primary mb-1">
                  {t('plates.bar', { defaultValue: 'Bar' })}
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {inventory.bars.map((b) => (
                    <Pressable
                      key={b.id}
                      onPress={() => setChosenBarId(b.id)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: b.id === bar.id }}
                      className={`rounded-lg px-3 py-1.5 ${
                        b.id === bar.id ? 'bg-accent-primary' : 'bg-raised'
                      }`}
                    >
                      <Text
                        className={`text-sm ${
                          b.id === bar.id
                            ? 'text-white font-semibold'
                            : 'text-text-primary'
                        }`}
                      >
                        {barLabel(t, b)} · {formatPlateWeight(b.weight)} {unit}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {result?.status === 'too_large' && (
              <Text className="text-sm text-red-500">
                {t('plates.tooLarge', {
                  defaultValue:
                    'This inventory is too large to search. Remove some plates or pairs.',
                })}
              </Text>
            )}

            {result?.status === 'exact' && result.load && (
              <View>
                <Text className="text-sm text-text-primary">
                  {t('plates.barWeight', {
                    defaultValue: 'Bar {{weight}} {{unit}}',
                    weight: formatPlateWeight(result.barWeight),
                    unit,
                  })}
                  {result.collarsWeight > 0
                    ? ` · ${t('plates.collarsWeight', {
                        defaultValue: 'collars {{weight}} {{unit}}',
                        weight: formatPlateWeight(result.collarsWeight),
                        unit,
                      })}`
                    : ''}
                </Text>
                <LoadView load={result.load} unit={unit} />
              </View>
            )}

            {result?.status === 'inexact' && (
              <View>
                <Text className="text-sm font-semibold text-text-primary mb-2">
                  {t('plates.cannotLoad', {
                    defaultValue:
                      'Your plates cannot make exactly {{weight}} {{unit}}.',
                    weight: formatPlateWeight(result.target),
                    unit,
                  })}
                </Text>
                {result.below ? (
                  <View className="mb-3">
                    <Text className="text-sm font-semibold text-text-primary">
                      {t('plates.nearestBelow', {
                        defaultValue: 'Nearest below: {{weight}} {{unit}}',
                        weight: formatPlateWeight(result.below.totalWeight),
                        unit,
                      })}
                    </Text>
                    <Text className="text-xs text-text-muted">
                      {t('plates.shortBy', {
                        defaultValue: '{{diff}} {{unit}} short of the target',
                        diff: formatPlateWeight(result.shortBy ?? 0),
                        unit,
                      })}
                    </Text>
                    <LoadView load={result.below} unit={unit} />
                  </View>
                ) : (
                  <Text className="text-sm text-text-muted mb-3">
                    {t('plates.nothingBelow', {
                      defaultValue: 'The target is lighter than the bar.',
                    })}
                  </Text>
                )}
                {result.above ? (
                  <View>
                    <Text className="text-sm font-semibold text-text-primary">
                      {t('plates.nearestAbove', {
                        defaultValue: 'Nearest above: {{weight}} {{unit}}',
                        weight: formatPlateWeight(result.above.totalWeight),
                        unit,
                      })}
                    </Text>
                    <Text className="text-xs text-text-muted">
                      {t('plates.overBy', {
                        defaultValue: '{{diff}} {{unit}} over the target',
                        diff: formatPlateWeight(result.overBy ?? 0),
                        unit,
                      })}
                    </Text>
                    <LoadView load={result.above} unit={unit} />
                  </View>
                ) : (
                  <Text className="text-sm text-text-muted">
                    {t('plates.nothingAbove', {
                      defaultValue:
                        'The target is heavier than your plates can load.',
                    })}
                  </Text>
                )}
              </View>
            )}
          </ScrollView>

          <View className="flex-row justify-end mt-4">
            <Button variant="ghost" onPress={onClose}>
              {t('common.close', { defaultValue: 'Close' })}
            </Button>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
