import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_MACRO_WEIGHT_BASIS,
  MACRO_PER_KG_LIMITS,
  MACRO_REFERENCE_WEIGHT_LIMITS,
  type MacroPerKgKey,
  type MacroTargets,
  type MacroWeightBasis,
} from '@workspace/shared';
import FormInput from './FormInput';
import SegmentedControl, { type Segment } from './SegmentedControl';
import Switch from './ui/Switch';
import { useEnergyUnit } from '../hooks/useEnergyUnit';
import { energyUnitLabel, roundedEnergy } from '../utils/energyUnit';
import { weightFromKg, weightToKg } from '../utils/unitConversions';

/** The per-kg setting of a goal or preset. */
export interface MacroPerKgValue {
  protein_per_kg: number | null;
  carbs_per_kg: number | null;
  fat_per_kg: number | null;
  macro_per_kg_basis: MacroWeightBasis;
  /** Fixed reference weight in kg; null follows the latest logged weight. */
  macro_reference_weight_kg: number | null;
}

/** Text drafts for the inputs, so a half-typed number stays put. */
export interface MacroPerKgDrafts {
  protein: string;
  carbs: string;
  fat: string;
  /** The reference weight in the display unit. */
  reference: string;
}

/** Default g/kg when a macro is switched to per kg. */
export const DEFAULT_PER_KG: Record<MacroPerKgKey, number> = {
  protein: 1.6,
  carbs: 4,
  fat: 0.8,
};

/** Reference weight used when nothing is logged to prefill it with. */
const FALLBACK_REFERENCE_KG = 70;

/** Shows the note when the per-kg macros' calories differ by more than this. */
const CALORIE_MISMATCH_RATIO = 0.05;

const PER_KG_FIELD = {
  protein: 'protein_per_kg',
  carbs: 'carbs_per_kg',
  fat: 'fat_per_kg',
} as const;

const round1 = (value: number) => Math.round(value * 10) / 10;

interface MacroPerKgEditorProps {
  value: MacroPerKgValue;
  drafts: MacroPerKgDrafts;
  onChange: (value: MacroPerKgValue, drafts: MacroPerKgDrafts) => void;
  preview: MacroTargets;
  /** The latest logged weight in the chosen basis, to prefill a fixed one. */
  latestBasisKg: number | null;
  /** The unit the reference weight is shown and typed in. */
  weightUnit: 'kg' | 'lbs';
  /** True when the goal splits macros by percentage. */
  percentMode: boolean;
}

