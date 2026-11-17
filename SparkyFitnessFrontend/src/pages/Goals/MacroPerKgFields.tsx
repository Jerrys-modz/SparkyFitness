import { useTranslation } from 'react-i18next';
import {
  DEFAULT_MACRO_WEIGHT_BASIS,
  isMacroWeightBasis,
  MACRO_PER_KG_LIMITS,
  MACRO_REFERENCE_WEIGHT_LIMITS,
  type MacroPerKgKey,
  type MacroTargets,
} from '@workspace/shared';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { NumericInput } from '@/components/NumericInput';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePreferences } from '@/contexts/PreferencesContext';
import type {
  MacroPerKgGoal,
  MacroPerKgUpdate,
} from '@/hooks/Goals/useMacroPerKgPreview';

/** Default g/kg when a macro is switched to per kg. */
const DEFAULT_PER_KG: Record<MacroPerKgKey, number> = {
  protein: 1.6,
  carbs: 4,
  fat: 0.8,
};

/** Reference weight used when nothing is logged to prefill it with. */
const FALLBACK_REFERENCE_KG = 70;

const PER_KG_FIELD = {
  protein: 'protein_per_kg',
  carbs: 'carbs_per_kg',
  fat: 'fat_per_kg',
} as const;

/** Shows the note when the per-kg macros' calories differ by more than this. */
const CALORIE_MISMATCH_RATIO = 0.05;

interface MacroPerKgFieldsProps {
  goal: MacroPerKgGoal;
  macroInputType: 'grams' | 'percentages';
  preview: MacroTargets & { latestBasisKg: number | null };
  onChange: (update: Partial<MacroPerKgUpdate>) => void;
  idPrefix: string;
}

