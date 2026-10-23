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
import {
  type CompareSinceResponse,
  compareDisplayValue,
  sinceChartData,
} from '@workspace/shared';
import { Card, CardContent } from '@/components/ui/card';
import ZoomableChart from '@/components/ZoomableChart';
import { usePreferences } from '@/contexts/PreferencesContext';
import { ChartErrorBoundary } from '@/pages/Errors/ChartErrorFallback';
import { compareShownAmountText, compareValueText } from './compareCopy';
import { COMPARE_METRIC_LABELS } from './compareMetricLabels';

interface CompareSinceChartProps {
  response: CompareSinceResponse;
}

const TOOLTIP_STYLE = {
  backgroundColor: 'hsl(var(--background))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '6px',
  color: 'hsl(var(--foreground))',
};
const COLOR_VALUE = '#8884d8';
const COLOR_BEFORE = '#64748b';
const COLOR_SINCE = '#14b8a6';
const MUTED = 'hsl(var(--muted-foreground))';

interface TooltipProps {
  active?: boolean;
  payload?: readonly { payload?: { day: string; value: number | null } }[];
}

/**
 * The outcome day by day, the before and since stretches shaded apart with
 * their averages, a marker where the start day begins and the line dashed
 * across. Nothing until there is a since stretch; a yes/no outcome has no line.
 */
export const CompareSinceChart = ({ response }: CompareSinceChartProps) => {
  const { t } = useTranslation();
  const { formatDateInUserTimezone, timeFormat } = usePreferences();
  const chart = useMemo(() => sinceChartData(response), [response]);
  const { rows, before, since, start, line } = chart;
  if (rows.length === 0) return null;

  const key = response.outcome.key;
  const metric = COMPARE_METRIC_LABELS[key](t);
  const formatDay = (index: number) => {
    const day = rows[index]?.day;
    return day ? formatDateInUserTimezone(day, 'MMM dd') : '';
  };
  // Chart values are already on the display scale; only bedtime needs a clock.
  const shown = (value: number | null) =>
    value === null
      ? '–'
      : key === 'bedtime'
        ? compareValueText(key, value, timeFormat)
        : compareShownAmountText(key, value);
  const title = metric;

  const stretches = [
    {
      id: 'before',
      span: before,
      mean: response.result.before?.mean,
      color: COLOR_BEFORE,
      label: t('compareReport.since.chartBefore', { defaultValue: 'Before' }),
    },
    {
      id: 'since',
      span: since,
      mean: response.result.since?.mean,
      color: COLOR_SINCE,
      label: t('compareReport.since.chartSince', { defaultValue: 'Since' }),
    },
  ];

  const renderTooltip = ({ active, payload }: TooltipProps) => {
    const row = payload?.[0]?.payload;
    if (!active || !row) return null;
    return (
      <div className="p-2 text-xs shadow-sm" style={TOOLTIP_STYLE}>
        <p className="mb-1 font-medium">
          {formatDateInUserTimezone(row.day, 'PP')}
        </p>
        <p>
          {metric}: {shown(row.value)}
        </p>
      </div>
    );
  };

  return (
    <ChartErrorBoundary>
      <ZoomableChart title={title}>
        {(isMaximized, zoomLevel) => (
          <Card className={isMaximized ? 'flex h-full flex-col' : ''}>
            <CardContent
              className={`grow min-h-0 pt-6 ${isMaximized ? 'flex flex-col' : ''}`}
            >
              <div
                role="img"
                aria-label={t('compareReport.since.chartLabel', {
                  defaultValue:
                    '{{metric}} over time, before and since {{start}}',
                  metric,
                  start: formatDateInUserTimezone(
                    response.result.start ?? '',
                    'PP'
                  ),
                })}
                className={(isMaximized ? 'grow min-h-0' : 'h-64') + ' min-w-0'}
              >
                <ResponsiveContainer
                  width={isMaximized ? `${100 * zoomLevel}%` : '100%'}
                  height="100%"
                  minWidth={0}
                  minHeight={0}
                  debounce={100}
                >
                  <LineChart data={rows}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border))"
                    />
                    <XAxis
                      type="number"
                      dataKey="index"
                      domain={[0, rows.length - 1]}
                      fontSize={10}
                      stroke={MUTED}
                      tick={{ fill: MUTED }}
                      tickFormatter={formatDay}
                      minTickGap={24}
                    />
                    <YAxis
                      fontSize={10}
                      stroke={MUTED}
                      tick={{ fill: MUTED }}
                      tickFormatter={shown}
                      width={48}
                      domain={['auto', 'auto']}
                    />
                    <Tooltip content={renderTooltip} />
                    {stretches.map(
                      (s) =>
                        s.span && (
                          <ReferenceArea
                            key={s.id}
                            x1={s.span.from}
                            x2={s.span.to}
                            fill={s.color}
                            fillOpacity={0.15}
                            stroke="none"
                            label={{
                              value: s.label,
                              position: 'insideTopLeft',
                              fill: MUTED,
                              fontSize: 10,
                            }}
                          />
                        )
                    )}
                    {start !== null && (
                      <ReferenceLine
                        x={start}
                        stroke={MUTED}
                        strokeWidth={1.5}
                      />
                    )}
                    {stretches.map((s) =>
                      s.span && s.mean !== undefined ? (
                        <ReferenceLine
                          key={`${s.id}-mean`}
                          segment={[
                            {
                              x: s.span.from,
                              y: compareDisplayValue(key, s.mean),
                            },
                            {
                              x: s.span.to,
                              y: compareDisplayValue(key, s.mean),
                            },
                          ]}
                          stroke={s.color}
                          strokeWidth={2}
                        />
                      ) : null
                    )}
                    {line !== null && (
                      <ReferenceLine
                        y={line}
                        stroke={MUTED}
                        strokeDasharray="6 4"
                        label={{
                          value: t('compareReport.since.chartLine', {
                            defaultValue: 'Line {{line}}',
                            line: compareValueText(
                              key,
                              response.result.line,
                              timeFormat
                            ),
                          }),
                          position: 'insideBottomRight',
                          fill: MUTED,
                          fontSize: 10,
                        }}
                      />
                    )}
                    <Line
                      type="monotone"
                      dataKey="value"
                      name={metric}
                      stroke={COLOR_VALUE}
                      strokeWidth={1.5}
                      dot={false}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}
      </ZoomableChart>
    </ChartErrorBoundary>
  );
};