const MacroPerKgEditor: React.FC<MacroPerKgEditorProps> = ({
  value,
  drafts,
  onChange,
  preview,
  latestBasisKg,
  weightUnit,
  percentMode,
}) => {
  const { t } = useTranslation();
  const energyUnit = useEnergyUnit();
  const resolution = preview.perKg;
  const fixed = value.macro_reference_weight_kg !== null;
  const anyOn =
    value.protein_per_kg !== null ||
    value.carbs_per_kg !== null ||
    value.fat_per_kg !== null;
  const allOn =
    value.protein_per_kg !== null &&
    value.carbs_per_kg !== null &&
    value.fat_per_kg !== null;

  const basisSegments: Segment<MacroWeightBasis>[] = [
    {
      key: 'body_weight',
      label: t('goals.perKg.bodyWeight', { defaultValue: 'Body weight' }),
    },
    {
      key: 'lean_mass',
      label: t('goals.perKg.leanMass', { defaultValue: 'Lean mass' }),
    },
  ];
  const referenceSegments: Segment<'logged' | 'fixed'>[] = [
    {
      key: 'logged',
      label: t('goals.perKg.followLogged', {
        defaultValue: 'Follow logged weight',
      }),
    },
    {
      key: 'fixed',
      label: t('goals.perKg.fixedReference', {
        defaultValue: 'Fixed weight',
      }),
    },
  ];

  const labels: Record<MacroPerKgKey, { toggle: string; input: string }> = {
    protein: {
      toggle: t('goals.perKg.proteinSwitch', {
        defaultValue: 'Set protein per kg',
      }),
      input: t('goals.perKg.proteinInput', { defaultValue: 'Protein (g/kg)' }),
    },
    carbs: {
      toggle: t('goals.perKg.carbsSwitch', {
        defaultValue: 'Set carbs per kg',
      }),
      input: t('goals.perKg.carbsInput', { defaultValue: 'Carbs (g/kg)' }),
    },
    fat: {
      toggle: t('goals.perKg.fatSwitch', { defaultValue: 'Set fat per kg' }),
      input: t('goals.perKg.fatInput', { defaultValue: 'Fat (g/kg)' }),
    },
  };

  const row = (macro: MacroPerKgKey) => {
    const field = PER_KG_FIELD[macro];
    const on = value[field] !== null;
    const { min, max } = MACRO_PER_KG_LIMITS[macro];
    return (
      <View key={macro} className="gap-1">
        <View className="flex-row items-center justify-between">
          <Text className="text-sm text-text-primary">
            {labels[macro].toggle}
          </Text>
          <Switch
            value={on}
            accessibilityLabel={labels[macro].toggle}
            testID={`goal-per-kg-switch-${macro}`}
            onValueChange={(checked) =>
              onChange(
                {
                  ...value,
                  [field]: checked ? DEFAULT_PER_KG[macro] : null,
                },
                {
                  ...drafts,
                  [macro]: checked ? String(DEFAULT_PER_KG[macro]) : '',
                }
              )
            }
          />
        </View>
        {on && (
          <FormInput
            value={drafts[macro]}
            keyboardType="decimal-pad"
            accessibilityLabel={labels[macro].input}
            placeholder={labels[macro].input}
            testID={`goal-per-kg-input-${macro}`}
            onChangeText={(text) => {
              const num = Number(text.replace(',', '.'));
              const valid = Number.isFinite(num) && num >= min && num <= max;
              onChange(
                // An out-of-range draft keeps the last valid value.
                valid ? { ...value, [field]: num } : value,
                { ...drafts, [macro]: text }
              );
            }}
          />
        )}
      </View>
    );
  };

  const referenceLabel =
    value.macro_per_kg_basis === 'lean_mass'
      ? t('goals.perKg.referenceLeanMass', {
          defaultValue: 'Reference lean mass ({{unit}})',
          unit: weightUnit,
        })
      : t('goals.perKg.referenceWeight', {
          defaultValue: 'Reference weight ({{unit}})',
          unit: weightUnit,
        });

  const setReferenceMode = (mode: 'logged' | 'fixed') => {
    if (mode === 'logged') {
      onChange(
        { ...value, macro_reference_weight_kg: null },
        { ...drafts, reference: '' }
      );
      return;
    }
    const kg = round1(latestBasisKg ?? FALLBACK_REFERENCE_KG);
    onChange(
      { ...value, macro_reference_weight_kg: kg },
      { ...drafts, reference: String(round1(weightFromKg(kg, weightUnit))) }
    );
  };

  const lockedKcal = resolution?.locked_kcal ?? 0;
  const availableKcal = resolution?.available_kcal ?? 0;
  const calorieMismatch =
    resolution !== null &&
    !resolution.missing_weight &&
    availableKcal > 0 &&
    (lockedKcal > availableKcal ||
      (allOn &&
        Math.abs(lockedKcal - availableKcal) / availableKcal >
          CALORIE_MISMATCH_RATIO));

  const grams = {
    kg: round1(resolution?.basis_kg ?? 0),
    protein: Math.round(preview.protein),
    carbs: Math.round(preview.carbs),
    fat: Math.round(preview.fat),
  };

  return (
    <View className="gap-2 rounded-xl border border-border-subtle p-3">
      <Text className="text-sm font-medium text-text-primary">
        {t('goals.perKg.title', {
          defaultValue: 'Grams per kg of body weight',
        })}
      </Text>
      <Text className="text-xs text-text-secondary">
        {t('goals.perKg.descriptionAll', {
          defaultValue:
            'Set protein, carbs or fat in grams per kg. They can follow your latest logged weight, or a reference weight you enter.',
        })}
      </Text>
      {(['protein', 'carbs', 'fat'] as const).map(row)}
      {anyOn && (
        <>
          <SegmentedControl
            segments={basisSegments}
            activeKey={value.macro_per_kg_basis ?? DEFAULT_MACRO_WEIGHT_BASIS}
            onSelect={(basis) =>
              // A fixed number was entered for the old basis; start again from
              // the latest weight in the new one.
              onChange(
                fixed
                  ? {
                      ...value,
                      macro_per_kg_basis: basis,
                      macro_reference_weight_kg: null,
                    }
                  : { ...value, macro_per_kg_basis: basis },
                fixed ? { ...drafts, reference: '' } : drafts
              )
            }
          />
          <SegmentedControl
            segments={referenceSegments}
            activeKey={fixed ? 'fixed' : 'logged'}
            onSelect={setReferenceMode}
          />
          {fixed && (
            <FormInput
              value={drafts.reference}
              keyboardType="decimal-pad"
              accessibilityLabel={referenceLabel}
              placeholder={referenceLabel}
              testID="goal-per-kg-reference"
              onChangeText={(text) => {
                const shown = Number(text.replace(',', '.'));
                const kg = weightToKg(shown, weightUnit);
                const { min, max } = MACRO_REFERENCE_WEIGHT_LIMITS;
                const valid = Number.isFinite(kg) && kg >= min && kg <= max;
                onChange(
                  valid ? { ...value, macro_reference_weight_kg: kg } : value,
                  { ...drafts, reference: text }
                );
              }}
            />
          )}
        </>
      )}
      {resolution && (
        <>
          {resolution.missing_weight ? (
            <Text
              className="text-xs text-text-warning"
              testID="goal-per-kg-no-weight"
            >
              {t('goals.perKg.noWeightAll', {
                defaultValue:
                  'No weight logged yet. Log your weight or enter a fixed reference weight; until then the grams saved with the goal are used.',
              })}
            </Text>
          ) : (
            <Text
              className="text-xs text-text-secondary"
              testID="goal-per-kg-preview"
            >
              {fixed
                ? t('goals.perKg.previewFixed', {
                    defaultValue:
                      'Grams from your reference weight of {{kg}} kg: protein {{protein}} g, carbs {{carbs}} g, fat {{fat}} g. They change only when you save a new reference weight.',
                    ...grams,
                  })
                : t('goals.perKg.previewLogged', {
                    defaultValue:
                      "Today's grams from your latest logged weight of {{kg}} kg: protein {{protein}} g, carbs {{carbs}} g, fat {{fat}} g.",
                    ...grams,
                  })}
            </Text>
          )}
          {resolution.lean_mass_fallback && (
            <Text className="text-xs text-text-secondary">
              {t('goals.perKg.leanMassFallback', {
                defaultValue:
                  'No body fat % logged, so body weight is used instead of lean mass.',
              })}
            </Text>
          )}
          {calorieMismatch && (
            <Text
              className="text-xs text-text-warning"
              testID="goal-per-kg-calorie-mismatch"
            >
              {t('goals.perKg.calorieMismatch', {
                defaultValue:
                  'The per-kg macros add up to {{locked}} {{unit}}, but the calorie target leaves {{available}} {{unit}} for macros.',
                locked: roundedEnergy(lockedKcal, energyUnit),
                available: roundedEnergy(availableKcal, energyUnit),
                unit: energyUnitLabel(energyUnit, t),
              })}
            </Text>
          )}
          {!allOn && (
            <Text className="text-xs text-text-secondary">
              {percentMode
                ? t('goals.perKg.remainderPercentages', {
                    defaultValue:
                      'Per-kg macros are fixed first. The calories left go to the other macros in proportion to their percentages.',
                  })
                : t('goals.perKg.remainderGrams', {
                    defaultValue: 'The other macros keep the grams you enter.',
                  })}
            </Text>
          )}
        </>
      )}
    </View>
  );
};

export default MacroPerKgEditor;
