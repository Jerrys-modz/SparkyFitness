import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { parseISO } from 'date-fns';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ageFromDateOfBirth,
  rateVo2Max,
  vo2MaxFitnessAge,
  type Vo2MaxRating,
  type Vo2MaxSex,
} from '@workspace/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePreferences } from '@/contexts/PreferencesContext';
import { vo2MaxPoints } from './vo2MaxTrend';

interface Vo2MaxTrendCardProps {
  metrics: Parameters<typeof vo2MaxPoints>[0];
  /** Date of birth and gender from the profile; both are needed for a rating. */
  profile: { date_of_birth: string | null; gender: string | null } | undefined;
  /** Today in the person's timezone (YYYY-MM-DD). */
  today: string;
}

const RATING_LABELS: Record<Vo2MaxRating, string> = {
  poor: 'Poor',
  fair: 'Fair',
  good: 'Good',
  excellent: 'Excellent',
  superior: 'Superior',
};

/**
 * VO2 max readings from the person's watch or health source over the report's
 * dates, with how the latest compares for their age and sex. The rating and
 * the fitness age come from population norms and are a rough comparison, not
 * medical advice. Nothing shows without a reading.
 */
const Vo2MaxTrendCard = ({ metrics, profile, today }: Vo2MaxTrendCardProps) => {
  const { t } = useTranslation();
  const { formatDateInUserTimezone } = usePreferences();
  const points = useMemo(() => vo2MaxPoints(metrics), [metrics]);

  const chartData = useMemo(
    () =>
      points.map((point) => ({
        ...point,
        label: formatDateInUserTimezone(parseISO(point.date), 'MMM dd'),
      })),
    [points, formatDateInUserTimezone]
  );

  const latest = points[points.length - 1];
  const first = points[0];
  if (!latest || !first) return null;

  const sex: Vo2MaxSex | null =
    profile?.gender === 'male' || profile?.gender === 'female'
      ? profile.gender
      : null;
  const age = ageFromDateOfBirth(profile?.date_of_birth, today);
  const rating =
    sex && age !== null ? rateVo2Max(latest.value, age, sex) : null;
  const fitnessAge = sex ? vo2MaxFitnessAge(latest.value, sex) : null;
  const change =
    points.length > 1
      ? Math.round((latest.value - first.value) * 10) / 10
      : null;
  const decimal = (value: number) =>
    new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(
      value
    );

  return (
    <Card data-testid="vo2-max-trend">
      <CardHeader>
        <CardTitle>{t('vo2MaxTrend.title', 'VO₂ max')}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {t(
            'vo2MaxTrend.subtitle',
            'Readings from your watch or health source. The rating and fitness age compare you with the general population and are not medical advice.'
          )}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <div>
            <div className="text-2xl font-bold" data-testid="vo2-latest">
              {decimal(latest.value)}
            </div>
            <div className="text-xs text-muted-foreground">
              {t('vo2MaxTrend.unit', 'ml/kg/min')}
            </div>
          </div>
          {rating ? (
            <div data-testid="vo2-rating">
              <div className="text-lg font-semibold">
                {t(`vo2MaxTrend.rating.${rating}`, RATING_LABELS[rating])}
              </div>
              <div className="text-xs text-muted-foreground">
                {t('vo2MaxTrend.ratingFor', 'For your age and sex')}
              </div>
            </div>
          ) : (
            <div
              className="text-xs text-muted-foreground"
              data-testid="vo2-no-rating"
            >
              {t(
                'vo2MaxTrend.noRating',
                'Add your date of birth and sex (male or female) in your profile for a rating. Ratings cover ages 20 to 79.'
              )}
            </div>
          )}
          {fitnessAge ? (
            <div data-testid="vo2-fitness-age">
              <div className="text-lg font-semibold">
                {fitnessAge.limit === 'younger'
                  ? t('vo2MaxTrend.fitnessAgeYounger', {
                      age: fitnessAge.age,
                      defaultValue: '{{age}} or younger',
                    })
                  : fitnessAge.limit === 'older'
                    ? t('vo2MaxTrend.fitnessAgeOlder', {
                        age: fitnessAge.age,
                        defaultValue: '{{age}} or older',
                      })
                    : fitnessAge.age}
              </div>
              <div className="text-xs text-muted-foreground">
                {t('vo2MaxTrend.fitnessAge', 'Fitness age (estimate)')}
              </div>
            </div>
          ) : null}
          {change !== null ? (
            <div data-testid="vo2-change">
              <div className="text-lg font-semibold">
                {change > 0 ? '+' : ''}
                {decimal(change)}
              </div>
              <div className="text-xs text-muted-foreground">
                {t('vo2MaxTrend.change', 'Change over the dates shown')}
              </div>
            </div>
          ) : null}
        </div>
        {chartData.length > 1 ? (
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis
                  domain={['auto', 'auto']}
                  tick={{ fontSize: 11 }}
                  width={36}
                />
                <Tooltip
                  formatter={(value) => [
                    `${decimal(Number(value))} ${t('vo2MaxTrend.unit', 'ml/kg/min')}`,
                    t('vo2MaxTrend.title', 'VO₂ max'),
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};

export default Vo2MaxTrendCard;