export const MacroPerKgFields = ({
  goal,
  macroInputType,
  preview,
  onChange,
  idPrefix,
}: MacroPerKgFieldsProps) => {
  const { t } = useTranslation();
  const {
    weightUnit,
    convertWeight,
    energyUnit,
    convertEnergy,
    getEnergyUnitString,
  } = usePreferences();
  // Stones are typed as pounds, as elsewhere in Goals.
  const inputUnit = weightUnit === 'kg' ? 'kg' : 'lbs';
  const basis = isMacroWeightBasis(goal.macro_per_kg_basis)
    ? goal.macro_per_kg_basis
    : DEFAULT_MACRO_WEIGHT_BASIS;
  const on: Record<MacroPerKgKey, boolean> = {
    protein: goal.protein_per_kg != null,
    carbs: goal.carbs_per_kg != null,
    fat: goal.fat_per_kg != null,
  };
  const anyOn = on.protein || on.carbs || on.fat;
  const fixed = goal.macro_reference_weight_kg != null;
  const resolution = preview.perKg;

  const switchLabel = (macro: MacroPerKgKey) =>
    ({
      protein: t('goals.perKg.proteinSwitch', 'Set protein per kg'),
      carbs: t('goals.perKg.carbsSwitch', 'Set carbs per kg'),
      fat: t('goals.perKg.fatSwitch', 'Set fat per kg'),
    })[macro];
  const inputLabel = (macro: MacroPerKgKey) =>
    ({
      protein: t('goals.perKg.proteinInput', 'Protein (g/kg)'),
      carbs: t('goals.perKg.carbsInput', 'Carbs (g/kg)'),
      fat: t('goals.perKg.fatInput', 'Fat (g/kg)'),
    })[macro];

  const macroRow = (macro: MacroPerKgKey) => {
    const field = PER_KG_FIELD[macro];
    const { min, max } = MACRO_PER_KG_LIMITS[macro];
    return (
      <div key={macro} className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Switch
            id={`${idPrefix}-${macro}-per-kg`}
            checked={on[macro]}
            onCheckedChange={(checked) =>
              onChange({ [field]: checked ? DEFAULT_PER_KG[macro] : null })
            }
          />
          <Label
            htmlFor={`${idPrefix}-${macro}-per-kg`}
            className="text-xs cursor-pointer"
          >
            {switchLabel(macro)}
          </Label>
        </div>
        {on[macro] && (
          <NumericInput
            aria-label={inputLabel(macro)}
            step={0.1}
            decimals={2}
            min={min}
            max={max}
            value={Number(goal[field] ?? DEFAULT_PER_KG[macro])}
            onValueChange={(val) =>
              onChange({
                [field]:
                  val === null || val === undefined
                    ? DEFAULT_PER_KG[macro]
                    : Math.min(max, Math.max(min, val)),
              })
            }
          />
        )}
      </div>
    );
  };

  const referenceLabel =
    basis === 'lean_mass'
      ? t('goals.perKg.referenceLeanMass', 'Reference lean mass ({{unit}})', {
          unit: inputUnit,
        })
      : t('goals.perKg.referenceWeight', 'Reference weight ({{unit}})', {
          unit: inputUnit,
        });
  const shownReference = fixed
    ? Math.round(
        convertWeight(Number(goal.macro_reference_weight_kg), 'kg', inputUnit) *
          10
      ) / 10
    : null;

  const lockedKcal = resolution?.locked_kcal ?? 0;
  const availableKcal = resolution?.available_kcal ?? 0;
  const allLocked = on.protein && on.carbs && on.fat;
  const calorieMismatch =
    resolution !== null &&
    !resolution.missing_weight &&
    availableKcal > 0 &&
    (lockedKcal > availableKcal ||
      (allLocked &&
        Math.abs(lockedKcal - availableKcal) / availableKcal >
          CALORIE_MISMATCH_RATIO));
  const energy = (kcal: number) =>
    Math.round(convertEnergy(kcal, 'kcal', energyUnit));

  const previewKg = Math.round((resolution?.basis_kg ?? 0) * 10) / 10;

  return (
    <div className="space-y-3 mb-6 rounded-md border p-3">
      <div>
        <div className="text-sm font-medium">
          {t('goals.perKg.title', 'Grams per kg of body weight')}
        </div>
        <p className="text-xs text-muted-foreground">
          {t(
            'goals.perKg.descriptionAll',
            'Set protein, carbs or fat in grams per kg. They can follow your latest logged weight, or a reference weight you enter.'
          )}
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {(['protein', 'carbs', 'fat'] as const).map(macroRow)}
      </div>
      {anyOn && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">
              {t('goals.perKg.basisLabel', 'Per kg of')}
            </Label>
            <Select
              value={basis}
              onValueChange={(value) => {
                if (isMacroWeightBasis(value)) {
                  // A fixed number was entered for the old basis; start again
                  // from the latest weight in the new one.
                  onChange(
                    fixed
                      ? {
                          macro_per_kg_basis: value,
                          macro_reference_weight_kg: null,
                        }
                      : { macro_per_kg_basis: value }
                  );
                }
              }}
            >
              <SelectTrigger
                aria-label={t('goals.perKg.basisLabel', 'Per kg of')}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="body_weight">
                  {t('goals.perKg.bodyWeight', 'Body weight')}
                </SelectItem>
                <SelectItem value="lean_mass">
                  {t('goals.perKg.leanMass', 'Lean mass (uses body fat %)')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">
              {t('goals.perKg.referenceLabel', 'Weight to use')}
            </Label>
            <Select
              value={fixed ? 'fixed' : 'logged'}
              onValueChange={(value) =>
                onChange({
                  macro_reference_weight_kg:
                    value === 'fixed'
                      ? Math.round(
                          (preview.latestBasisKg ?? FALLBACK_REFERENCE_KG) * 10
                        ) / 10
                      : null,
                })
              }
            >
              <SelectTrigger
                aria-label={t('goals.perKg.referenceLabel', 'Weight to use')}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="logged">
                  {t('goals.perKg.followLogged', 'Follow my logged weight')}
                </SelectItem>
                <SelectItem value="fixed">
                  {t('goals.perKg.fixedReference', 'Fixed reference weight')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          {fixed && (
            <div className="space-y-1.5">
              <Label className="text-xs">{referenceLabel}</Label>
              <NumericInput
                aria-label={referenceLabel}
                step={0.1}
                decimals={1}
                min={convertWeight(
                  MACRO_REFERENCE_WEIGHT_LIMITS.min,
                  'kg',
                  inputUnit
                )}
                max={convertWeight(
                  MACRO_REFERENCE_WEIGHT_LIMITS.max,
                  'kg',
                  inputUnit
                )}
                value={shownReference}
                onValueChange={(val) => {
                  if (val === null || val === undefined) return;
                  const kg = convertWeight(val, inputUnit, 'kg');
                  onChange({
                    macro_reference_weight_kg: Math.min(
                      MACRO_REFERENCE_WEIGHT_LIMITS.max,
                      Math.max(MACRO_REFERENCE_WEIGHT_LIMITS.min, kg)
                    ),
                  });
                }}
              />
            </div>
          )}
        </div>
      )}
      {resolution && (
        <div className="space-y-1 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
          {resolution.missing_weight ? (
            <p className="text-amber-600 dark:text-amber-400">
              {t(
                'goals.perKg.noWeightAll',
                'No weight logged yet. Log your weight in Check-In or enter a fixed reference weight; until then the grams saved with the goal are used.'
              )}
            </p>
          ) : (
            <p>
              {fixed
                ? t(
                    'goals.perKg.previewFixed',
                    'Grams from your reference weight of {{kg}} kg: protein {{protein}} g, carbs {{carbs}} g, fat {{fat}} g. They change only when you save a new reference weight.',
                    {
                      kg: previewKg,
                      protein: Math.round(preview.protein),
                      carbs: Math.round(preview.carbs),
                      fat: Math.round(preview.fat),
                    }
                  )
                : t(
                    'goals.perKg.previewLogged',
                    "Today's grams from your latest logged weight of {{kg}} kg: protein {{protein}} g, carbs {{carbs}} g, fat {{fat}} g.",
                    {
                      kg: previewKg,
                      protein: Math.round(preview.protein),
                      carbs: Math.round(preview.carbs),
                      fat: Math.round(preview.fat),
                    }
                  )}
            </p>
          )}
          {resolution.lean_mass_fallback && (
            <p>
              {t(
                'goals.perKg.leanMassFallback',
                'No body fat % logged, so body weight is used instead of lean mass.'
              )}
            </p>
          )}
          {calorieMismatch && (
            <p className="text-amber-600 dark:text-amber-400">
              {t(
                'goals.perKg.calorieMismatch',
                'The per-kg macros add up to {{locked}} {{unit}}, but the calorie target leaves {{available}} {{unit}} for macros.',
                {
                  locked: energy(lockedKcal),
                  available: energy(availableKcal),
                  unit: getEnergyUnitString(energyUnit),
                }
              )}
            </p>
          )}
          {!allLocked && (
            <p>
              {macroInputType === 'percentages'
                ? t(
                    'goals.perKg.remainderPercentages',
                    'Per-kg macros are fixed first. The calories left go to the other macros in proportion to their percentages, so the percentages no longer need to add up to 100.'
                  )
                : t(
                    'goals.perKg.remainderGrams',
                    'The other macros keep the grams you enter.'
                  )}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
