import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useAddStarterRoutineMutation,
  useStarterRoutines,
} from '@/hooks/Exercises/useWorkoutPresets';

interface StarterRoutinesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const StarterRoutinesDialog = ({
  open,
  onOpenChange,
}: StarterRoutinesDialogProps) => {
  const { t } = useTranslation();
  const { data: routines = [], isLoading } = useStarterRoutines();
  const {
    mutate: addRoutine,
    isPending,
    variables,
  } = useAddStarterRoutineMutation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t(
              'workoutPresetsManager.starterRoutines.title',
              'Stretch routines'
            )}
          </DialogTitle>
          <DialogDescription>
            {t(
              'workoutPresetsManager.starterRoutines.description',
              'Add a ready-made stretching routine to your presets. You can edit your copy afterwards.'
            )}
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <p className="text-center text-muted-foreground py-6">
            {t('common.loading', 'Loading...')}
          </p>
        ) : (
          <ul className="space-y-3">
            {routines.map((routine) => (
              <li
                key={routine.id}
                className="flex items-center justify-between gap-3 rounded-md border p-3"
              >
                <div className="min-w-0">
                  <p className="font-medium">{routine.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {routine.description}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t(
                      'workoutPresetsManager.starterRoutines.moveCount',
                      '{{count}} moves',
                      { count: routine.move_count }
                    )}
                  </p>
                </div>
                <Button
                  size="sm"
                  disabled={isPending}
                  onClick={() => addRoutine(routine.id)}
                >
                  {isPending && variables === routine.id
                    ? t(
                        'workoutPresetsManager.starterRoutines.adding',
                        'Adding...'
                      )
                    : t('common.add', 'Add')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default StarterRoutinesDialog;
