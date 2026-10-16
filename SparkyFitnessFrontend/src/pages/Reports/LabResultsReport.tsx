import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { FlaskConical } from 'lucide-react';
import {
  labRangeStatus,
  type CustomCategoriesResponse,
  type CustomMeasurementsResponse,
  type LabRangeStatus,
} from '@workspace/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ZoomableChart from '@/components/ZoomableChart';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  createDateTickFormatter,
  createTimeSyncMethod,
  getTimeXAxisProps,
  prepareTimeChartData,
  REPORTS_CHART_SYNC_ID,
} from '@/utils/chartUtils';

const STATUS_CLASS: Record<LabRangeStatus, string> = {
  low: 'text-amber-600',
  high: 'text-red-600',
  in_range: 'text-green-600',
  unknown: 'text-muted-foreground',
};

const RANGE_COLOR = '#22c55e';

interface LabPoint {
  date: string;
  value: number;
  notes?: string | null;
}

const formatRange = (
  low: number | null,
  high: number | null,
  unit: string
): string | null => {
  const suffix = unit ? ` ${unit}` : '';
  if (low !== null && high !== null) return `${low} - ${high}${suffix}`;
  if (high !== null) return `< ${high}${suffix}`;
  if (low !== null) return `> ${low}${suffix}`;
  return null;
};

/** Lab markers are numeric custom categories flagged `is_lab`. */
const isLabCategory = (category: CustomCategoriesResponse): boolean =>
  category.is_lab === true;

