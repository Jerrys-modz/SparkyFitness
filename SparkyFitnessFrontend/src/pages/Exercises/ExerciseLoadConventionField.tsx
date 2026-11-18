// pages/Exercises/ExerciseLoadConventionField.tsx
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EXERCISE_LOAD_CONVENTION_OPTIONS } from '@/constants/exercises';
import {
  isExerciseLoadConvention,
  type ExerciseLoadConvention,
  type ExerciseModality,
} from '@workspace/shared';

interface ExerciseLoadConventionFieldProps {
  id: string;
  modality: ExerciseModality;
  value: ExerciseLoadConvention;
  onChange: (value: ExerciseLoadConvention) => void;
}

/**
 * "Volume counting" row of the exercise editors (#3157): whether the logged
 * weight is the whole load, one of two dumbbells, or the reps are per side.
 * Only exercises that log a weight against reps have volume to count, and a
 * bodyweight exercise has no pair of dumbbells, so it is offered no per-hand
 * option.
 */
export default function ExerciseLoadConventionField({
  id,
  modality,
  value,
  onChange,
}: ExerciseLoadConventionFieldProps) {
  const { t } = useTranslation();
  if (modality !== 'weight_reps' && modality !== 'bodyweight_reps') {
    return null;
  }
  const options = EXERCISE_LOAD_CONVENTION_OPTIONS.filter(
    ({ value: option }) => modality === 'weight_reps' || option !== 'per_hand'
  );
  const current =
    options.find((option) => option.value === value) ??
    EXERCISE_LOAD_CONVENTION_OPTIONS[0];
  return (
    <div className="grid grid-cols-4 items-center gap-4">
      <Label htmlFor={id} className="text-right">
        {t('exercise.addExerciseDialog.loadConventionLabel', 'Volume counting')}
      </Label>
      <div className="col-span-3 space-y-1">
        <Select
          value={current.value}
          onValueChange={(v) => {
            if (isExerciseLoadConvention(v)) onChange(v);
          }}
        >
          <SelectTrigger id={id}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map(({ value: option, labelKey, defaultLabel }) => (
              <SelectItem key={option} value={option}>
                {t(labelKey, defaultLabel)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {t(current.hintKey, current.defaultHint)}
        </p>
      </div>
    </div>
  );
}
