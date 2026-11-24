import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil, Trash2 } from 'lucide-react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  addDays,
  bloodPressureBodyPositionSchema,
  classifyBloodPressure,
  homeBloodPressureAverage,
  instantHourMinute,
  instantToDay,
  localDateTimeToUtc,
  summarizeBloodPressure,
  todayInZone,
  type BloodPressureArm,
  type BloodPressureBodyPosition,
  type TimedBloodPressureReading,
} from '@workspace/shared';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { TimeInput } from '@/components/ui/TimeInput';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import {
  useBloodPressureRange,
  useCreateBloodPressureMutation,
  useDeleteBloodPressureMutation,
  useUpdateBloodPressureMutation,
} from '@/hooks/CheckIn/useBloodPressure';
import {
  BLOOD_PRESSURE_CATEGORY_CLASSES,
  bloodPressureCategoryLabel,
} from './bloodPressureCopy';

interface BloodPressureSectionProps {
  selectedDate: string;
}

interface Reading extends TimedBloodPressureReading {
  id: string;
  at: number;
  pulse: number | null;
  arm: string | null;
  bodyPosition: string | null;
  note: string | null;
  manual: boolean;
}

interface FormState {
  systolic: string;
  diastolic: string;
  pulse: string;
  time: string;
  arm: BloodPressureArm | 'none';
  bodyPosition: BloodPressureBodyPosition | 'none';
  note: string;
}

const RANGE_DAYS = [7, 30, 90] as const;

const emptyForm = (time: string): FormState => ({
  systolic: '',
  diastolic: '',
  pulse: '',
  time,
  arm: 'none',
  bodyPosition: 'none',
  note: '',
});

const pad = (n: number) => String(n).padStart(2, '0');

