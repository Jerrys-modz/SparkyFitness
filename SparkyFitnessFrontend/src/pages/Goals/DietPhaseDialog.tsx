import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays } from 'lucide-react';
import {
  MAX_DIET_PHASE_WEEKS,
  addDays,
  dayToPickerDate,
  dietPhaseHasStarted,
  localDateToDay,
  type DietPhaseSaveInput,
} from '@workspace/shared';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { WeeklyWeightGoalInput } from '@/components/WeeklyWeightGoalInput';
import { usePreferences } from '@/contexts/PreferencesContext';
import { kgToLbs, lbsToKg } from '@/utils/unitConversions';

type EndMode = 'date' | 'weeks' | 'target';

interface DietPhaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The phase being edited, or a new phase's starting values. */
  phase: DietPhaseSaveInput;
  /** Today in the profile timezone. */
  today: string;
  saving: boolean;
  onSave: (phase: DietPhaseSaveInput) => void;
}

function endModeOf(phase: DietPhaseSaveInput): EndMode {
  if (phase.end_date) return 'date';
  if (phase.duration_weeks) return 'weeks';
  return 'target';
}

function signedRate(phase: DietPhaseSaveInput): number {
  if (phase.phase_type === 'loss') return -phase.weekly_change_kg;
  if (phase.phase_type === 'gain') return phase.weekly_change_kg;
  return 0;
}

const DayPicker = ({
  id,
  value,
  onChange,
  disabled,
  fromDay,
}: {
  id: string;
  value: string | null;
  onChange: (day: string) => void;
  disabled?: boolean;
  fromDay?: string;
}) => {
  const { t } = useTranslation();
  const { formatDateInUserTimezone, dateFormat } = usePreferences();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          disabled={disabled}
          className="w-full justify-start text-left font-normal"
        >
          <CalendarDays className="mr-2 h-4 w-4" />
          {value
            ? formatDateInUserTimezone(value, dateFormat)
            : t('goals.goalsSettings.pickADate', 'Pick a date')}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Calendar
          mode="single"
          selected={value ? dayToPickerDate(value) : undefined}
          onSelect={(date) => date && onChange(localDateToDay(date))}
          disabled={
            fromDay ? (date) => localDateToDay(date) < fromDay : undefined
          }
          yearsRange={10}
        />
      </PopoverContent>
    </Popover>
  );
};

