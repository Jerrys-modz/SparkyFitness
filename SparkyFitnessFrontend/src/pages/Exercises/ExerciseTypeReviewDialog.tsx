import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { isExerciseModality } from '@workspace/shared';
import type { ExerciseModality } from '@workspace/shared';
import { EXERCISE_MODALITY_OPTIONS } from '@/constants/exercises';
import {
  useApplyExerciseTypeSuggestions,
  useExerciseTypeSuggestions,
} from '@/hooks/Exercises/useExerciseTypeReview';

interface ExerciseTypeReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * One-off pass over the user's own exercises: the tracking type is re-detected
 * from name, category and equipment, and anything that would change is listed
 * for the user to accept or leave alone.
 */
const ExerciseTypeReviewDialog = ({
  open,
  onOpenChange,
}: ExerciseTypeReviewDialogProps) => {
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch } =
    useExerciseTypeSuggestions(open);
  const apply = useApplyExerciseTypeSuggestions();
  // Everything starts selected; the user opts out of the ones to leave alone.
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());

  // Types the user picked instead of the suggested one, by exercise id.
  const [overrides, setOverrides] = useState<
    Readonly<Record<string, ExerciseModality>>
  >({});

  const chosen = useMemo(
    () => (data ?? []).filter((item) => !skipped.has(item.id)),
    [data, skipped]
  );

  const modalityLabel = (value: string) => {
    const option = EXERCISE_MODALITY_OPTIONS.find((o) => o.value === value);
    return option ? t(option.labelKey, option.defaultLabel) : value;
  };

  const toggle = (id: string) => {
    setSkipped((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleApply = () => {
    apply.mutate(
      chosen.map((item) => ({
        id: item.id,
        modality: overrides[item.id] ?? item.suggestedModality,
      })),
      {
        onSuccess: () => {
          setSkipped(new Set());
          setOverrides({});
          onOpenChange(false);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {t('exercise.typeReview.title', 'Review exercise types')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'exercise.typeReview.description',
              'These exercises would be tracked differently based on their name, category and equipment. Uncheck any you want to leave alone, or pick a different type.'
            )}
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <p className="text-sm text-muted-foreground">
            {t('common.loading', 'Loading...')}
          </p>
        )}
        {isError && (
          <div className="space-y-2">
            <p className="text-sm text-destructive">
              {t('exercise.typeReview.error', 'Could not load suggestions')}
            </p>
            <Button variant="outline" onClick={() => void refetch()}>
              {t('common.tryAgain', 'Try again')}
            </Button>
          </div>
        )}
        {data && data.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {t(
              'exercise.typeReview.empty',
              'All your exercises already match. Nothing to change.'
            )}
          </p>
        )}
        {data && data.length > 0 && (
          <ul className="max-h-[50vh] divide-y overflow-y-auto rounded-md border">
            {data.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-3 py-2">
                <Checkbox
                  aria-label={item.name}
                  checked={!skipped.has(item.id)}
                  onCheckedChange={() => toggle(item.id)}
                />
                <span className="flex-1">
                  <span className="block text-sm font-medium">{item.name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t('exercise.typeReview.currently', 'Now')}:{' '}
                    {modalityLabel(item.currentModality)}
                  </span>
                </span>
                <select
                  aria-label={t(
                    'exercise.typeReview.changeTo',
                    'Change {{name}} to',
                    { name: item.name }
                  )}
                  className="h-8 max-w-[11rem] rounded-md border border-input bg-background px-2 text-xs text-foreground"
                  value={overrides[item.id] ?? item.suggestedModality}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (!isExerciseModality(value)) return;
                    setOverrides((prev) => ({ ...prev, [item.id]: value }));
                    // Picking a type means the user wants this change.
                    setSkipped((prev) => {
                      if (!prev.has(item.id)) return prev;
                      const next = new Set(prev);
                      next.delete(item.id);
                      return next;
                    });
                  }}
                >
                  {EXERCISE_MODALITY_OPTIONS.map(
                    ({ value, labelKey, defaultLabel }) => (
                      <option key={value} value={value}>
                        {t(labelKey, defaultLabel)}
                        {value === item.suggestedModality
                          ? ` (${t('exercise.typeReview.suggested', 'suggested')})`
                          : ''}
                      </option>
                    )
                  )}
                </select>
              </li>
            ))}
          </ul>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button
            disabled={chosen.length === 0 || apply.isPending}
            onClick={handleApply}
          >
            {t('exercise.typeReview.apply', {
              count: chosen.length,
              defaultValue: 'Apply {{count}} changes',
              defaultValue_one: 'Apply {{count}} change',
            })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ExerciseTypeReviewDialog;
