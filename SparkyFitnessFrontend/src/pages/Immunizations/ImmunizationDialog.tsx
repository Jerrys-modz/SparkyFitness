import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  COMMON_VACCINE_NAMES,
  compareDays,
  isDayString,
  todayInZone,
  type CreateImmunizationBody,
  type ImmunizationResponse,
} from '@workspace/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useSaveImmunization } from '@/hooks/Immunizations/useImmunizations';

interface ImmunizationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A saved record to edit; omit to add a new one. */
  immunization?: ImmunizationResponse | null;
}

const orNull = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

const ImmunizationDialog = ({
  open,
  onOpenChange,
  immunization,
}: ImmunizationDialogProps) => {
  const { t } = useTranslation();
  const { timezone } = usePreferences();
  const save = useSaveImmunization();

  const [name, setName] = useState(immunization?.vaccine_name ?? '');
  const [date, setDate] = useState(
    immunization?.administered_on ?? todayInZone(timezone)
  );
  const [dose, setDose] = useState(
    immunization?.dose_number != null ? String(immunization.dose_number) : ''
  );
  const [lot, setLot] = useState(immunization?.lot_number ?? '');
  const [administeredBy, setAdministeredBy] = useState(
    immunization?.administered_by ?? ''
  );
  const [site, setSite] = useState(immunization?.site ?? '');
  const [nextDue, setNextDue] = useState(immunization?.next_due_on ?? '');
  const [code, setCode] = useState(immunization?.vaccine_code ?? '');
  const [notes, setNotes] = useState(immunization?.notes ?? '');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    if (name.trim() === '') {
      setError(t('immunizations.nameRequired', 'Enter the vaccine name.'));
      return;
    }
    if (!isDayString(date)) {
      setError(t('immunizations.dateRequired', 'Enter the date it was given.'));
      return;
    }
    // A saved record keeps the date it has (one a scan read can be dated
    // ahead); only a date typed now must not be in the future.
    if (
      date !== immunization?.administered_on &&
      compareDays(date, todayInZone(timezone)) > 0
    ) {
      setError(
        t('immunizations.dateFuture', 'The date given cannot be in the future.')
      );
      return;
    }
    if (nextDue !== '' && !isDayString(nextDue)) {
      setError(t('immunizations.dueInvalid', 'Enter a valid next-due date.'));
      return;
    }
    if (nextDue !== '' && compareDays(nextDue, date) < 0) {
      setError(
        t(
          'immunizations.dueBeforeGiven',
          'The next-due date cannot be before the date given.'
        )
      );
      return;
    }
    const doseNumber = dose.trim() === '' ? null : Number(dose);
    if (
      doseNumber !== null &&
      (!Number.isInteger(doseNumber) || doseNumber < 1 || doseNumber > 20)
    ) {
      setError(
        t('immunizations.doseInvalid', 'Dose number must be from 1 to 20.')
      );
      return;
    }

    const body: CreateImmunizationBody = {
      vaccine_name: name.trim(),
      vaccine_code: orNull(code),
      administered_on: date,
      dose_number: doseNumber,
      lot_number: orNull(lot),
      administered_by: orNull(administeredBy),
      site: orNull(site),
      next_due_on: nextDue === '' ? null : nextDue,
      notes: orNull(notes),
    };
    save.mutate(
      { id: immunization?.id, body },
      { onSuccess: () => onOpenChange(false) }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {immunization
              ? t('immunizations.edit', 'Edit immunization')
              : t('immunizations.add', 'Add immunization')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="imm-name">
              {t('immunizations.vaccine', 'Vaccine')}
            </Label>
            <Input
              id="imm-name"
              list="imm-name-options"
              value={name}
              maxLength={200}
              onChange={(e) => setName(e.target.value)}
            />
            <datalist id="imm-name-options">
              {COMMON_VACCINE_NAMES.map((vaccine) => (
                <option key={vaccine} value={vaccine} />
              ))}
            </datalist>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="imm-date">
                {t('immunizations.date', 'Date given')}
              </Label>
              <Input
                id="imm-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="imm-due">
                {t('immunizations.nextDue', 'Next due (optional)')}
              </Label>
              <Input
                id="imm-due"
                type="date"
                value={nextDue}
                onChange={(e) => setNextDue(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="imm-dose">
                {t('immunizations.dose', 'Dose number')}
              </Label>
              <Input
                id="imm-dose"
                inputMode="numeric"
                value={dose}
                onChange={(e) => setDose(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="imm-lot">
                {t('immunizations.lot', 'Lot number')}
              </Label>
              <Input
                id="imm-lot"
                value={lot}
                maxLength={80}
                onChange={(e) => setLot(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="imm-by">
                {t('immunizations.administeredBy', 'Given by')}
              </Label>
              <Input
                id="imm-by"
                value={administeredBy}
                maxLength={200}
                onChange={(e) => setAdministeredBy(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="imm-site">
                {t('immunizations.site', 'Site')}
              </Label>
              <Input
                id="imm-site"
                value={site}
                maxLength={80}
                onChange={(e) => setSite(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="imm-code">
              {t('immunizations.code', 'Vaccine code (optional)')}
            </Label>
            <Input
              id="imm-code"
              value={code}
              maxLength={40}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          <Textarea
            aria-label={t('immunizations.notes', 'Notes')}
            placeholder={t(
              'immunizations.notesPlaceholder',
              'Add a note (optional)'
            )}
            value={notes}
            maxLength={2000}
            onChange={(e) => setNotes(e.target.value)}
          />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button onClick={submit} disabled={save.isPending}>
            {save.isPending
              ? t('common.saving', 'Saving...')
              : t('common.save', 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ImmunizationDialog;
