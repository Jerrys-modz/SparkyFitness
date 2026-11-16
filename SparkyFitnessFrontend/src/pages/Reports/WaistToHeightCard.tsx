import { useTranslation } from 'react-i18next';
import { Ruler } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  WAIST_TO_HEIGHT_BANDS,
  type WaistToHeightBand,
} from '@workspace/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useWaistToHeight } from '@/hooks/Reports/useWeightProgress';
import { formatMeasurement } from '@/utils/numberFormatting';

const BAND_CLASS: Record<WaistToHeightBand, string> = {
  lower: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  increased: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  high: 'bg-red-500/15 text-red-700 dark:text-red-300',
};

const ratioText = (ratio: number) => ratio.toFixed(2);

/** Waist-to-height ratio from the latest waist and height, with reference bands. */
const WaistToHeightCard = () => {
  const { t } = useTranslation();
  const { measurementUnit, convertMeasurement, formatDateInUserTimezone } =
    usePreferences();
  const { series, isLoading } = useWaistToHeight();
  const latest = series[series.length - 1];
  const lengthUnit = measurementUnit === 'ft_in' ? 'inches' : measurementUnit;
  const length = (cm: number) =>
    formatMeasurement(convertMeasurement(cm, 'cm', lengthUnit), lengthUnit);

  const bandLabel = (band: WaistToHeightBand) =>
    band === 'lower'
      ? t('reports.waistToHeight.bandLower', 'Lower risk')
      : band === 'increased'
        ? t('reports.waistToHeight.bandIncreased', 'Increased risk')
        : t('reports.waistToHeight.bandHigh', 'High risk');
  const bandRange = (band: WaistToHeightBand) => {
    const b = WAIST_TO_HEIGHT_BANDS.find((x) => x.band === band)!;
    return Number.isFinite(b.max)
      ? b.min === 0
        ? `< ${b.max.toFixed(1)}`
        : `${b.min.toFixed(1)} - ${(b.max - 0.01).toFixed(2)}`
      : `≥ ${b.min.toFixed(1)}`;
  };

  return (
    <Card data-testid="waist-to-height-card">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center text-base">
          <Ruler className="mr-2 h-4 w-4" />
          {t('reports.waistToHeight.title', 'Waist-to-height ratio')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">
            {t('common.loading', 'Loading...')}
          </p>
        ) : !latest ? (
          <p className="text-sm text-muted-foreground">
            {t(
              'reports.waistToHeight.empty',
              'Log your waist and height in Check-In to see this ratio.'
            )}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-3">
              <span
                className="text-3xl font-semibold"
                data-testid="waist-to-height-ratio"
              >
                {ratioText(latest.ratio)}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${BAND_CLASS[latest.band]}`}
              >
                {bandLabel(latest.band)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {t(
                'reports.waistToHeight.from',
                'Waist {{waist}} on {{date}}, height {{height}}',
                {
                  waist: length(latest.waist),
                  height: length(latest.height),
                  date: formatDateInUserTimezone(latest.date, 'PP'),
                }
              )}
            </p>
            <ul className="flex flex-wrap gap-2 text-xs">
              {WAIST_TO_HEIGHT_BANDS.map((b) => (
                <li
                  key={b.band}
                  className={`rounded-md px-2 py-1 ${BAND_CLASS[b.band]}`}
                >
                  {bandRange(b.band)}: {bandLabel(b.band)}
                </li>
              ))}
            </ul>
            {series.length > 1 && (
              <div className="h-40 min-w-0">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <LineChart data={series}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      fontSize={10}
                      tickFormatter={(d: string) =>
                        formatDateInUserTimezone(d, 'MMM d')
                      }
                    />
                    <YAxis
                      fontSize={10}
                      domain={['auto', 'auto']}
                      tickFormatter={ratioText}
                    />
                    <ReferenceLine
                      y={0.5}
                      stroke="#f59e0b"
                      strokeDasharray="4 3"
                    />
                    <ReferenceLine
                      y={0.6}
                      stroke="#ef4444"
                      strokeDasharray="4 3"
                    />
                    <Tooltip
                      labelFormatter={(d) =>
                        formatDateInUserTimezone(String(d), 'PP')
                      }
                      formatter={(value) => [
                        ratioText(Number(value)),
                        t('reports.waistToHeight.ratio', 'Ratio'),
                      ]}
                      contentStyle={{
                        backgroundColor: 'hsl(var(--background))',
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="ratio"
                      stroke="#6366f1"
                      strokeWidth={2}
                      dot={series.length < 30}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {t(
                'reports.waistToHeight.note',
                'Screening bands for adults (keep your waist under half your height). Not a diagnosis; they may not fit children, pregnancy or very muscular builds.'
              )}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default WaistToHeightCard;
