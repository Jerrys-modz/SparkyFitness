import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Flag, PartyPopper, Scale } from 'lucide-react';
import {
  isDayString,
  milestonesToCelebrate,
  todayInZone,
  type WeightProgressStartSource,
} from '@workspace/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useWeightProgress } from '@/hooks/Reports/useWeightProgress';
import { formatWeight } from '@/utils/numberFormatting';
import {
  milestoneLabel,
  signedPercent,
  signedWeight,
} from './weightProgressCopy';

interface WeightProgressCardProps {
  /** Profile goal weight in kg. */
  targetWeightKg: number | null;
}

/** How many reached milestones the card lists, newest first. */
const SHOWN_MILESTONES = 6;

const Stat = ({
  label,
  value,
  hint,
  testId,
}: {
  label: string;
  value: string;
  hint?: string;
  testId: string;
}) => (
  <div className="rounded-md border p-3" data-testid={testId}>
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="text-lg font-semibold">{value}</p>
    {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
  </div>
);

const WeightProgressCard = ({ targetWeightKg }: WeightProgressCardProps) => {
  const { t } = useTranslation();
  const {
    weightUnit,
    timezone,
    formatDateInUserTimezone,
    convertWeight,
    convertEnergy,
    energyUnit,
    getEnergyUnitString,
  } = usePreferences();
  const {
    isLoading,
    progress,
    milestones,
    energy,
    expenditureKcal,
    settings,
    updateSettings,
  } = useWeightProgress(targetWeightKg);
  const [editingStart, setEditingStart] = useState(false);

  const startDate = progress?.start.date ?? null;
  const achievedIds = useMemo(
    () => (milestones?.achieved ?? []).map((m) => m.id),
    [milestones]
  );
  const celebrate =
    milestones && startDate && !settings.milestonesHidden
      ? milestonesToCelebrate(milestones.achieved, startDate, settings.seen)
      : [];

  // First view of a start (or a new start): what is already reached is just
  // shown, not celebrated.
  useEffect(() => {
    if (isLoading || !milestones || !startDate) return;
    if (settings.seen?.startDate !== startDate) {
      updateSettings({ seen: { startDate, ids: achievedIds } });
    }
  }, [
    isLoading,
    milestones,
    startDate,
    achievedIds,
    settings.seen,
    updateSettings,
  ]);

  const date = (day: string) => formatDateInUserTimezone(day, 'PP');
  const sourceText = (source: WeightProgressStartSource) =>
    source === 'custom'
      ? t('reports.weightProgress.sourceCustom', 'start you chose')
      : source === 'onboarding'
        ? t('reports.weightProgress.sourceOnboarding', 'from your setup')
        : t('reports.weightProgress.sourceFirst', 'your first weigh-in');

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          {t('common.loading', 'Loading...')}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="weight-progress-card">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center text-base">
              <Scale className="mr-2 h-4 w-4" />
              {t('reports.weightProgress.title', 'Weight progress')}
            </CardTitle>
            {progress && (
              <p className="text-xs text-muted-foreground">
                {t(
                  'reports.weightProgress.startedOn',
                  'Since {{date}} ({{source}})',
                  {
                    date: date(progress.start.date),
                    source: sourceText(progress.start.source),
                  }
                )}
              </p>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditingStart(true)}
          >
            {t('reports.weightProgress.changeStart', 'Change start')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!progress ? (
          <p className="text-sm text-muted-foreground">
            {t(
              'reports.weightProgress.empty',
              'Log your weight to see your progress here.'
            )}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              <Stat
                testId="weight-progress-start"
                label={t(
                  'reports.weightProgress.startWeight',
                  'Starting weight'
                )}
                value={formatWeight(progress.start.weight, weightUnit)}
              />
              <Stat
                testId="weight-progress-change"
                label={t('reports.weightProgress.change', 'Change (trend)')}
                value={signedWeight(progress.totalChange, weightUnit)}
                hint={t('reports.weightProgress.now', 'Now {{weight}}', {
                  weight: formatWeight(progress.currentTrend, weightUnit),
                })}
              />
              <Stat
                testId="weight-progress-percent"
                label={t(
                  'reports.weightProgress.percentOfStart',
                  'Of starting weight'
                )}
                value={signedPercent(progress.percentChange)}
              />
              <Stat
                testId="weight-progress-goal"
                label={t('reports.weightProgress.towardGoal', 'Toward goal')}
                value={
                  progress.goal
                    ? `${Math.round(progress.goal.percentToGoal)}%`
                    : '-'
                }
                hint={
                  progress.goal
                    ? progress.goal.reached
                      ? t('reports.weightProgress.goalReached', 'Goal reached')
                      : t('reports.weightProgress.toGo', '{{weight}} to go', {
                          weight: formatWeight(
                            progress.goal.remaining,
                            weightUnit
                          ),
                        })
                    : t(
                        'reports.weightProgress.noGoal',
                        'Set a goal weight in Goals'
                      )
                }
              />
            </div>
            {progress.goal && (
              <Progress
                value={progress.goal.percentToGoal}
                className="h-2"
                aria-label={t(
                  'reports.weightProgress.towardGoal',
                  'Toward goal'
                )}
              />
            )}

            {milestones && !settings.milestonesHidden && (
              <section className="space-y-2" data-testid="weight-milestones">
                <div className="flex items-center justify-between">
                  <h3 className="flex items-center text-sm font-medium">
                    <Flag className="mr-2 h-4 w-4" />
                    {t('reports.weightProgress.milestones', 'Milestones')}
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => updateSettings({ milestonesHidden: true })}
                  >
                    {t(
                      'reports.weightProgress.hideMilestones',
                      'Hide milestones'
                    )}
                  </Button>
                </div>
                {celebrate.length > 0 && (
                  <div
                    className="flex items-start justify-between gap-2 rounded-md bg-primary/10 p-3 text-sm"
                    role="status"
                    data-testid="weight-milestone-celebration"
                  >
                    <span className="flex items-start">
                      <PartyPopper className="mr-2 mt-0.5 h-4 w-4 shrink-0" />
                      {t(
                        'reports.weightProgress.celebrate',
                        'Milestone reached: {{milestones}}',
                        {
                          milestones: celebrate
                            .map((m) => milestoneLabel(m, t))
                            .join(', '),
                        }
                      )}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        startDate &&
                        updateSettings({
                          seen: { startDate, ids: achievedIds },
                        })
                      }
                    >
                      {t('common.dismiss', 'Dismiss')}
                    </Button>
                  </div>
                )}
                {milestones.achieved.length > 0 ? (
                  <ul className="flex flex-wrap gap-2">
                    {[...milestones.achieved]
                      .reverse()
                      .slice(0, SHOWN_MILESTONES)
                      .map((m) => (
                        <li
                          key={m.id}
                          className="rounded-full border px-3 py-1 text-xs"
                        >
                          {milestoneLabel(m, t)}
                          {m.achievedOn && (
                            <span className="text-muted-foreground">
                              {' · '}
                              {date(m.achievedOn)}
                            </span>
                          )}
                        </li>
                      ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {t(
                      'reports.weightProgress.noneYet',
                      'No milestones reached yet.'
                    )}
                  </p>
                )}
                {milestones.next && milestones.toNext !== null && (
                  <p className="text-xs text-muted-foreground">
                    {t(
                      'reports.weightProgress.nextMilestone',
                      'Next: {{milestone}}, {{weight}} to go',
                      {
                        milestone: milestoneLabel(milestones.next, t),
                        weight: formatWeight(milestones.toNext, weightUnit),
                      }
                    )}
                  </p>
                )}
              </section>
            )}
            {milestones && settings.milestonesHidden && (
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0"
                onClick={() => updateSettings({ milestonesHidden: false })}
              >
                {t('reports.weightProgress.showMilestones', 'Show milestones')}
              </Button>
            )}

            {energy && expenditureKcal !== null && (
              <section className="space-y-2" data-testid="weight-fat-estimate">
                <h3 className="text-sm font-medium">
                  {t(
                    'reports.weightProgress.energyTitle',
                    'From your food log (estimate)'
                  )}
                </h3>
                {energy.enough ? (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <Stat
                        testId="weight-fat-estimated"
                        label={
                          energy.estimatedFatKg >= 0
                            ? t(
                                'reports.weightProgress.fatLost',
                                'Estimated fat lost'
                              )
                            : t(
                                'reports.weightProgress.fatGained',
                                'Estimated fat gained'
                              )
                        }
                        value={`~${formatWeight(
                          Math.abs(energy.estimatedFatKg),
                          weightUnit
                        )}`}
                      />
                      <Stat
                        testId="weight-fat-actual"
                        label={t(
                          'reports.weightProgress.actualChange',
                          'Trend change, same days'
                        )}
                        value={
                          energy.actualChangeKg === null
                            ? '-'
                            : signedWeight(energy.actualChangeKg, weightUnit)
                        }
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t(
                        'reports.weightProgress.energyNote',
                        'An estimate, not a measurement: {{days}} days with food logged between {{from}} and {{to}}, against an estimated expenditure of {{expenditure}} a day. Days without a food log are left out. Scale weight also moves with water and glycogen.',
                        {
                          days: energy.loggedDays,
                          from: date(energy.from),
                          to: date(energy.to),
                          expenditure: `${Math.round(
                            convertEnergy(expenditureKcal, 'kcal', energyUnit)
                          )} ${getEnergyUnitString(energyUnit)}`,
                        }
                      )}
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {t(
                      'reports.weightProgress.energyNotEnough',
                      'Log food on at least 7 days to see this estimate ({{days}} so far since {{from}}).',
                      { days: energy.loggedDays, from: date(energy.from) }
                    )}
                  </p>
                )}
              </section>
            )}
          </>
        )}
      </CardContent>
      {editingStart && (
        <StartDialog
          today={todayInZone(timezone)}
          weightUnit={weightUnit === 'kg' ? 'kg' : 'lbs'}
          initialDate={settings.customStart?.date ?? progress?.start.date ?? ''}
          initialWeight={
            settings.customStart?.weight
              ? convertWeight(
                  settings.customStart.weight,
                  'kg',
                  weightUnit === 'kg' ? 'kg' : 'lbs'
                )
              : null
          }
          onClose={() => setEditingStart(false)}
          onSave={(customStart) => {
            updateSettings({ customStart });
            setEditingStart(false);
          }}
          toKg={(value) =>
            convertWeight(value, weightUnit === 'kg' ? 'kg' : 'lbs', 'kg')
          }
        />
      )}
    </Card>
  );
};

interface StartDialogProps {
  today: string;
  weightUnit: 'kg' | 'lbs';
  initialDate: string;
  initialWeight: number | null;
  onClose: () => void;
  onSave: (start: { date: string; weight: number | null } | null) => void;
  toKg: (value: number) => number;
}

const StartDialog = ({
  today,
  weightUnit,
  initialDate,
  initialWeight,
  onClose,
  onSave,
  toKg,
}: StartDialogProps) => {
  const { t } = useTranslation();
  const [day, setDay] = useState(initialDate);
  const [weight, setWeight] = useState(
    initialWeight === null ? '' : String(Math.round(initialWeight * 10) / 10)
  );
  const parsedWeight = weight.trim() === '' ? null : Number(weight);
  const weightValid =
    parsedWeight === null ||
    (Number.isFinite(parsedWeight) && parsedWeight > 0);
  const dayValid = isDayString(day) && day <= today;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t('reports.weightProgress.startDialogTitle', 'Progress start')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'reports.weightProgress.startDialogDescription',
              'Count your progress from a day you choose. Leave the weight empty to use your trend on that day. Saved in this browser only.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="weight-progress-start-date">
              {t('reports.weightProgress.startDate', 'Start day')}
            </Label>
            <Input
              id="weight-progress-start-date"
              type="date"
              value={day}
              max={today}
              onChange={(e) => setDay(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="weight-progress-start-weight">
              {t(
                'reports.weightProgress.startWeightOptional',
                'Starting weight ({{unit}}, optional)',
                { unit: weightUnit }
              )}
            </Label>
            <Input
              id="weight-progress-start-weight"
              inputMode="decimal"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onSave(null)}>
            {t('reports.weightProgress.useDefaultStart', 'Use default start')}
          </Button>
          <Button
            disabled={!dayValid || !weightValid}
            onClick={() =>
              onSave({
                date: day,
                weight: parsedWeight === null ? null : toKg(parsedWeight),
              })
            }
          >
            {t('common.save', 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default WeightProgressCard;