export const BloodPressureSection = ({
  selectedDate,
}: BloodPressureSectionProps) => {
  const { t } = useTranslation();
  const { timezone, formatTime } = usePreferences();
  const { isActingOnBehalf } = useActiveUser();

  const [days, setDays] = useState<(typeof RANGE_DAYS)[number]>(30);
  const startDate = addDays(selectedDate, -(days - 1));
  const { data, isLoading, isError, refetch } = useBloodPressureRange(
    startDate,
    selectedDate
  );
  const createReading = useCreateBloodPressureMutation();
  const updateReading = useUpdateBloodPressureMutation();
  const deleteReading = useDeleteBloodPressureMutation();

  const [form, setForm] = useState<FormState>(() => emptyForm('08:00'));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<string | null>(null);

  const defaultTime = () => {
    if (selectedDate !== todayInZone(timezone)) return '12:00';
    const { hour, minute } = instantHourMinute(new Date(), timezone);
    return `${pad(hour)}:${pad(minute)}`;
  };

  const readings = useMemo<Reading[]>(() => {
    const rows: Reading[] = [];
    for (const row of data ?? []) {
      const systolic =
        row.systolic_mmhg === null ? NaN : Number(row.systolic_mmhg);
      const diastolic =
        row.diastolic_mmhg === null ? NaN : Number(row.diastolic_mmhg);
      if (!Number.isFinite(systolic) || !Number.isFinite(diastolic)) continue;
      const at = new Date(row.timestamp).getTime();
      rows.push({
        id: row.id,
        at,
        date: instantToDay(at, timezone),
        hour: instantHourMinute(at, timezone).hour,
        systolic,
        diastolic,
        pulse:
          row.pulse_bpm === null || row.pulse_bpm === undefined
            ? null
            : Number(row.pulse_bpm),
        arm: row.arm ?? null,
        bodyPosition: row.body_position ?? null,
        note: row.note ?? null,
        manual: row.source_provider === 'manual',
      });
    }
    return rows.sort((a, b) => a.at - b.at);
  }, [data, timezone]);

  const summary = useMemo(() => summarizeBloodPressure(readings), [readings]);
  const home = useMemo(() => homeBloodPressureAverage(readings), [readings]);
  const latest = readings.length ? readings[readings.length - 1] : null;

  const resetForm = () => {
    setForm(emptyForm(defaultTime()));
    setEditingId(null);
  };

  const startEdit = (reading: Reading) => {
    const { hour, minute } = instantHourMinute(reading.at, timezone);
    setEditingId(reading.id);
    setForm({
      systolic: String(reading.systolic),
      diastolic: String(reading.diastolic),
      pulse: reading.pulse === null ? '' : String(reading.pulse),
      time: `${pad(hour)}:${pad(minute)}`,
      arm:
        reading.arm === 'left' || reading.arm === 'right'
          ? reading.arm
          : 'none',
      bodyPosition: bloodPressureBodyPositionSchema.safeParse(
        reading.bodyPosition
      ).success
        ? (reading.bodyPosition as BloodPressureBodyPosition)
        : 'none',
      note: reading.note ?? '',
    });
  };

  const systolicValue = Number(form.systolic);
  const diastolicValue = Number(form.diastolic);
  const pulseValue = form.pulse.trim() === '' ? null : Number(form.pulse);
  const formValid =
    form.systolic.trim() !== '' &&
    form.diastolic.trim() !== '' &&
    systolicValue >= 30 &&
    systolicValue <= 300 &&
    diastolicValue >= 10 &&
    diastolicValue <= 200 &&
    systolicValue > diastolicValue &&
    (pulseValue === null || (pulseValue >= 20 && pulseValue <= 300));

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!formValid || isActingOnBehalf) return;
    const timestamp = localDateTimeToUtc(
      `${selectedDate}T${form.time}`,
      timezone
    ).toISOString();
    const body = {
      timestamp,
      systolic_mmhg: systolicValue,
      diastolic_mmhg: diastolicValue,
      pulse_bpm: pulseValue,
      arm: form.arm === 'none' ? null : form.arm,
      body_position: form.bodyPosition === 'none' ? null : form.bodyPosition,
      note: form.note.trim() === '' ? null : form.note.trim(),
    };
    if (editingId) {
      await updateReading.mutateAsync({ id: editingId, body });
    } else {
      await createReading.mutateAsync(body);
    }
    resetForm();
  };

  const chartData = readings.map((r) => ({
    at: r.at,
    systolic: r.systolic,
    diastolic: r.diastolic,
  }));

  const readingText = (r: { systolic: number; diastolic: number }) =>
    `${r.systolic}/${r.diastolic}`;

  const categoryBadge = (r: { systolic: number; diastolic: number }) => {
    const category = classifyBloodPressure(r);
    return (
      <Badge
        variant="secondary"
        className={BLOOD_PRESSURE_CATEGORY_CLASSES[category]}
      >
        {bloodPressureCategoryLabel(t, category)}
      </Badge>
    );
  };

  const averageCard = (
    label: string,
    average: { systolic: number; diastolic: number; count: number } | null
  ) => (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      {average ? (
        <>
          <div className="text-xl font-semibold">{readingText(average)}</div>
          <div className="text-xs text-muted-foreground">
            {t('bloodPressure.readingCount', '{{count}} readings', {
              count: average.count,
            })}
          </div>
        </>
      ) : (
        <div className="text-xl font-semibold text-muted-foreground">–</div>
      )}
    </div>
  );

  const positionLabel = (value: string) =>
    t(`bloodPressure.positions.${value}`, value);
  const armLabel = (value: string) => t(`bloodPressure.arms.${value}`, value);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>
            {editingId
              ? t('bloodPressure.editTitle', 'Edit reading')
              : t('bloodPressure.addTitle', 'Log a reading')}
          </CardTitle>
          <CardDescription>
            {t(
              'bloodPressure.addDescription',
              'Logged on the selected day. mmHg.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isActingOnBehalf ? (
            <p className="text-sm text-muted-foreground">
              {t(
                'bloodPressure.actingOnBehalf',
                'Readings can only be logged on your own account.'
              )}
            </p>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="grid grid-cols-2 gap-3 md:grid-cols-4"
            >
              <div className="space-y-1">
                <Label htmlFor="bp-systolic">
                  {t('bloodPressure.systolic', 'Systolic')}
                </Label>
                <Input
                  id="bp-systolic"
                  inputMode="numeric"
                  value={form.systolic}
                  onChange={(e) =>
                    setForm({ ...form, systolic: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="bp-diastolic">
                  {t('bloodPressure.diastolic', 'Diastolic')}
                </Label>
                <Input
                  id="bp-diastolic"
                  inputMode="numeric"
                  value={form.diastolic}
                  onChange={(e) =>
                    setForm({ ...form, diastolic: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="bp-pulse">
                  {t('bloodPressure.pulse', 'Pulse (bpm)')}
                </Label>
                <Input
                  id="bp-pulse"
                  inputMode="numeric"
                  value={form.pulse}
                  onChange={(e) => setForm({ ...form, pulse: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label id="bp-time-label">
                  {t('bloodPressure.time', 'Time')}
                </Label>
                <TimeInput
                  aria-labelledby="bp-time-label"
                  value={form.time}
                  onChange={(value) => setForm({ ...form, time: value })}
                />
              </div>
              <div className="space-y-1">
                <Label>{t('bloodPressure.arm', 'Arm')}</Label>
                <Select
                  value={form.arm}
                  onValueChange={(value) =>
                    setForm({ ...form, arm: value as FormState['arm'] })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      {t('bloodPressure.notSet', 'Not set')}
                    </SelectItem>
                    <SelectItem value="left">{armLabel('left')}</SelectItem>
                    <SelectItem value="right">{armLabel('right')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{t('bloodPressure.position', 'Position')}</Label>
                <Select
                  value={form.bodyPosition}
                  onValueChange={(value) =>
                    setForm({
                      ...form,
                      bodyPosition: value as FormState['bodyPosition'],
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      {t('bloodPressure.notSet', 'Not set')}
                    </SelectItem>
                    {bloodPressureBodyPositionSchema.options.map((option) => (
                      <SelectItem key={option} value={option}>
                        {positionLabel(option)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1">
                <Label htmlFor="bp-note">
                  {t('bloodPressure.note', 'Note')}
                </Label>
                <Textarea
                  id="bp-note"
                  rows={1}
                  maxLength={500}
                  value={form.note}
                  onChange={(e) => setForm({ ...form, note: e.target.value })}
                />
              </div>
              <div className="col-span-2 flex gap-2 md:col-span-4">
                <Button
                  type="submit"
                  disabled={
                    !formValid ||
                    createReading.isPending ||
                    updateReading.isPending
                  }
                >
                  {editingId
                    ? t('common.saveChanges', 'Save changes')
                    : t('bloodPressure.save', 'Save reading')}
                </Button>
                {editingId && (
                  <Button type="button" variant="outline" onClick={resetForm}>
                    {t('common.cancel', 'Cancel')}
                  </Button>
                )}
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>{t('bloodPressure.trendTitle', 'Trend')}</CardTitle>
            <CardDescription>
              {t(
                'bloodPressure.disclaimer',
                'For your information only, not a diagnosis. Talk to a clinician about your readings.'
              )}
            </CardDescription>
          </div>
          <Select
            value={String(days)}
            onValueChange={(value) =>
              setDays(Number(value) as (typeof RANGE_DAYS)[number])
            }
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGE_DAYS.map((option) => (
                <SelectItem key={option} value={String(option)}>
                  {t('bloodPressure.lastDays', 'Last {{count}} days', {
                    count: option,
                  })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="space-y-4">
          {isError ? (
            <div className="flex items-center gap-3 text-sm">
              <span>
                {t(
                  'bloodPressure.loadFailed',
                  'Could not load your blood pressure readings.'
                )}
              </span>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                {t('common.retry', 'Retry')}
              </Button>
            </div>
          ) : isLoading ? (
            <p className="text-sm text-muted-foreground">
              {t('common.loading', 'Loading…')}
            </p>
          ) : readings.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t('bloodPressure.empty', 'No readings in this period yet.')}
            </p>
          ) : (
            <>
              {latest && (
                <div className="flex items-center gap-3">
                  <span className="text-3xl font-semibold">
                    {readingText(latest)}
                  </span>
                  <span className="text-sm text-muted-foreground">mmHg</span>
                  {categoryBadge(latest)}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {averageCard(
                  t('bloodPressure.average', 'Average'),
                  summary.overall
                )}
                {averageCard(
                  t('bloodPressure.morning', 'Morning average'),
                  summary.morning
                )}
                {averageCard(
                  t('bloodPressure.evening', 'Evening average'),
                  summary.evening
                )}
                {averageCard(
                  t('bloodPressure.homeAverage', 'Home average'),
                  home ? home.average : null
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {home
                  ? home.atOrAboveHomeThreshold
                    ? t(
                        'bloodPressure.homeAtOrAbove',
                        'Home average over {{count}} days (first day left out) is at or above 135/85.',
                        { count: home.daysUsed }
                      )
                    : t(
                        'bloodPressure.homeBelow',
                        'Home average over {{count}} days (first day left out) is below 135/85.',
                        { count: home.daysUsed }
                      )
                  : t(
                      'bloodPressure.homeNeedsDays',
                      'The home average needs readings on at least 5 different days.'
                    )}
              </p>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="at"
                      type="number"
                      scale="time"
                      domain={['dataMin', 'dataMax']}
                      tickFormatter={(value: number) =>
                        instantToDay(value, timezone).slice(5)
                      }
                    />
                    <YAxis domain={['dataMin - 10', 'dataMax + 10']} />
                    <Tooltip
                      labelFormatter={(value) =>
                        `${instantToDay(Number(value), timezone)} ${formatTime(new Date(Number(value)).toISOString(), { asInstant: true })}`
                      }
                    />
                    <Legend />
                    <ReferenceLine y={130} strokeDasharray="4 4" />
                    <ReferenceLine y={80} strokeDasharray="4 4" />
                    <Line
                      type="monotone"
                      dataKey="systolic"
                      name={t('bloodPressure.systolic', 'Systolic')}
                      stroke="#dc2626"
                      dot
                    />
                    <Line
                      type="monotone"
                      dataKey="diastolic"
                      name={t('bloodPressure.diastolic', 'Diastolic')}
                      stroke="#2563eb"
                      dot
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {readings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('bloodPressure.history', 'History')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {[...readings].reverse().map((reading) => (
              <div
                key={reading.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">
                      {readingText(reading)}
                    </span>
                    {categoryBadge(reading)}
                    {reading.pulse !== null && (
                      <span className="text-xs text-muted-foreground">
                        {reading.pulse} bpm
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {reading.date}{' '}
                    {formatTime(new Date(reading.at).toISOString(), {
                      asInstant: true,
                    })}
                    {reading.arm ? ` · ${armLabel(reading.arm)}` : ''}
                    {reading.bodyPosition
                      ? ` · ${positionLabel(reading.bodyPosition)}`
                      : ''}
                    {reading.note ? ` · ${reading.note}` : ''}
                  </div>
                </div>
                {!isActingOnBehalf && (
                  <div className="flex gap-1">
                    {reading.manual && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t('common.edit', 'Edit')}
                        onClick={() => startEdit(reading)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t('common.delete', 'Delete')}
                      onClick={() => setToDelete(reading.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <AlertDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('bloodPressure.deleteTitle', 'Delete this reading?')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'bloodPressure.deleteDescription',
                'A reading that came from a device can come back on the next sync.'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t('common.cancel', 'Cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (toDelete) deleteReading.mutate(toDelete);
                setToDelete(null);
              }}
            >
              {t('common.delete', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
