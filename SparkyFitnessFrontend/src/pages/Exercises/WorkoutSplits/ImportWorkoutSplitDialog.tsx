import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { WorkoutSplit } from '@workspace/shared';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { sessionName, splitName, venueLabel } from '@/utils/workoutSplits';

interface ImportWorkoutSplitDialogProps {
  /** The split being added; the dialog is closed when null. */
  split: WorkoutSplit | null;
  busy: boolean;
  onCancel: () => void;
  onImport: (
    split: WorkoutSplit,
    planName: string,
    sessionNames: Record<string, string>,
    activate: boolean
  ) => void;
}

/** Asks for the plan's name and the medical disclaimer before adding a split. */
const ImportWorkoutSplitDialog = ({
  split,
  busy,
  onCancel,
  onImport,
}: ImportWorkoutSplitDialogProps) => (
  <Dialog open={split !== null} onOpenChange={(open) => !open && onCancel()}>
    <DialogContent>
      {split ? (
        // Keyed so the form starts fresh (name, switch, tick) for each split.
        <ImportForm
          key={split.id}
          split={split}
          busy={busy}
          onCancel={onCancel}
          onImport={onImport}
        />
      ) : null}
    </DialogContent>
  </Dialog>
);

interface ImportFormProps extends Omit<ImportWorkoutSplitDialogProps, 'split'> {
  split: WorkoutSplit;
}

const ImportForm = ({ split, busy, onCancel, onImport }: ImportFormProps) => {
  const { t } = useTranslation();
  const defaultName = splitName(t, split.id);
  // The same program comes in a home, garage and gym version, so the plan
  // name says which one.
  const [planName, setPlanName] = useState(
    `${defaultName} (${venueLabel(t, split.venue)})`
  );
  const [activate, setActivate] = useState(true);
  const [accepted, setAccepted] = useState(false);
  const trimmedName = planName.trim();

  const submit = () => {
    const sessionNames = Object.fromEntries(
      split.sessions.map((session) => [session.id, sessionName(t, session.id)])
    );
    onImport(split, trimmedName, sessionNames, activate);
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {t('workoutSplits.import.title', 'Add {{name}}', {
            name: defaultName,
          })}
        </DialogTitle>
        <DialogDescription>
          {t(
            'workoutSplits.import.message',
            'This adds its exercises to your library, a preset for each session and a plan that runs them in order. You set your starting weights as you log your first workout.'
          )}
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="workout-split-plan-name">
            {t('workoutSplits.import.planName', 'Plan name')}
          </Label>
          <Input
            id="workout-split-plan-name"
            value={planName}
            maxLength={120}
            onChange={(event) => setPlanName(event.target.value)}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="workout-split-activate">
            {t('workoutSplits.import.activate', 'Make it my active plan')}
          </Label>
          <Switch
            id="workout-split-activate"
            checked={activate}
            onCheckedChange={setActivate}
          />
        </div>
        <div className="flex items-start gap-2">
          <Checkbox
            id="workout-split-disclaimer"
            checked={accepted}
            onCheckedChange={(checked) => setAccepted(checked === true)}
          />
          <Label
            htmlFor="workout-split-disclaimer"
            className="text-sm font-normal leading-snug"
          >
            {t(
              'workoutSplits.import.disclaimer',
              'I understand that I should check with a doctor or healthcare professional before starting a new workout program, especially with a medical condition or an injury. A program does not replace medical advice, and I am responsible for my own health.'
            )}
          </Label>
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('common.cancel', 'Cancel')}
        </Button>
        <Button
          type="button"
          disabled={busy || !accepted || trimmedName === ''}
          onClick={submit}
        >
          {busy
            ? t('workoutSplits.import.adding', 'Adding...')
            : t('workoutSplits.import.add', 'Add program')}
        </Button>
      </DialogFooter>
    </>
  );
};

export default ImportWorkoutSplitDialog;
