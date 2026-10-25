import { useTranslation } from 'react-i18next';
import {
  BEST_EFFORT_IDS,
  formatRaceTime,
  type BestEffortBoardItem,
  type BestEffortId,
} from '@workspace/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const METERS_PER_MILE = 1609.344;

interface BestEffortsCardProps {
  efforts: readonly BestEffortBoardItem[];
  distanceUnit: 'km' | 'miles';
  runsAnalyzed: number;
  truncated: boolean;
  /** Formats a YYYY-MM-DD day in the person's timezone. */
  formatDay: (day: string) => string;
}

/**
 * The fastest stretch of each distance found inside any run. The short
 * distance follows the person's unit (1 km or 1 mile); distances no run
 * reaches yet are left out.
 */
export const BestEffortsCard = ({
  efforts,
  distanceUnit,
  runsAnalyzed,
  truncated,
  formatDay,
}: BestEffortsCardProps) => {
  const { t } = useTranslation();
  const label: Record<BestEffortId, string> = {
    '1k': t('exerciseAnalytics.cardio.bestEfforts.d1k', '1 km'),
    '1mi': t('exerciseAnalytics.cardio.bestEfforts.d1mi', '1 mile'),
    '5k': t('exerciseAnalytics.cardio.bestEfforts.d5k', '5 km'),
    '10k': t('exerciseAnalytics.cardio.bestEfforts.d10k', '10 km'),
    half_marathon: t(
      'exerciseAnalytics.cardio.bestEfforts.dHalf',
      'Half marathon'
    ),
  };
  const hiddenShort: BestEffortId = distanceUnit === 'miles' ? '1k' : '1mi';
  const rows = BEST_EFFORT_IDS.filter((id) => id !== hiddenShort)
    .map((id) => efforts.find((effort) => effort.id === id))
    .filter((effort): effort is BestEffortBoardItem => effort !== undefined);
  const unitMeters = distanceUnit === 'miles' ? METERS_PER_MILE : 1000;
  const paceUnit =
    distanceUnit === 'miles'
      ? t('exerciseAnalytics.cardio.bestEfforts.perMile', '/mi')
      : t('exerciseAnalytics.cardio.bestEfforts.perKm', '/km');

  return (
    <Card className="shadow-sm border" data-testid="best-efforts">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">
          {t('exerciseAnalytics.cardio.bestEfforts.title', 'Best efforts')}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {t(
            'exerciseAnalytics.cardio.bestEfforts.subtitle',
            'Your fastest stretch of each distance, found inside any run.'
          )}
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t(
              'exerciseAnalytics.cardio.bestEfforts.empty',
              'Record or sync a run with a GPS route of at least 1 km to see your best efforts.'
            )}
          </p>
        ) : (
          rows.map((effort) => (
            <div
              key={effort.id}
              data-testid={`best-effort-${effort.id}`}
              className="flex items-center justify-between"
            >
              <div>
                <p className="text-sm font-semibold">{label[effort.id]}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDay(effort.achievedAt)}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold">
                  {formatRaceTime(effort.seconds)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatRaceTime(
                    (effort.seconds / effort.distanceMeters) * unitMeters
                  )}{' '}
                  {paceUnit}
                </p>
              </div>
            </div>
          ))
        )}
        <p className="text-xs text-muted-foreground">
          {truncated
            ? t(
                'exerciseAnalytics.cardio.bestEfforts.truncated',
                'Searched your {{count}} most recent runs with a route.',
                { count: runsAnalyzed }
              )
            : t(
                'exerciseAnalytics.cardio.bestEfforts.hint',
                'Searched {{count}} runs with a route. A stretch never spans a pause or a gap in the recording.',
                { count: runsAnalyzed }
              )}
        </p>
      </CardContent>
    </Card>
  );
};
