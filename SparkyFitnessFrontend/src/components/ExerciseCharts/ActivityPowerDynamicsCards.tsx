import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  HEART_RATE_ZONE_COLORS,
  computeTimeInPowerZones,
  MAX_CRITICAL_POWER_WATTS,
  MIN_CRITICAL_POWER_WATTS,
  resolveCriticalPower,
  runningPowerZoneFloors,
  summarizeRunningDynamics,
  summarizeRunningPower,
  type RunSensorPoint,
} from '@workspace/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useRunningCriticalPower } from '@/hooks/Settings/usePreferences';

interface Props {
  points: readonly RunSensorPoint[];
}

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div>
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="text-base font-semibold">{value}</div>
  </div>
);

const formatMinutes = (seconds: number) =>
  seconds > 0 && seconds < 60 ? '<1 min' : `${Math.round(seconds / 60)} min`;

/** Power for one run: summary figures and, with a hard 20 minutes, power zones. */
export const ActivityPowerCard = ({ points }: Props) => {
  const { t } = useTranslation();
  const summary = useMemo(() => summarizeRunningPower(points), [points]);
  const { watts: setWatts, isSaving, save } = useRunningCriticalPower();
  const resolved = useMemo(
    () => resolveCriticalPower(setWatts, points),
    [setWatts, points]
  );
  const criticalPower = resolved?.watts ?? null;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const parsed = Number(draft);
  const draftValid =
    Number.isInteger(parsed) &&
    parsed >= MIN_CRITICAL_POWER_WATTS &&
    parsed <= MAX_CRITICAL_POWER_WATTS;
  const saveWatts = (watts: number | null) =>
    save(watts, () => setEditing(false));
  const zones = useMemo(
    () =>
      criticalPower ? computeTimeInPowerZones(points, criticalPower) : null,
    [points, criticalPower]
  );
  if (!summary) return null;
  const floors = criticalPower ? runningPowerZoneFloors(criticalPower) : [];
  const total = zones?.reduce((sum, s) => sum + s, 0) ?? 0;

  return (
    <Card className="mb-8" data-testid="activity-power-card">
      <CardHeader>
        <CardTitle className="text-sm">
          {t('reports.activityReport.runPower.title')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-4">
          <Stat
            label={t('reports.activityReport.runPower.average')}
            value={`${summary.averageWatts} W`}
          />
          <Stat
            label={t('reports.activityReport.runPower.max')}
            value={`${summary.maxWatts} W`}
          />
          {summary.normalizedWatts !== null && (
            <Stat
              label={t('reports.activityReport.runPower.normalized')}
              value={`${summary.normalizedWatts} W`}
            />
          )}
          {summary.variabilityIndex !== null && (
            <Stat
              label={t('reports.activityReport.runPower.variability')}
              value={summary.variabilityIndex.toFixed(2)}
            />
          )}
          {summary.decouplingPercent !== null && (
            <Stat
              label={t('reports.activityReport.runPower.decoupling')}
              value={`${summary.decouplingPercent}%`}
            />
          )}
        </div>
        {zones && criticalPower && total > 0 && (
          <div data-testid="activity-power-zones">
            <div className="text-sm font-semibold">
              {t('reports.activityReport.runPower.zones')}
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              {resolved?.source === 'set'
                ? t('reports.activityReport.runPower.zonesBasisSet', {
                    watts: criticalPower,
                  })
                : t('reports.activityReport.runPower.zonesBasis', {
                    watts: criticalPower,
                  })}
            </p>
            {zones.map((seconds, index) => (
              <div key={index} className="mb-2">
                <div className="flex justify-between text-sm mb-1">
                  <span>
                    {`Zone ${index + 1} `}
                    <span className="text-xs text-muted-foreground">
                      {t('reports.activityReport.runPower.zoneFrom', {
                        watts: floors[index] ?? 0,
                      })}
                    </span>
                  </span>
                  <span className="text-muted-foreground">
                    {formatMinutes(seconds)}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-2 rounded-full"
                    style={{
                      width: `${Math.round((seconds / total) * 100)}%`,
                      backgroundColor: HEART_RATE_ZONE_COLORS[index],
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-4" data-testid="activity-critical-power">
          {editing ? (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="number"
                inputMode="numeric"
                className="w-32"
                value={draft}
                min={MIN_CRITICAL_POWER_WATTS}
                max={MAX_CRITICAL_POWER_WATTS}
                aria-label={t('reports.activityReport.runPower.criticalPower')}
                data-testid="activity-critical-power-input"
                onChange={(event) => setDraft(event.target.value)}
              />
              <Button
                size="sm"
                disabled={!draftValid || isSaving}
                data-testid="activity-critical-power-save"
                onClick={() => saveWatts(parsed)}
              >
                {t('common.save')}
              </Button>
              {setWatts !== null && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={isSaving}
                  data-testid="activity-critical-power-clear"
                  onClick={() => saveWatts(null)}
                >
                  {t('reports.activityReport.runPower.useEstimate')}
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditing(false)}
              >
                {t('common.cancel')}
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              data-testid="activity-critical-power-edit"
              onClick={() => {
                setDraft(setWatts !== null ? String(setWatts) : '');
                setEditing(true);
              }}
            >
              {setWatts !== null
                ? t('reports.activityReport.runPower.changeCriticalPower')
                : t('reports.activityReport.runPower.setCriticalPower')}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

/** Ground contact, vertical oscillation, stride length and the vertical ratio. */
export const ActivityDynamicsCard = ({ points }: Props) => {
  const { t } = useTranslation();
  const summary = useMemo(() => summarizeRunningDynamics(points), [points]);
  if (!summary) return null;

  const rows: { key: string; label: string; value: string }[] = [];
  if (summary.groundContactMs !== null)
    rows.push({
      key: 'gct',
      label: t('reports.activityReport.runDynamics.groundContact'),
      value: `${summary.groundContactMs} ms`,
    });
  if (summary.verticalOscillationMm !== null)
    rows.push({
      key: 'vo',
      label: t('reports.activityReport.runDynamics.verticalOscillation'),
      value: `${summary.verticalOscillationMm} mm`,
    });
  if (summary.strideLengthCm !== null)
    rows.push({
      key: 'stride',
      label: t('reports.activityReport.runDynamics.strideLength'),
      value: `${summary.strideLengthCm} cm`,
    });
  if (summary.verticalRatioPercent !== null)
    rows.push({
      key: 'ratio',
      label: t('reports.activityReport.runDynamics.verticalRatio'),
      value: `${summary.verticalRatioPercent}%`,
    });
  if (summary.groundContactDriftPercent !== null)
    rows.push({
      key: 'drift',
      label: t('reports.activityReport.runDynamics.groundContactDrift'),
      value: `${summary.groundContactDriftPercent > 0 ? '+' : ''}${summary.groundContactDriftPercent}%`,
    });

  return (
    <Card className="mb-8" data-testid="activity-dynamics-card">
      <CardHeader>
        <CardTitle className="text-sm">
          {t('reports.activityReport.runDynamics.title')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-3">
          {rows.map((row) => (
            <Stat key={row.key} label={row.label} value={row.value} />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {t('reports.activityReport.runDynamics.note')}
        </p>
      </CardContent>
    </Card>
  );
};
