import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  DEFAULT_MACRO_WEIGHT_BASIS,
  MACRO_PER_KG_LIMITS,
  type MacroTargets,
  type MacroWeightBasis,
} from '@workspace/shared';
import FormInput from './FormInput';
import SegmentedControl, { type Segment } from './SegmentedControl';
import Switch from './ui/Switch';

/** The per-kg setting of a goal or preset. */
export interface MacroPerKgValue {
  protein_per_kg: number | null;
  fat_per_kg: number | null;
  macro_per_kg_basis: MacroWeightBasis;
}

/** Text drafts for the g/kg inputs, so a half-typed number stays put. */
export interface MacroPerKgDrafts {
  protein: string;
  fat: string;
}

/** Default g/kg when a macro is switched to per kg. */
export const DEFAULT_PER_KG = { protein: 1.6, fat: 0.8 } as const;

interface MacroPerKgEditorProps {
  value: MacroPerKgValue;
  drafts: MacroPerKgDrafts;
  onChange: (value: MacroPerKgValue, drafts: MacroPerKgDrafts) => void;
  preview: MacroTargets;
  /** True when the goal splits macros by percentage. */
  percentMode: boolean;
}

const MacroPerKgEditor: React.FC<MacroPerKgEditorProps> = ({
  value,
  drafts,
  onChange,
  preview,
  percentMode,
}) => {
  const { t } = useTranslation();
  const resolution = preview.perKg;

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

  const row = (macro: 'protein' | 'fat') => {
    const field = macro === 'protein' ? 'protein_per_kg' : 'fat_per_kg';
    const on = value[field] !== null;
    const { min, max } = MACRO_PER_KG_LIMITS[macro];
    const switchLabel =
      macro === 'protein'
        ? t('goals.perKg.proteinSwitch', {
            defaultValue: 'Set protein per kg',
          })
        : t('goals.perKg.fatSwitch', { defaultValue: 'Set fat per kg' });
    const inputLabel =
      macro === 'protein'
        ? t('goals.perKg.proteinInput', { defaultValue: 'Protein (g/kg)' })
        : t('goals.perKg.fatInput', { defaultValue: 'Fat (g/kg)' });
    return (
      <View className="gap-1">
        <View className="flex-row items-center justify-between">
          <Text className="text-sm text-text-primary">{switchLabel}</Text>
          <Switch
            value={on}
            accessibilityLabel={switchLabel}
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
            accessibilityLabel={inputLabel}
            placeholder={inputLabel}
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

  return (
    <View className="gap-2 rounded-xl border border-border-subtle p-3">
      <Text className="text-sm font-medium text-text-primary">
        {t('goals.perKg.title', {
          defaultValue: 'Grams per kg of body weight',
        })}
      </Text>
      <Text className="text-xs text-text-secondary">
        {t('goals.perKg.description', {
          defaultValue:
            'Protein and fat can follow your weight: the grams are worked out each day from the latest weight logged on or before it.',
        })}
      </Text>
      {row('protein')}
      {row('fat')}
      {resolution && (
        <>
          <SegmentedControl
            segments={basisSegments}
            activeKey={value.macro_per_kg_basis ?? DEFAULT_MACRO_WEIGHT_BASIS}
            onSelect={(basis) =>
              onChange({ ...value, macro_per_kg_basis: basis }, drafts)
            }
          />
          {resolution.missing_weight ? (
            <Text
              className="text-xs text-text-warning"
              testID="goal-per-kg-no-weight"
            >
              {t('goals.perKg.noWeight', {
                defaultValue:
                  'No weight logged yet. Log your weight to use this goal; until then the grams saved with it are used ({{protein}} g protein).',
                protein: Math.round(preview.protein),
              })}
            </Text>
          ) : (
            <Text
              className="text-xs text-text-secondary"
              testID="goal-per-kg-preview"
            >
              {t('goals.perKg.preview', {
                defaultValue:
                  "Today's grams from {{kg}} kg: protein {{protein}} g, carbs {{carbs}} g, fat {{fat}} g.",
                kg: Math.round((resolution.basis_kg ?? 0) * 10) / 10,
                protein: Math.round(preview.protein),
                carbs: Math.round(preview.carbs),
                fat: Math.round(preview.fat),
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
        </>
      )}
    </View>
  );
};

export default MacroPerKgEditor;
