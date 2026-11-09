import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  HEART_RATE_ZONE_COLORS,
  computeTimeInPowerZones,
  estimateCriticalPower,
  runningPowerZoneFloors,
  summarizeRunningDynamics,
  summarizeRunningPower,
  type RunSensorPoint,
} from '@workspace/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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
  const criticalPower = useMemo(() => estimateCriticalPower(points), [points]);
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
              {t('reports.activityReport.runPower.zonesBasis', {
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
