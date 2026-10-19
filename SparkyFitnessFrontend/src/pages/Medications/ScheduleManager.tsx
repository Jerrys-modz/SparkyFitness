import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Settings, Clock, Trash2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  todayInZone,
  formatDose,
  areExtraDosesValid,
  buildExtraDoseSchedules,
  applyDoseFrequencyPreset,
  type DoseFrequencyPresetId,
  type ExtraDoseInput,
  type MedicationWithMeal,
} from '@workspace/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { TimeInput } from '@/components/ui/TimeInput';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  useAddScheduleMutation,
  useDeleteScheduleMutation,
} from '@/hooks/useMedications';
import {
  formatScheduleDescription,
  positiveDoseOrNull,
  supplementDoseScaling,
} from './medicationUtils';
import type { MedicationDetail, MedicationSchedule } from '@/types/medications';

export default function ScheduleManager({ med }: { med: MedicationDetail }) {
  const { t } = useTranslation();
  const preferencesContext = usePreferences();
  const timezone =
    preferencesContext?.timezone ||
    Intl.DateTimeFormat().resolvedOptions().timeZone;
  const timeFormat = preferencesContext?.timeFormat ?? 'h:mm A';

  const [open, setOpen] = useState(false);
  const [scheduleTypeId, setScheduleTypeId] = useState('daily');
  const [timeOfDay, setTimeOfDay] = useState('09:00');
  const [doseAmount, setDoseAmount] = useState('');
  const [withMeal, setWithMeal] = useState<MedicationWithMeal | null>(null);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  const [intervalDays, setIntervalDays] = useState('1');
  const [dayOfMonth, setDayOfMonth] = useState('1');
  const [cycleOnDays, setCycleOnDays] = useState('7');
  const [cycleOffDays, setCycleOffDays] = useState('7');
  const [prnReason, setPrnReason] = useState('');
  const [prnMaxPerDay, setPrnMaxPerDay] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [extraDoses, setExtraDoses] = useState<ExtraDoseInput[]>([]);

  const handleTypeChange = (val: string) => {
    setScheduleTypeId(val);
    if ((val === 'every_n_days' || val === 'cyclic') && !startDate) {
      setStartDate(todayInZone(timezone));
    }
  };

  const addMutation = useAddScheduleMutation(med.id);
  const deleteMutation = useDeleteScheduleMutation();

  const presetLabels: Record<DoseFrequencyPresetId, string> = {
    qd: t('medications.schedule.preset.qd', 'Once daily'),
    qhs: t('medications.schedule.preset.qhs', 'Bedtime'),
    bid: t('medications.schedule.preset.bid', 'Twice daily'),
    tid: t('medications.schedule.preset.tid', '3x daily'),
    qid: t('medications.schedule.preset.qid', '4x daily'),
  };

  const applyPreset = (id: DoseFrequencyPresetId) => {
    const preset = applyDoseFrequencyPreset(id);
    setTimeOfDay(preset.time);
    setExtraDoses(preset.extras);
  };

  const updateExtraDose = (index: number, patch: Partial<ExtraDoseInput>) => {
    setExtraDoses((prev) =>
      prev.map((dose, i) => (i === index ? { ...dose, ...patch } : dose))
    );
  };

  const handleSave = async () => {
    if (!areExtraDosesValid(extraDoses)) return;
    const body: Partial<MedicationSchedule> & { schedule_type_id: string } = {
      schedule_type_id: scheduleTypeId,
      time_of_day: scheduleTypeId === 'prn' ? null : timeOfDay,
      dose_amount: positiveDoseOrNull(doseAmount),
      with_meal: withMeal || null,
      start_date: startDate || null,
      end_date: endDate || null,
    };

    if (scheduleTypeId === 'weekly') {
      body.days_of_week = daysOfWeek;
    } else if (scheduleTypeId === 'every_n_days') {
      body.interval_days = Number(intervalDays);
    } else if (scheduleTypeId === 'monthly') {
      body.day_of_month = Number(dayOfMonth);
    } else if (scheduleTypeId === 'cyclic') {
      body.cycle_on_days = Number(cycleOnDays);
      body.cycle_off_days = Number(cycleOffDays);
    } else if (scheduleTypeId === 'prn') {
      body.prn_reason = prnReason || null;
      body.prn_max_per_day = prnMaxPerDay ? Number(prnMaxPerDay) : null;
    }

    try {
      await addMutation.mutateAsync(body);
      // Each extra dose is its own rule sharing this rule's recurrence.
      for (const extra of buildExtraDoseSchedules(body, extraDoses)) {
        await addMutation.mutateAsync(extra);
      }
    } catch {
      // The mutation's meta already surfaces the error toast.
      return;
    }
    setOpen(false);
    setScheduleTypeId('daily');
    setTimeOfDay('09:00');
    setDoseAmount('');
    setWithMeal(null);
    setDaysOfWeek([]);
    setIntervalDays('1');
    setDayOfMonth('1');
    setCycleOnDays('7');
    setCycleOffDays('7');
    setPrnReason('');
    setPrnMaxPerDay('');
    setStartDate('');
    setEndDate('');
    setExtraDoses([]);
  };

  const toggleDay = (day: number) => {
    setDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  // Surfaces the multiplication the entry snapshot performs, at the point the dose is
  // chosen. Null unless it would actually say something (see supplementDoseScaling).
  const doseScaling = supplementDoseScaling(med, doseAmount, med.dose_amount);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2 border-b">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Settings className="h-4 w-4 text-muted-foreground" />{' '}
          {t('medications.schedule.title', 'Schedule Rules')}
        </CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              {t('medications.schedule.addRule', 'Add Rule')}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {t('medications.schedule.addRule', 'Add Rule')}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto pr-1">
              {/* Type selector */}
              <div className="space-y-2">
                <Label>{t('medications.schedule.type', 'Schedule Type')}</Label>
                <Select value={scheduleTypeId} onValueChange={handleTypeChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">
                      {t('medications.scheduleTypes.daily', 'Every day')}
                    </SelectItem>
                    <SelectItem value="weekly">
                      {t(
                        'medications.scheduleTypes.weekly',
                        'Specific days of week'
                      )}
                    </SelectItem>
                    <SelectItem value="every_n_days">
                      {t(
                        'medications.scheduleTypes.everyNDays',
                        'Every N days'
                      )}
                    </SelectItem>
                    <SelectItem value="cyclic">
                      {t('medications.scheduleTypes.cyclic', 'Cyclic (On/Off)')}
                    </SelectItem>
                    <SelectItem value="monthly">
                      {t('medications.scheduleTypes.monthly', 'Monthly')}
                    </SelectItem>
                    <SelectItem value="prn">
                      {t('medications.scheduleTypes.prn', 'As needed (PRN)')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Time of Day (hidden for PRN) */}
              {scheduleTypeId !== 'prn' && (
                <div className="space-y-2">
                  <Label id="schedule-time-label">
                    {t('medications.schedule.time', 'Time of Day')}
                  </Label>
                  <TimeInput
                    aria-labelledby="schedule-time-label"
                    value={timeOfDay}
                    onChange={setTimeOfDay}
                  />
                </div>
              )}

              {/* Dose Amount */}
              <div className="space-y-2">
                <Label>
                  {med.is_supplement
                    ? t(
                        'medications.schedule.servingsPerLog',
                        'Servings per log'
                      )
                    : t(
                        'medications.schedule.doseAmount',
                        'Dose Amount (override)'
                      )}
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    step="0.1"
                    min="0.1"
                    placeholder={
                      med.dose_amount != null ? String(med.dose_amount) : '1'
                    }
                    value={doseAmount}
                    onChange={(e) => setDoseAmount(e.target.value)}
                  />
                  <span className="text-sm text-muted-foreground capitalize">
                    {/* A supplement's stored dose_unit is a sentinel rather than a real
                        unit, and supplements created before this read 'dose'. Labels
                        state amounts per SERVING, so that is the word to echo back: it
                        is the one printed on the bottle the user is holding. */}
                    {med.is_supplement
                      ? t('medications.schedule.servingUnit', 'serving')
                      : (med.dose_unit ?? med.type_id)}
                  </span>
                </div>
                {doseScaling && (
                  <p className="text-xs text-muted-foreground">
                    {doseScaling.calories != null
                      ? t(
                          'medications.schedule.supplementDoseScalingCalories',
                          'Each log counts {{dose}} servings: {{dose}} x {{perDose}} kcal = {{total}} kcal.',
                          {
                            dose: doseScaling.dose,
                            perDose: doseScaling.calories,
                            total:
                              Math.round(
                                doseScaling.calories * doseScaling.dose * 100
                              ) / 100,
                          }
                        )
                      : t(
                          'medications.schedule.supplementDoseScaling',
                          'Each log counts {{dose}} servings, so {{dose}} times the nutrition entered per serving.',
                          { dose: doseScaling.dose }
                        )}
                  </p>
                )}
              </div>

              {/* Additional doses at other times of day (same rule, own time and amount) */}
              {scheduleTypeId !== 'prn' && (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1">
                    {(['qd', 'qhs', 'bid', 'tid', 'qid'] as const).map((id) => (
                      <Button
                        key={id}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => applyPreset(id)}
                      >
                        {presetLabels[id]}
                      </Button>
                    ))}
                  </div>
                  {extraDoses.map((extra, index) => (
                    <div key={index} className="flex items-end gap-2">
                      <div className="space-y-1 flex-1">
                        <Label>
                          {t('medications.schedule.extraDoseTime', 'Time')}
                        </Label>
                        <Input
                          type="time"
                          value={extra.time}
                          onChange={(e) =>
                            updateExtraDose(index, { time: e.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-1 flex-1">
                        <Label>
                          {t('medications.schedule.extraDoseAmount', 'Dose')}
                        </Label>
                        <Input
                          type="number"
                          step="0.1"
                          min="0.1"
                          placeholder={
                            doseAmount ||
                            (med.dose_amount != null
                              ? String(med.dose_amount)
                              : '1')
                          }
                          value={extra.dose}
                          onChange={(e) =>
                            updateExtraDose(index, { dose: e.target.value })
                          }
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() =>
                          setExtraDoses((prev) =>
                            prev.filter((_, i) => i !== index)
                          )
                        }
                        aria-label={t(
                          'medications.schedule.removeExtraDose',
                          'Remove dose'
                        )}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setExtraDoses((prev) => [...prev, { time: '', dose: '' }])
                    }
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    {t('medications.schedule.addDose', 'Add another dose')}
                  </Button>
                  {extraDoses.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {t(
                        'medications.schedule.extraDoseHint',
                        'Each extra dose is saved as its own rule with the same recurrence and food relation.'
                      )}
                    </p>
                  )}
                </div>
              )}

              {/* Food relation */}
              <div className="space-y-2">
                <Label>
                  {t('medications.schedule.withMeal', 'Food Relation')}
                </Label>
                <Select
                  value={withMeal || 'none'}
                  onValueChange={(v) =>
                    setWithMeal(v === 'none' ? null : (v as MedicationWithMeal))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      {t(
                        'medications.mealRelation.none',
                        'No specific food relation'
                      )}
                    </SelectItem>
                    <SelectItem value="before">
                      {t('medications.mealRelation.before', 'Before meal')}
                    </SelectItem>
                    <SelectItem value="with">
                      {t('medications.mealRelation.with', 'With meal')}
                    </SelectItem>
                    <SelectItem value="after">
                      {t('medications.mealRelation.after', 'After meal')}
                    </SelectItem>
                    <SelectItem value="away_from_meals">
                      {t(
                        'medications.mealRelation.awayFromMeals',
                        'Away from meals'
                      )}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Weekly options */}
              {scheduleTypeId === 'weekly' && (
                <div className="space-y-2">
                  <Label>
                    {t('medications.schedule.weekdays', 'Select Days')}
                  </Label>
                  <div className="flex flex-wrap gap-1">
                    {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((dayName, idx) => {
                      const active = daysOfWeek.includes(idx);
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => toggleDay(idx)}
                          className={`h-8 w-8 rounded-full border text-xs font-semibold transition ${
                            active
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-background text-muted-foreground hover:bg-muted'
                          }`}
                        >
                          {dayName}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Every N days options */}
              {scheduleTypeId === 'every_n_days' && (
                <div className="space-y-2">
                  <Label>
                    {t('medications.schedule.interval', 'Interval (Days)')}
                  </Label>
                  <Input
                    type="number"
                    min="1"
                    value={intervalDays}
                    onChange={(e) => setIntervalDays(e.target.value)}
                  />
                </div>
              )}

              {/* Monthly options */}
              {scheduleTypeId === 'monthly' && (
                <div className="space-y-2">
                  <Label>
                    {t('medications.schedule.dayOfMonth', 'Day of Month')}
                  </Label>
                  <Input
                    type="number"
                    min="1"
                    max="31"
                    value={dayOfMonth}
                    onChange={(e) => setDayOfMonth(e.target.value)}
                  />
                </div>
              )}

              {/* Cyclic options */}
              {scheduleTypeId === 'cyclic' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>
                      {t('medications.schedule.cycleOn', 'Days On')}
                    </Label>
                    <Input
                      type="number"
                      min="1"
                      value={cycleOnDays}
                      onChange={(e) => setCycleOnDays(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>
                      {t('medications.schedule.cycleOff', 'Days Off')}
                    </Label>
                    <Input
                      type="number"
                      min="1"
                      value={cycleOffDays}
                      onChange={(e) => setCycleOffDays(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* PRN options */}
              {scheduleTypeId === 'prn' && (
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="sched-prn-reason">
                      {t('medications.schedule.prnReason', 'Reason / Symptom')}
                    </Label>
                    <Input
                      id="sched-prn-reason"
                      placeholder={t(
                        'medications.scheduleManager.eGForPainFor',
                        'e.g. For pain, For headache'
                      )}
                      value={prnReason}
                      onChange={(e) => setPrnReason(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sched-prn-max">
                      {t('medications.schedule.prnMax', 'Max doses per day')}
                    </Label>
                    <Input
                      id="sched-prn-max"
                      type="number"
                      placeholder="e.g. 3"
                      value={prnMaxPerDay}
                      onChange={(e) => setPrnMaxPerDay(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* Date limits */}
              <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                <div className="space-y-2">
                  <Label>
                    {['every_n_days', 'cyclic'].includes(scheduleTypeId) ? (
                      <span className="font-semibold text-primary">
                        {t(
                          'medications.schedule.startDateRequired',
                          'Start Date (Required)'
                        )}
                      </span>
                    ) : (
                      t(
                        'medications.schedule.startDate',
                        'Start Date (Optional)'
                      )
                    )}
                  </Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>
                    {t('medications.schedule.endDate', 'End Date (Optional)')}
                  </Label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={handleSave}
                disabled={
                  addMutation.isPending ||
                  !areExtraDosesValid(extraDoses) ||
                  ((scheduleTypeId === 'every_n_days' ||
                    scheduleTypeId === 'cyclic') &&
                    !startDate)
                }
              >
                {addMutation.isPending
                  ? t('medications.common.saving', 'Saving…')
                  : t('medications.schedule.addRule', 'Add Rule')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="pt-4">
        {!med.schedules || med.schedules.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2 text-center">
            {t(
              'medications.scheduleManager.noScheduleRulesConfiguredYet',
              'No schedule rules configured yet.'
            )}
          </p>
        ) : (
          <div className="space-y-3">
            {med.schedules.map((sched) => (
              <div
                key={sched.id}
                className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0 text-sm"
              >
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <span className="font-medium text-foreground">
                      {formatScheduleDescription(sched, timeFormat)}
                    </span>
                    {sched.dose_amount != null && (
                      <span className="text-xs text-muted-foreground ml-2">
                        (<span>{formatDose(med, sched)}</span>)
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  onClick={() => deleteMutation.mutate(sched.id)}
                  disabled={deleteMutation.isPending}
                  aria-label={t(
                    'medications.scheduleManager.deleteScheduleRule',
                    'Delete schedule rule'
                  )}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
