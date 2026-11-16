import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Edit, Flag, PlusCircle, Trash2 } from 'lucide-react';
import {
  addDays,
  compareDays,
  daysBetween,
  dietPhaseHasStarted,
  dietPhaseSaveInputs,
  formatWeeklyGoalRate,
  getWeeklyGoalRateUnit,
  type DietPhase,
  type DietPhaseSaveInput,
} from '@workspace/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import {
  useDietPhases,
  useSaveDietPhasesMutation,
} from '@/hooks/Goals/useGoals';
import { kgToLbs } from '@/utils/unitConversions';
import { DietPhaseDialog } from './DietPhaseDialog';

const PHASE_COLORS: Record<DietPhase['phase_type'], string> = {
  loss: 'bg-sky-500',
  maintenance: 'bg-emerald-500',
  gain: 'bg-amber-500',
};

/** Days a timeline bar gives an open-ended phase. */
const OPEN_PHASE_DISPLAY_DAYS = 28;

export const DietPhasesSection = () => {
  const { t, i18n } = useTranslation();
  const { weightUnit, formatDateInUserTimezone } = usePreferences();
  const { isActingOnBehalf } = useActiveUser();
  const { data } = useDietPhases();
  const { mutate: savePlan, isPending: saving } = useSaveDietPhasesMutation();
  const [editing, setEditing] = useState<DietPhaseSaveInput | null>(null);

  if (!data) return null;
  const { phases, status, today } = data;
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const rateUnit = getWeeklyGoalRateUnit(weightUnit);
  const canEdit = !isActingOnBehalf;

  const typeLabel = (type: DietPhase['phase_type']) =>
    type === 'loss'
      ? t('goals.dietPhases.typeLoss', 'Loss')
      : type === 'gain'
        ? t('goals.dietPhases.typeGain', 'Gain')
        : t('goals.dietPhases.typeMaintenance', 'Maintenance');

  const rateText = (phase: DietPhase) => {
    if (phase.phase_type === 'maintenance') return '';
    const { amount, pounds } = formatWeeklyGoalRate(
      phase.weekly_change_kg,
      rateUnit,
      locale
    );
    return rateUnit === 'st_lbs'
      ? t('goals.dietPhases.rateStLbs', '{{st}} st {{lbs}} lbs / week', {
          st: amount,
          lbs: pounds,
        })
      : t('goals.dietPhases.rate', '{{amount}} {{unit}} / week', {
          amount,
          unit: rateUnit,
        });
  };

  const phaseName = (phase: DietPhase) =>
    phase.label || typeLabel(phase.phase_type);

  const weightText = (kg: number) =>
    weightUnit === 'kg'
      ? `${Number(kg.toFixed(1))} kg`
      : `${Number(kgToLbs(kg).toFixed(1))} lbs`;

  const savePhases = (next: DietPhaseSaveInput[]) =>
    savePlan({ phases: next }, { onSuccess: () => setEditing(null) });

  const handleSavePhase = (phase: DietPhaseSaveInput) => {
    const others = dietPhaseSaveInputs(phases).filter(
      (p) => !phase.id || p.id !== phase.id
    );
    savePhases([...others, phase]);
  };

  const handleDelete = (phase: DietPhase) => {
    if (
      !confirm(
        t('goals.dietPhases.deleteConfirm', 'Delete this phase from the plan?')
      )
    )
      return;
    savePhases(dietPhaseSaveInputs(phases).filter((p) => p.id !== phase.id));
  };

  const handleEndToday = (phase: DietPhase) => {
    savePhases(
      dietPhaseSaveInputs(phases).map((p) =>
        p.id === phase.id ? { ...p, end_date: today, duration_weeks: null } : p
      )
    );
  };

  const handleAdd = () => {
    const last = phases[phases.length - 1];
    const lastEnd = last?.effective_end_date;
    const start =
      lastEnd && compareDays(addDays(lastEnd, 1), today) > 0
        ? addDays(lastEnd, 1)
        : today;
    setEditing({
      phase_type: 'loss',
      weekly_change_kg: 0.5,
      start_date: start,
      end_date: null,
      duration_weeks: 8,
      target_weight_kg: null,
      label: null,
    });
  };

  // Timeline: from the first phase start (or today) to the last end.
  const timelineStart = phases[0]?.start_date ?? today;
  const timelineEnd = phases.reduce((end, phase) => {
    const phaseEnd =
      phase.effective_end_date ??
      addDays(
        compareDays(phase.start_date, today) > 0 ? phase.start_date : today,
        OPEN_PHASE_DISPLAY_DAYS
      );
    return compareDays(phaseEnd, end) > 0 ? phaseEnd : end;
  }, today);
  const totalDays = Math.max(1, daysBetween(timelineStart, timelineEnd) + 1);
  const offset = (day: string) =>
    (Math.min(Math.max(daysBetween(timelineStart, day), 0), totalDays) /
      totalDays) *
    100;

  const current = status.current;
  const next = status.next;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-2xl font-bold">
          {t('goals.dietPhases.title', 'Diet Phases')}
        </CardTitle>
        {canEdit && (
          <Button size="sm" onClick={handleAdd}>
            <PlusCircle className="w-4 h-4 mr-2" />
            {t('goals.dietPhases.addPhase', 'Add phase')}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {t(
            'goals.dietPhases.description',
            'Plan cut, maintenance and gain phases by date. During a phase its weekly weight change replaces your Goal Mode; days outside every phase use your Goal Mode from Calculation Settings. Weekly goal plans and presets still choose the day’s base goal, and calorie cycling still spreads the week.'
          )}
        </p>

        {status.change_soon && status.change_on && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>
              {t('goals.dietPhases.changeSoonTitle', 'Phase change coming up')}
            </AlertTitle>
            <AlertDescription>
              {next && compareDays(next.start_date, status.change_on) === 0
                ? t(
                    'goals.dietPhases.changeSoonNext',
                    '{{name}} starts on {{date}}, in {{count}} days.',
                    {
                      name: phaseName(next),
                      date: formatDateInUserTimezone(status.change_on),
                      count: status.days_until_change ?? 0,
                    }
                  )
                : t(
                    'goals.dietPhases.changeSoonBase',
                    'From {{date}} ({{count}} days) your Goal Mode from Calculation Settings applies again.',
                    {
                      date: formatDateInUserTimezone(status.change_on),
                      count: status.days_until_change ?? 0,
                    }
                  )}
            </AlertDescription>
          </Alert>
        )}

        <div className="rounded-md border p-3 text-sm">
          {current ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2 font-semibold">
                <Flag className="h-4 w-4" />
                {t('goals.dietPhases.currentPhase', 'Current phase: {{name}}', {
                  name: phaseName(current),
                })}
                <Badge variant="secondary">
                  {typeLabel(current.phase_type)}
                </Badge>
              </div>
              <div className="text-muted-foreground">
                {[
                  rateText(current),
                  status.days_left !== null
                    ? t('goals.dietPhases.daysLeft', '{{count}} days left', {
                        count: status.days_left,
                      })
                    : t(
                        'goals.dietPhases.untilTarget',
                        'Until your trend reaches {{weight}}',
                        { weight: weightText(current.target_weight_kg ?? 0) }
                      ),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </div>
          ) : (
            <div className="text-muted-foreground">
              {t(
                'goals.dietPhases.noCurrentPhase',
                'No phase today: your Goal Mode from Calculation Settings applies.'
              )}
            </div>
          )}
          {next && (
            <div className="mt-2 text-muted-foreground">
              {t('goals.dietPhases.nextPhase', 'Next: {{name}} from {{date}}', {
                name: phaseName(next),
                date: formatDateInUserTimezone(next.start_date),
              })}
            </div>
          )}
        </div>

        {phases.length === 0 ? (
          <p className="text-gray-500">
            {t(
              'goals.dietPhases.empty',
              'No diet phases planned. Your Goal Mode applies every day.'
            )}
          </p>
        ) : (
          <>
            <div
              className="relative h-6 w-full overflow-hidden rounded bg-muted"
              role="img"
              aria-label={t('goals.dietPhases.timeline', 'Phase timeline')}
            >
              {phases.map((phase) => {
                const end = phase.effective_end_date ?? timelineEnd;
                const left = offset(phase.start_date);
                const width = Math.max(offset(addDays(end, 1)) - left, 0.5);
                return (
                  <div
                    key={phase.id}
                    title={phaseName(phase)}
                    className={`absolute top-0 h-full ${PHASE_COLORS[phase.phase_type]}`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                  />
                );
              })}
              <div
                className="absolute top-0 h-full w-0.5 bg-foreground"
                style={{ left: `${offset(today)}%` }}
                title={t('goals.dietPhases.today', 'Today')}
              />
            </div>
            <div className="space-y-2">
              {phases.map((phase) => {
                const started = dietPhaseHasStarted(phase, today);
                const isCurrent = phase.id === current?.id;
                const ended =
                  phase.effective_end_date !== null &&
                  compareDays(phase.effective_end_date, today) < 0;
                return (
                  <div
                    key={phase.id}
                    className="flex items-center justify-between rounded-md border p-3"
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`mt-1.5 h-3 w-3 rounded-full ${PHASE_COLORS[phase.phase_type]}`}
                      />
                      <div>
                        <div className="font-semibold">
                          {phaseName(phase)}{' '}
                          {isCurrent && (
                            <Badge variant="secondary">
                              {t('goals.goalsSettings.active', 'Active')}
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-gray-600">
                          {phase.effective_end_date
                            ? t(
                                'goals.goalsSettings.startDateToEndDate',
                                '{{start_date}} to {{end_date}}',
                                {
                                  start_date: formatDateInUserTimezone(
                                    phase.start_date
                                  ),
                                  end_date: formatDateInUserTimezone(
                                    phase.effective_end_date
                                  ),
                                }
                              )
                            : t(
                                'goals.dietPhases.rangeOpen',
                                'From {{start}} until the target is reached',
                                {
                                  start: formatDateInUserTimezone(
                                    phase.start_date
                                  ),
                                }
                              )}
                        </div>
                        <div className="text-sm text-gray-600">
                          {[
                            typeLabel(phase.phase_type),
                            rateText(phase),
                            phase.target_weight_kg !== null
                              ? t(
                                  'goals.dietPhases.target',
                                  'Target {{weight}}',
                                  {
                                    weight: weightText(phase.target_weight_kg),
                                  }
                                )
                              : '',
                            phase.target_reached_on
                              ? t(
                                  'goals.dietPhases.reachedOn',
                                  'Reached on {{date}}',
                                  {
                                    date: formatDateInUserTimezone(
                                      phase.target_reached_on
                                    ),
                                  }
                                )
                              : '',
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                      </div>
                    </div>
                    {canEdit && !ended && (
                      <div className="flex flex-wrap justify-end gap-2">
                        {isCurrent && started && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={saving}
                            onClick={() => handleEndToday(phase)}
                          >
                            {t('goals.dietPhases.endToday', 'End today')}
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={saving}
                          onClick={() => setEditing(phase)}
                        >
                          <Edit className="w-4 h-4" />{' '}
                          {t('goals.goalsSettings.edit', 'Edit')}
                        </Button>
                        {!started && (
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={saving}
                            onClick={() => handleDelete(phase)}
                          >
                            <Trash2 className="w-4 h-4" />{' '}
                            {t('goals.goalsSettings.delete', 'Delete')}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
      {editing && (
        <DietPhaseDialog
          open
          onOpenChange={(open) => !open && setEditing(null)}
          phase={editing}
          today={today}
          saving={saving}
          onSave={handleSavePhase}
        />
      )}
    </Card>
  );
};
