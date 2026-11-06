import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  workoutProgramFileSchema,
  type WorkoutProgramFile,
} from '@workspace/shared';
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
import { useImportWorkoutProgramMutation } from '@/hooks/Exercises/useWorkoutPrograms';

interface ImportWorkoutProgramDialogProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

/**
 * Adds a workout program file someone shared (a preset, or a plan with its
 * presets): pick the file, look at what is in it, and add it. The file is
 * checked here first so a wrong file is explained before anything is sent.
 */
const ImportWorkoutProgramDialog = ({
  open,
  onClose,
  onImported,
}: ImportWorkoutProgramDialogProps) => (
  <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
    <DialogContent>
      {open ? <ImportForm onClose={onClose} onImported={onImported} /> : null}
    </DialogContent>
  </Dialog>
);

const ImportForm = ({
  onClose,
  onImported,
}: Omit<ImportWorkoutProgramDialogProps, 'open'>) => {
  const { t } = useTranslation();
  const importProgram = useImportWorkoutProgramMutation();
  const [program, setProgram] = useState<WorkoutProgramFile | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [planName, setPlanName] = useState('');
  const [activate, setActivate] = useState(false);
  const [accepted, setAccepted] = useState(false);

  const readFile = async (file: File | undefined) => {
    setProgram(null);
    setInvalid(false);
    if (!file) return;
    try {
      const parsed = workoutProgramFileSchema.safeParse(
        JSON.parse(await file.text())
      );
      if (!parsed.success) {
        setInvalid(true);
        return;
      }
      setProgram(parsed.data);
      setPlanName(parsed.data.plan?.name ?? '');
    } catch {
      setInvalid(true);
    }
  };

  const trimmedName = planName.trim();
  const canImport =
    program !== null &&
    accepted &&
    !importProgram.isPending &&
    (!program.plan || trimmedName !== '');

  const submit = () => {
    if (!program) return;
    importProgram.mutate(
      {
        program,
        planName: program.plan ? trimmedName : undefined,
        activate: program.plan ? activate : false,
      },
      { onSuccess: onImported }
    );
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {t('workoutPrograms.import.title', 'Add workouts from a file')}
        </DialogTitle>
        <DialogDescription>
          {t(
            'workoutPrograms.import.message',
            'Choose a workout file someone shared with you. Its exercises are added to your library and its workouts become your own presets and plan, which you can change afterwards.'
          )}
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="workout-program-file">
            {t('workoutPrograms.import.file', 'Workout file')}
          </Label>
          <Input
            id="workout-program-file"
            type="file"
            accept=".json,application/json"
            onChange={(event) => void readFile(event.target.files?.[0])}
          />
          {invalid ? (
            <p className="text-sm text-destructive" role="alert">
              {t(
                'workoutPrograms.import.invalid',
                'This is not a SparkyFitness workout file.'
              )}
            </p>
          ) : null}
        </div>

        {program ? (
          <div
            className="rounded-md border p-3 text-sm"
            data-testid="workout-program-summary"
          >
            <ul className="list-disc space-y-1 pl-5">
              {program.presets.map((preset) => (
                <li key={preset.key}>
                  {t(
                    'workoutPrograms.import.presetLine',
                    '{{name}} ({{count}} exercises)',
                    { name: preset.name, count: preset.exercises.length }
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {program?.plan ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="workout-program-plan-name">
                {t('workoutSplits.import.planName', 'Plan name')}
              </Label>
              <Input
                id="workout-program-plan-name"
                value={planName}
                maxLength={120}
                onChange={(event) => setPlanName(event.target.value)}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="workout-program-activate">
                {t('workoutSplits.import.activate', 'Make it my active plan')}
              </Label>
              <Switch
                id="workout-program-activate"
                checked={activate}
                onCheckedChange={setActivate}
              />
            </div>
          </>
        ) : null}

        <div className="flex items-start gap-2">
          <Checkbox
            id="workout-program-disclaimer"
            checked={accepted}
            onCheckedChange={(checked) => setAccepted(checked === true)}
          />
          <Label
            htmlFor="workout-program-disclaimer"
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
        <Button type="button" variant="outline" onClick={onClose}>
          {t('common.cancel', 'Cancel')}
        </Button>
        <Button type="button" disabled={!canImport} onClick={submit}>
          {importProgram.isPending
            ? t('workoutSplits.import.adding', 'Adding...')
            : t('workoutPrograms.import.add', 'Add workouts')}
        </Button>
      </DialogFooter>
    </>
  );
};

export default ImportWorkoutProgramDialog;