/** Add or edit one diet phase; a phase that has started can only change its end. */
export const DietPhaseDialog = ({
  open,
  onOpenChange,
  phase,
  today,
  saving,
  onSave,
}: DietPhaseDialogProps) => {
  const { t } = useTranslation();
  const { weightUnit } = usePreferences();
  const started = dietPhaseHasStarted(phase, today);
  const targetUnit = weightUnit === 'kg' ? 'kg' : 'lbs';

  const [label, setLabel] = useState(phase.label ?? '');
  const [startDate, setStartDate] = useState(phase.start_date);
  const [rateKg, setRateKg] = useState(signedRate(phase));
  const [rateValid, setRateValid] = useState(true);
  const [endMode, setEndMode] = useState<EndMode>(endModeOf(phase));
  const [endDate, setEndDate] = useState<string | null>(phase.end_date);
  const [weeks, setWeeks] = useState(
    phase.duration_weeks ? String(phase.duration_weeks) : '4'
  );
  const [target, setTarget] = useState(
    phase.target_weight_kg === null
      ? ''
      : String(
          Number(
            (targetUnit === 'kg'
              ? phase.target_weight_kg
              : kgToLbs(phase.target_weight_kg)
            ).toFixed(1)
          )
        )
  );

  const maintenance = rateKg === 0;
  const weeksNumber = Number(weeks);
  const targetNumber = Number(target);
  const targetKg =
    target.trim() === '' || !Number.isFinite(targetNumber) || targetNumber <= 0
      ? null
      : Math.round(
          (targetUnit === 'kg' ? targetNumber : lbsToKg(targetNumber)) * 100
        ) / 100;
  const effectiveEndMode: EndMode =
    maintenance && endMode === 'target' ? 'date' : endMode;
  const endValid =
    effectiveEndMode === 'date'
      ? endDate !== null && endDate >= startDate
      : effectiveEndMode === 'weeks'
        ? Number.isInteger(weeksNumber) &&
          weeksNumber >= 1 &&
          weeksNumber <= MAX_DIET_PHASE_WEEKS
        : targetKg !== null;
  const canSave = rateValid && endValid && startDate !== '' && !saving;

  const handleSave = () => {
    if (!canSave) return;
    onSave({
      id: phase.id,
      label: label.trim() === '' ? null : label.trim(),
      phase_type: rateKg < 0 ? 'loss' : rateKg > 0 ? 'gain' : 'maintenance',
      weekly_change_kg: Math.abs(rateKg),
      start_date: startDate,
      end_date: effectiveEndMode === 'date' ? endDate : null,
      duration_weeks: effectiveEndMode === 'weeks' ? weeksNumber : null,
      target_weight_kg: maintenance ? null : targetKg,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>
            {phase.id
              ? t('goals.dietPhases.editPhase', 'Edit phase')
              : t('goals.dietPhases.addPhase', 'Add phase')}
          </DialogTitle>
          <DialogDescription>
            {started
              ? t(
                  'goals.dietPhases.startedHint',
                  'This phase has started. Past days keep the settings they were logged with, so only its end can change.'
                )
              : t(
                  'goals.dietPhases.dialogHint',
                  'During the phase, its weekly weight change replaces your Goal Mode.'
                )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="diet-phase-label">
              {t('goals.dietPhases.label', 'Name (optional)')}
            </Label>
            <Input
              id="diet-phase-label"
              value={label}
              maxLength={60}
              placeholder={t('goals.dietPhases.labelPlaceholder', 'Summer cut')}
              onChange={(event) => setLabel(event.target.value)}
            />
          </div>
          <WeeklyWeightGoalInput
            value={rateKg}
            weightUnit={weightUnit}
            onChange={setRateKg}
            onValidityChange={setRateValid}
            disabled={started}
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="diet-phase-start">
                {t('goals.goalsSettings.startDate', 'Start Date')}
              </Label>
              <DayPicker
                id="diet-phase-start"
                value={startDate}
                onChange={setStartDate}
                disabled={started}
                fromDay={today}
              />
            </div>
            <div>
              <Label htmlFor="diet-phase-end-mode">
                {t('goals.dietPhases.endsBy', 'Ends')}
              </Label>
              <Select
                value={effectiveEndMode}
                onValueChange={(value: EndMode) => setEndMode(value)}
              >
                <SelectTrigger id="diet-phase-end-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date">
                    {t('goals.dietPhases.endOnDate', 'On a date')}
                  </SelectItem>
                  <SelectItem value="weeks">
                    {t(
                      'goals.dietPhases.endAfterWeeks',
                      'After a number of weeks'
                    )}
                  </SelectItem>
                  {!maintenance && (
                    <SelectItem value="target">
                      {t(
                        'goals.dietPhases.endAtTarget',
                        'When I reach a target weight'
                      )}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          {effectiveEndMode === 'date' && (
            <div>
              <Label htmlFor="diet-phase-end">
                {t('goals.dietPhases.lastDay', 'Last day')}
              </Label>
              <DayPicker
                id="diet-phase-end"
                value={endDate}
                onChange={setEndDate}
                // A started phase may end yesterday at the earliest: any
                // earlier would change a day already logged.
                fromDay={started ? addDays(today, -1) : startDate}
              />
            </div>
          )}
          {effectiveEndMode === 'weeks' && (
            <div>
              <Label htmlFor="diet-phase-weeks">
                {t('goals.dietPhases.weeks', 'Weeks')}
              </Label>
              <Input
                id="diet-phase-weeks"
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_DIET_PHASE_WEEKS}
                value={weeks}
                aria-invalid={!endValid}
                onChange={(event) => setWeeks(event.target.value)}
              />
            </div>
          )}
          {!maintenance && (
            <div>
              <Label htmlFor="diet-phase-target">
                {effectiveEndMode === 'target'
                  ? t(
                      'goals.dietPhases.targetWeight',
                      'Target weight ({{unit}})',
                      {
                        unit: targetUnit,
                      }
                    )
                  : t(
                      'goals.dietPhases.targetWeightOptional',
                      'End early at weight ({{unit}}, optional)',
                      { unit: targetUnit }
                    )}
              </Label>
              <Input
                id="diet-phase-target"
                type="number"
                inputMode="decimal"
                value={target}
                aria-invalid={
                  effectiveEndMode === 'target' && targetKg === null
                }
                onChange={(event) => setTarget(event.target.value)}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {t(
                  'goals.dietPhases.targetHint',
                  'The phase ends on the day your weight trend reaches this weight.'
                )}
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {t('goals.dietPhases.savePhase', 'Save phase')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
