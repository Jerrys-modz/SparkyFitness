import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { localizeMuscle } from '@/utils/exerciseTaxonomy';
import type {
  DeloadReason,
  StrengthVolume,
  VolumeStatus,
} from '@workspace/shared';

interface StrengthVolumeCardProps {
  data: StrengthVolume | undefined;
}

const STATUS_STYLE: Record<VolumeStatus, string> = {
  under: 'text-amber-600',
  inRange: 'text-green-600',
  over: 'text-red-600',
  building: 'text-muted-foreground',
};

const StrengthVolumeCard = ({ data }: StrengthVolumeCardProps) => {
  const { t } = useTranslation();
  if (!data) return null;
  const { range, deload } = data;

  const statusLabel = (status: VolumeStatus) =>
    t(`strengthVolume.status.${status}`, status);
  const reasonText = (reason: DeloadReason) => {
    const items = reason.items
      .map((item) => localizeMuscle(t, item))
      .join(', ');
    return t(`strengthVolume.reason.${reason.code}`, {
      value:
        reason.code === 'rpe_rising' && reason.value != null
          ? reason.value / 10
          : reason.value,
      // Lift names are the person's own; only muscle names are translated.
      items: reason.code === 'high_volume' ? items : reason.items.join(', '),
      max: range.max,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t('strengthVolume.title', 'Weekly Muscle Volume')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          {t('strengthVolume.subtitle', {
            min: range.min,
            max: range.max,
            defaultValue:
              'Hard sets per muscle against {{min}} to {{max}} a week.',
          })}
        </p>

        {data.muscles.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {t(
              'strengthVolume.noSets',
              'No hard sets logged in the last few weeks.'
            )}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="text-left font-normal">
                  {t('strengthVolume.muscle', 'Muscle')}
                </th>
                <th className="text-right font-normal">
                  {t('strengthVolume.thisWeek', 'This week')}
                </th>
                <th className="text-right font-normal">
                  {t('strengthVolume.lastWeek', 'Last week')}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.muscles.map((row) => (
                <tr key={row.muscle} className="border-t">
                  <td className="py-1.5">{localizeMuscle(t, row.muscle)}</td>
                  <td className="py-1.5 text-right">
                    <span className="font-semibold">{row.thisWeek}</span>{' '}
                    <span
                      className={`text-xs ${STATUS_STYLE[row.thisWeekStatus]}`}
                    >
                      {statusLabel(row.thisWeekStatus)}
                    </span>
                  </td>
                  <td className="py-1.5 text-right">
                    <span className="text-muted-foreground">
                      {row.lastWeek}
                    </span>{' '}
                    <span
                      className={`text-xs ${STATUS_STYLE[row.lastWeekStatus]}`}
                    >
                      {statusLabel(row.lastWeekStatus)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="rounded-md border p-3 space-y-2 text-sm">
          {deload.status === 'suggest' && deload.plan ? (
            <>
              <div className="font-semibold">
                {t('strengthVolume.deload.title', 'Consider a lighter week')}
              </div>
              <p>
                {t('strengthVolume.deload.intro', {
                  weekStart: deload.plan.weekStart,
                  setsMin: deload.plan.setsPercent.min,
                  setsMax: deload.plan.setsPercent.max,
                  loadMin: deload.plan.loadPercent.min,
                  loadMax: deload.plan.loadPercent.max,
                })}
              </p>
              <ul className="list-disc pl-5 text-muted-foreground">
                {deload.reasons.map((reason) => (
                  <li key={reason.code}>{reasonText(reason)}</li>
                ))}
              </ul>
              {deload.plan.muscleTargets.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  {t('strengthVolume.deload.targets', 'Hard sets per muscle')}:{' '}
                  {deload.plan.muscleTargets
                    .slice(0, 6)
                    .map(
                      (target) =>
                        `${localizeMuscle(t, target.muscle)} ${target.from}-${target.to}`
                    )
                    .join(', ')}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {t('strengthVolume.deload.adviceOnly')}
              </p>
            </>
          ) : (
            <p className="text-muted-foreground">
              {t(`strengthVolume.deload.${deload.status}`)}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default StrengthVolumeCard;