export const LabResultsReport = ({
  customCategories,
  customMeasurementsData,
}: {
  customCategories: CustomCategoriesResponse[];
  customMeasurementsData: CustomMeasurementsResponse[];
}) => {
  const { t } = useTranslation();
  const { chartScaleMode, formatDateInUserTimezone } = usePreferences();

  // One instance shared by every chart so the report's synced cursor and parse
  // cache behave like the other report charts.
  const syncMethod = useMemo(() => createTimeSyncMethod(), []);
  const formatChartDate = useMemo(
    () => createDateTickFormatter(formatDateInUserTimezone),
    [formatDateInUserTimezone]
  );

  const labCategories = customCategories.filter(isLabCategory);
  if (labCategories.length === 0) return null;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">
        {t('reports.labResultsTitle', 'Lab Results')}
      </h3>
      <p className="text-sm text-muted-foreground">
        {t(
          'reports.labResultsDisclaimer',
          'Reference ranges are editable general defaults and differ between labs. This is not medical advice.'
        )}
      </p>
      <div className="space-y-4">
        {labCategories.map((category) => {
          const unit = category.measurement_type;
          const low = category.ref_range_low;
          const high = category.ref_range_high;
          const label = category.display_name?.trim() || category.name;
          const rangeText = formatRange(low, high, unit);

          const points: LabPoint[] = customMeasurementsData
            .filter((m) => m.category_id === category.id)
            .flatMap((m) => {
              const value = parseFloat(m.value);
              return Number.isNaN(value)
                ? []
                : [{ date: m.entry_date, value, notes: m.notes }];
            })
            .sort((a, b) => a.date.localeCompare(b.date));
          const chartData = prepareTimeChartData(points, chartScaleMode);

          const latest = points.length > 0 ? points[points.length - 1] : null;
          const latestStatus: LabRangeStatus = latest
            ? labRangeStatus(latest.value, low, high)
            : 'unknown';

          const values = points.map((p) => p.value);
          const bounds = [
            ...values,
            ...(low !== null ? [low] : []),
            ...(high !== null ? [high] : []),
          ];
          const min = bounds.length ? Math.min(...bounds) : 0;
          const max = bounds.length ? Math.max(...bounds) : 1;
          const pad = (max - min || Math.abs(max) || 1) * 0.15;
          const domain: [number, number] = [Math.max(0, min - pad), max + pad];

          const statusLabel = (status: LabRangeStatus) =>
            status === 'low'
              ? t('reports.labStatusLow', 'Low')
              : status === 'high'
                ? t('reports.labStatusHigh', 'High')
                : status === 'in_range'
                  ? t('reports.labStatusInRange', 'In range')
                  : '';

          return (
            <ZoomableChart
              key={category.id}
              title={t(
                'reports.customMeasurementChartTitle',
                '{{categoryName}} ({{measurementType}})',
                { categoryName: label, measurementType: unit }
              )}
            >
              <Card>
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-x-3">
                    <span className="flex items-center">
                      <FlaskConical className="w-5 h-5 mr-2" />
                      {label} ({unit})
                    </span>
                    {latest && (
                      <span className="text-base font-normal">
                        {latest.value} {unit}{' '}
                        <span
                          className={`text-sm font-semibold ${STATUS_CLASS[latestStatus]}`}
                        >
                          {statusLabel(latestStatus)}
                        </span>
                      </span>
                    )}
                  </CardTitle>
                  {rangeText && (
                    <p className="text-sm text-muted-foreground">
                      {t(
                        'reports.labReferenceRange',
                        'Reference range: {{range}}',
                        {
                          range: rangeText,
                        }
                      )}
                    </p>
                  )}
                </CardHeader>
                <CardContent>
                  {points.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-6 text-center">
                      {t(
                        'reports.labNoResultsInPeriod',
                        'No results in this period.'
                      )}
                    </p>
                  ) : (
                    <div className="h-80 min-w-0">
                      <ResponsiveContainer
                        width="100%"
                        height="100%"
                        minWidth={0}
                        minHeight={0}
                        debounce={100}
                      >
                        <LineChart
                          data={chartData}
                          syncId={REPORTS_CHART_SYNC_ID}
                          syncMethod={syncMethod}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis
                            {...getTimeXAxisProps({
                              chartScaleMode,
                              formatDate: formatDateInUserTimezone,
                            })}
                          />
                          <YAxis type="number" domain={domain} />
                          {low !== null && high !== null ? (
                            <ReferenceArea
                              y1={low}
                              y2={high}
                              fill={RANGE_COLOR}
                              fillOpacity={0.12}
                              ifOverflow="extendDomain"
                            />
                          ) : (
                            <>
                              {low !== null && (
                                <ReferenceLine
                                  y={low}
                                  stroke={RANGE_COLOR}
                                  strokeDasharray="4 4"
                                />
                              )}
                              {high !== null && (
                                <ReferenceLine
                                  y={high}
                                  stroke={RANGE_COLOR}
                                  strokeDasharray="4 4"
                                />
                              )}
                            </>
                          )}
                          <Tooltip
                            content={({
                              active,
                              payload,
                              label: axisLabel,
                            }) => {
                              if (!active || !payload?.length) return null;
                              const point = payload[0]?.payload as LabPoint;
                              const status = labRangeStatus(
                                point.value,
                                low,
                                high
                              );
                              return (
                                <div className="p-2 bg-background border rounded-md shadow-md">
                                  <p className="label">
                                    {formatChartDate(axisLabel)}
                                  </p>
                                  <p className="intro">
                                    {point.value} {unit}{' '}
                                    <span
                                      className={`font-semibold ${STATUS_CLASS[status]}`}
                                    >
                                      {statusLabel(status)}
                                    </span>
                                  </p>
                                  {!!point.notes && (
                                    <p
                                      className="desc"
                                      style={{ marginTop: '5px' }}
                                    >
                                      {t('reports.notes', 'Notes: ') +
                                        point.notes}
                                    </p>
                                  )}
                                </div>
                              );
                            }}
                          />
                          <Line
                            type="linear"
                            dataKey="value"
                            stroke="#8884d8"
                            strokeWidth={2}
                            dot
                            isAnimationActive={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>
            </ZoomableChart>
          );
        })}
      </div>
    </div>
  );
};
