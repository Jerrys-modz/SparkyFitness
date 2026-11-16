import { useTranslation } from 'react-i18next';
import {
  DEFAULT_MACRO_WEIGHT_BASIS,
  isMacroWeightBasis,
  MACRO_PER_KG_LIMITS,
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
import type {
  MacroPerKgGoal,
  MacroPerKgUpdate,
} from '@/hooks/Goals/useMacroPerKgPreview';

/** Default g/kg when a macro is switched to per kg. */
const DEFAULT_PER_KG = { protein: 1.6, fat: 0.8 } as const;

interface MacroPerKgFieldsProps {
  goal: MacroPerKgGoal;
  macroInputType: 'grams' | 'percentages';
  preview: MacroTargets;
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
  const basis = isMacroWeightBasis(goal.macro_per_kg_basis)
    ? goal.macro_per_kg_basis
    : DEFAULT_MACRO_WEIGHT_BASIS;
  const proteinOn = goal.protein_per_kg != null;
  const fatOn = goal.fat_per_kg != null;
  const resolution = preview.perKg;

  const macroRow = (macro: 'protein' | 'fat', on: boolean) => {
    const field = macro === 'protein' ? 'protein_per_kg' : 'fat_per_kg';
    const { min, max } = MACRO_PER_KG_LIMITS[macro];
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Switch
            id={`${idPrefix}-${macro}-per-kg`}
            checked={on}
            onCheckedChange={(checked) =>
              onChange({ [field]: checked ? DEFAULT_PER_KG[macro] : null })
            }
          />
          <Label
            htmlFor={`${idPrefix}-${macro}-per-kg`}
            className="text-xs cursor-pointer"
          >
            {macro === 'protein'
              ? t('goals.perKg.proteinSwitch', 'Set protein per kg')
              : t('goals.perKg.fatSwitch', 'Set fat per kg')}
          </Label>
        </div>
        {on && (
          <NumericInput
            aria-label={
              macro === 'protein'
                ? t('goals.perKg.proteinInput', 'Protein (g/kg)')
                : t('goals.perKg.fatInput', 'Fat (g/kg)')
            }
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

  return (
    <div className="space-y-3 mb-6 rounded-md border p-3">
      <div>
        <div className="text-sm font-medium">
          {t('goals.perKg.title', 'Grams per kg of body weight')}
        </div>
        <p className="text-xs text-muted-foreground">
          {t(
            'goals.perKg.description',
            'Protein and fat can follow your weight: the grams are worked out each day from the latest weight logged on or before it.'
          )}
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {macroRow('protein', proteinOn)}
        {macroRow('fat', fatOn)}
        {(proteinOn || fatOn) && (
          <div className="space-y-1.5">
            <Label className="text-xs">
              {t('goals.perKg.basisLabel', 'Per kg of')}
            </Label>
            <Select
              value={basis}
              onValueChange={(value) => {
                if (isMacroWeightBasis(value)) {
                  onChange({ macro_per_kg_basis: value });
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
        )}
      </div>
      {resolution && (
        <div className="space-y-1 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
          {resolution.missing_weight ? (
            <p className="text-amber-600 dark:text-amber-400">
              {t(
                'goals.perKg.noWeight',
                'No weight logged yet. Log your weight in Check-In to use this goal; until then the grams saved with it are used ({{protein}} g protein).',
                { protein: Math.round(preview.protein) }
              )}
            </p>
          ) : (
            <p>
              {t(
                'goals.perKg.preview',
                "Today's grams from {{kg}} kg: protein {{protein}} g, carbs {{carbs}} g, fat {{fat}} g.",
                {
                  kg: Math.round((resolution.basis_kg ?? 0) * 10) / 10,
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
        </div>
      )}
    </div>
  );
};
