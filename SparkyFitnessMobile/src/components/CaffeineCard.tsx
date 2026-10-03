import React, { useCallback, useMemo, useState } from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Area, CartesianChart, Line } from 'victory-native';
import {
  Circle,
  DashPathEffect,
  Line as SkiaLine,
} from '@shopify/react-native-skia';
import { useCSSVariable } from 'uniwind';
import {
  activeCaffeineAt,
  caffeineCurve,
  caffeineCutoff,
  thresholdCrossingTime,
} from '@workspace/shared';
import type { CaffeineActiveResponse } from '@workspace/shared';
import { makeChartFont, CHART_LABEL_FONT_SIZE } from './charts/chartFormatting';
import LineSeriesMark from './charts/LineSeriesMark';
import ChartTouchOverlay, {
  ChartLayoutReporter,
  EMPTY_CHART_TOUCH_LAYOUT,
  type ChartTouchLayout,
} from './ChartTouchOverlay';
import { usePreferences } from '../hooks/usePreferences';
import {
  formatDateToTimeLabel,
  formatTimeLabel,
} from '../utils/entryTimeDisplay';

const font = makeChartFont(CHART_LABEL_FONT_SIZE);

// Same palette as the web card, so the two read as one design.
const AMBER = '#d97706';
const AMBER_FILL = 'rgba(217, 119, 6, 0.18)';
const INDIGO = '#818cf8';
const SLATE = '#94a3b8';
const EMERALD = '#34d399';

type SleepImpact = 'minimal' | 'low' | 'moderate' | 'high';

/** Same bands as the web card's badge. */
const sleepImpactFor = (bedtimeMg: number): SleepImpact =>
  bedtimeMg < 25
    ? 'minimal'
    : bedtimeMg < 50
      ? 'low'
      : bedtimeMg < 100
        ? 'moderate'
        : 'high';

const SLEEP_IMPACT_STYLE: Record<SleepImpact, { bg: string; fg: string }> = {
  minimal: { bg: 'rgba(16, 185, 129, 0.15)', fg: '#34d399' },
  low: { bg: 'rgba(59, 130, 246, 0.15)', fg: '#60a5fa' },
  moderate: { bg: 'rgba(245, 158, 11, 0.15)', fg: '#fbbf24' },
  high: { bg: 'rgba(239, 68, 68, 0.15)', fg: '#f87171' },
};

type CaffeineCardProps = {
  kinetics: CaffeineActiveResponse | undefined;
  nowMs: number;
  isLoading: boolean;
};

/**
 * Mirrors the web Diary card: the circulating figure now, the projection at
 * bedtime, when another dose stops being affordable, and the curve joining
 * them. Every number comes from the shared kinetics helpers, so the two
 * platforms cannot drift apart.
 */
const CaffeineCard: React.FC<CaffeineCardProps> = ({
  kinetics,
  nowMs,
  isLoading,
}) => {
  const { t } = useTranslation();
  const { preferences } = usePreferences();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [touchLayout, setTouchLayout] = useState<ChartTouchLayout>(
    EMPTY_CHART_TOUCH_LAYOUT
  );
  const clearSelection = useCallback(() => setSelectedIndex(null), []);
  const [dangerColor, textMuted] = useCSSVariable([
    '--color-icon-danger',
    '--color-text-muted',
  ]) as [string, string];

  const clockLabel = (value: number | string | Date) => {
    const d = value instanceof Date ? value : new Date(value);
    return formatDateToTimeLabel(d, preferences?.time_format);
  };

  const bedtimeMs = kinetics ? new Date(kinetics.bedtime_at).getTime() : 0;

  // The plotted window belongs to the day on screen, and the wall clock must
  // never widen it: the card renders for whatever date the dashboard shows, so
  // on a past day `nowMs` sits outside the window and stretching the range to
  // reach it walked the whole span at 15-minute steps with no cap.
  const windowMs = useMemo(() => {
    if (!kinetics || kinetics.doses.length === 0) return null;
    const rawEnd = bedtimeMs + 2 * 60 * 60 * 1000;

    // The calendar start of the viewed day in local time
    const [bedtimeHourStr] = kinetics.target_bedtime.split(':');
    const bedtimeHour = parseInt(bedtimeHourStr ?? '22', 10);
    const bedtimeDate = new Date(kinetics.bedtime_at);
    const viewedYear = bedtimeDate.getFullYear();
    const viewedMonth = bedtimeDate.getMonth();
    const viewedDay =
      bedtimeDate.getDate() - (!isNaN(bedtimeHour) && bedtimeHour < 12 ? 1 : 0);
    const dayStartMs = new Date(
      viewedYear,
      viewedMonth,
      viewedDay,
      0,
      0,
      0,
      0
    ).getTime();
    const nowBelongsToDay = nowMs >= dayStartMs && nowMs <= rawEnd;

    const dayDoses = kinetics.doses.filter((dose) => {
      const ms = new Date(dose.at).getTime();
      return ms >= dayStartMs && ms <= rawEnd;
    });

    const firstDoseMs =
      dayDoses.length > 0
        ? dayDoses.reduce(
            (earliest, dose) => Math.min(earliest, new Date(dose.at).getTime()),
            Number.POSITIVE_INFINITY
          )
        : dayStartMs + 8 * 60 * 60 * 1000;
    const doseStart =
      dayDoses.length > 0 ? firstDoseMs - 60 * 60 * 1000 : firstDoseMs;
    const rawStart = nowBelongsToDay ? Math.min(doseStart, nowMs) : doseStart;

    // Align start to the top of the hour without local-time mutation
    const startDate = new Date(rawStart);
    const startRemainderMs =
      (startDate.getMinutes() * 60 + startDate.getSeconds()) * 1000 +
      startDate.getMilliseconds();
    const start = rawStart - startRemainderMs;

    // Align end to the top of the next hour without local-time mutation
    const endDate = new Date(rawEnd);
    const endRemainderMs =
      (endDate.getMinutes() * 60 + endDate.getSeconds()) * 1000 +
      endDate.getMilliseconds();
    const end =
      endRemainderMs === 0 ? rawEnd : rawEnd + (3600 * 1000 - endRemainderMs);

    return {
      start,
      end,
      nowBelongsToDay,
    };
  }, [kinetics, bedtimeMs, nowMs]);

  // "Now" on the day being viewed, otherwise that day's edge, so the active
  // figure describes the day on screen rather than this instant.
  const referenceMs =
    windowMs && !windowMs.nowBelongsToDay ? windowMs.end : nowMs;

  const chartData = useMemo(() => {
    if (!kinetics || kinetics.doses.length === 0 || !windowMs) return [];
    return caffeineCurve(
      kinetics.doses,
      windowMs.start,
      windowMs.end,
      kinetics.half_life_hours,
      15
    ).map((point) => ({
      ...point,
      // A constant series is how a threshold line is drawn here: victory-native
      // has no reference-line primitive.
      threshold: kinetics.threshold_mg,
    }));
  }, [kinetics, windowMs]);

  const crossingAt = useMemo(
    () =>
      kinetics
        ? thresholdCrossingTime(
            kinetics.doses,
            kinetics.half_life_hours,
            kinetics.threshold_mg
          )
        : null,
    [kinetics]
  );

  // The instant another dose stops fitting under the threshold. Recomputed
  // from the same helper the server answered with, like the web card.
  const cutoffMs = useMemo(() => {
    if (!kinetics) return null;
    const cutoff = caffeineCutoff({
      doses: kinetics.doses,
      bedtimeInstant: kinetics.bedtime_at,
      nowInstant: referenceMs,
      halfLifeHours: kinetics.half_life_hours,
      thresholdMg: kinetics.threshold_mg,
      doseMg: kinetics.cutoff_dose_mg,
    });
    if (cutoff.kind !== 'by' && cutoff.kind !== 'passed') return null;
    return new Date(cutoff.at).getTime();
  }, [kinetics, referenceMs]);

  if (isLoading || !kinetics || kinetics.doses.length === 0) {
    // A caffeine card on a day with no caffeine is noise, not information.
    return null;
  }

  const activeNowMg = activeCaffeineAt(
    kinetics.doses,
    referenceMs,
    kinetics.half_life_hours
  );

  const windowStart = windowMs?.start ?? 0;
  const windowEnd = windowMs?.end ?? 0;
  const nowIsInWindow = windowMs?.nowBelongsToDay ?? false;
  const cutoffInWindow =
    cutoffMs !== null && cutoffMs >= windowStart && cutoffMs <= windowEnd;
  const peakMg = chartData.reduce((max, point) => Math.max(max, point.mg), 0);
  const yMax = Math.ceil(Math.max(peakMg, kinetics.threshold_mg) * 1.15);
  const visibleDoses = kinetics.doses.filter((dose) => {
    const ms = new Date(dose.at).getTime();
    return ms >= windowStart && ms <= windowEnd;
  });
  const impact = sleepImpactFor(kinetics.at_bedtime_mg);
  const impactStyle = SLEEP_IMPACT_STYLE[impact];
  const impactLabel = {
    minimal: t('caffeine.sleepImpactMinimal', {
      defaultValue: 'Minimal sleep impact',
    }),
    low: t('caffeine.sleepImpactLow', { defaultValue: 'Low sleep impact' }),
    moderate: t('caffeine.sleepImpactModerate', {
      defaultValue: 'Moderate sleep impact',
    }),
    high: t('caffeine.sleepImpactHigh', { defaultValue: 'High sleep impact' }),
  }[impact];

  const bedtimeLabel =
    formatTimeLabel(kinetics.target_bedtime, preferences?.time_format) ??
    kinetics.target_bedtime;

  const selectedPoint =
    selectedIndex != null ? chartData[selectedIndex] : undefined;
  const tooltipText = selectedPoint
    ? t('caffeine.tooltip', {
        defaultValue: '{{time}} · {{mg}} mg active',
      })
        .replace('{{time}}', clockLabel(selectedPoint.t))
        .replace('{{mg}}', String(Math.round(selectedPoint.mg)))
    : t('caffeine.tooltipHint', {
        defaultValue: 'Press and hold the chart for a value',
      });

  return (
    <View className="bg-surface rounded-xl p-4 my-2 shadow-sm">
      <View className="flex-row items-center gap-2 mb-3">
        <Ionicons name="cafe-outline" size={20} color={AMBER} />
        <Text className="text-text-primary text-lg font-semibold">
          {t('caffeine.title', { defaultValue: 'Active Caffeine' })}
        </Text>
      </View>

      <View className="flex-row gap-3 mb-3">
        <View
          className="flex-1 rounded-lg p-3"
          style={{
            backgroundColor: 'rgba(217, 119, 6, 0.10)',
            borderWidth: 1,
            borderColor: 'rgba(217, 119, 6, 0.30)',
          }}
        >
          <Text className="text-text-muted text-xs">
            {t('caffeine.activeNow', { defaultValue: 'Active now' })}
          </Text>
          <Text className="text-2xl font-bold" style={{ color: '#fbbf24' }}>
            {Math.round(activeNowMg)}
            <Text className="text-text-muted text-xs">
              {' '}
              {t('caffeine.unitMg', { defaultValue: 'mg' })}
            </Text>
          </Text>
          <Text className="text-text-muted text-[10px] mt-0.5">
            {t('caffeine.halfLife', {
              defaultValue: '{{hours}}h half-life',
            }).replace('{{hours}}', String(kinetics.half_life_hours))}
          </Text>
        </View>

        <View className="flex-1 rounded-lg p-3 bg-raised border border-border-subtle">
          <View className="flex-row items-center gap-1">
            <Ionicons name="moon-outline" size={12} color="#6366f1" />
            <Text className="text-text-muted text-xs">
              {t('caffeine.atBedtime', { defaultValue: 'At {{time}}' }).replace(
                '{{time}}',
                bedtimeLabel
              )}
            </Text>
          </View>
          <Text className="text-text-primary text-2xl font-bold">
            {Math.round(kinetics.at_bedtime_mg)}
            <Text className="text-text-muted text-xs">
              {' '}
              {t('caffeine.unitMg', { defaultValue: 'mg' })}
            </Text>
          </Text>
          <View
            className="self-start rounded-full px-2 py-0.5 mt-1"
            style={{ backgroundColor: impactStyle.bg }}
          >
            <Text
              className="text-[11px] font-medium"
              style={{ color: impactStyle.fg }}
            >
              {impactLabel}
            </Text>
          </View>
        </View>
      </View>

      <View className="rounded-lg p-3 bg-raised border border-border-subtle mb-3">
        <View className="flex-row items-center gap-1">
          <Ionicons name="time-outline" size={12} color="#10b981" />
          <Text className="text-text-muted text-xs">
            {t('caffeine.bedtimeCutoff', { defaultValue: 'Last coffee by' })}
          </Text>
        </View>
        {kinetics.cutoff_state === 'by' && kinetics.latest_safe_dose_time ? (
          <Text className="text-xl font-bold mt-1" style={{ color: '#34d399' }}>
            {formatTimeLabel(
              kinetics.latest_safe_dose_time,
              preferences?.time_format
            )}
          </Text>
        ) : kinetics.cutoff_state === 'passed' ? (
          <Text
            className="text-sm font-medium mt-1"
            style={{ color: '#fbbf24' }}
          >
            {t('caffeine.cutoffPassed', {
              defaultValue: 'Too late for another',
            })}
          </Text>
        ) : kinetics.cutoff_state === 'over' ? (
          <Text
            className="text-sm font-medium mt-1"
            style={{ color: '#f87171' }}
          >
            {t('caffeine.cutoffOver', {
              defaultValue: 'Already over for tonight',
            })}
          </Text>
        ) : (
          <Text className="text-text-muted text-sm font-medium mt-1">
            {t('caffeine.anytimeSafe', { defaultValue: 'Any time' })}
          </Text>
        )}
        <Text className="text-text-muted text-[10px] mt-0.5">
          {kinetics.cutoff_state === 'over'
            ? t('caffeine.cutoffOverDesc', {
                defaultValue: 'Already past {{threshold}}mg at bedtime',
              }).replace('{{threshold}}', String(kinetics.threshold_mg))
            : t('caffeine.cutoffDesc', {
                defaultValue: 'For a {{dose}}mg dose',
              }).replace(
                '{{dose}}',
                String(Math.round(kinetics.cutoff_dose_mg))
              )}
        </Text>
      </View>

      <Text className="text-text-secondary text-xs text-center mb-1">
        {tooltipText}
      </Text>

      <View style={{ height: 180 }} testID="caffeine-chart">
        <CartesianChart
          data={chartData}
          xKey="t"
          yKeys={['mg', 'threshold']}
          domainPadding={{ left: 10, right: 10, top: 12 }}
          xAxis={{
            font,
            tickCount: 4,
            labelColor: textMuted,
            formatXLabel: (value: number) => clockLabel(value),
          }}
          yAxis={[
            {
              font,
              tickCount: 4,
              labelColor: textMuted,
              domain: [0, yMax],
            },
          ]}
        >
          {({ points, chartBounds, xScale, yScale }) => (
            <>
              <Area
                points={points.mg}
                y0={chartBounds.bottom}
                color={AMBER_FILL}
                curveType="linear"
              />
              {/* Dashed so it reads as a limit rather than a second series. */}
              <Line
                points={points.threshold}
                color={dangerColor}
                strokeWidth={1}
              >
                <DashPathEffect intervals={[4, 4]} />
              </Line>
              <SkiaLine
                p1={{ x: xScale(bedtimeMs), y: chartBounds.top }}
                p2={{ x: xScale(bedtimeMs), y: chartBounds.bottom }}
                color={INDIGO}
                strokeWidth={1}
              >
                <DashPathEffect intervals={[2, 4]} />
              </SkiaLine>
              {nowIsInWindow ? (
                <SkiaLine
                  p1={{ x: xScale(nowMs), y: chartBounds.top }}
                  p2={{ x: xScale(nowMs), y: chartBounds.bottom }}
                  color={SLATE}
                  strokeWidth={1}
                />
              ) : null}
              {cutoffInWindow && cutoffMs !== null ? (
                <SkiaLine
                  p1={{ x: xScale(cutoffMs), y: chartBounds.top }}
                  p2={{ x: xScale(cutoffMs), y: chartBounds.bottom }}
                  color={EMERALD}
                  strokeWidth={1}
                >
                  <DashPathEffect intervals={[3, 3]} />
                </SkiaLine>
              ) : null}
              <LineSeriesMark
                points={points.mg}
                color={AMBER}
                strokeWidth={2}
                curveType="linear"
                connectMissingData
              />
              {/* A dose whose time was assumed is drawn hollow. */}
              {visibleDoses.map((dose, idx) => {
                const doseMs = new Date(dose.at).getTime();
                const cx = xScale(doseMs);
                const cy = yScale(
                  activeCaffeineAt(
                    kinetics.doses,
                    doseMs,
                    kinetics.half_life_hours
                  )
                );
                return dose.is_estimated ? (
                  <Circle
                    key={`${dose.at}-${idx}`}
                    cx={cx}
                    cy={cy}
                    r={4}
                    color={AMBER}
                    style="stroke"
                    strokeWidth={1.5}
                  />
                ) : (
                  <Circle
                    key={`${dose.at}-${idx}`}
                    cx={cx}
                    cy={cy}
                    r={4}
                    color={AMBER}
                  />
                );
              })}
              <ChartLayoutReporter
                chartBounds={chartBounds}
                points={points.mg}
                onChange={setTouchLayout}
              />
            </>
          )}
        </CartesianChart>
        <ChartTouchOverlay
          layout={touchLayout}
          onSelect={setSelectedIndex}
          onClear={clearSelection}
        />
      </View>

      {/* Every mark on the plot is named here, like the web card. */}
      <View className="flex-row flex-wrap justify-center items-center gap-x-3 gap-y-1 mt-1">
        <LegendItem
          label={t('caffeine.legendCurve', { defaultValue: 'Active caffeine' })}
        >
          <View style={{ width: 14, height: 2, backgroundColor: AMBER }} />
        </LegendItem>
        <LegendItem
          label={t('caffeine.legendThreshold', {
            defaultValue: '{{threshold}}mg sleep threshold',
          }).replace('{{threshold}}', String(kinetics.threshold_mg))}
        >
          <View
            style={{
              width: 14,
              height: 0,
              borderTopWidth: 1,
              borderStyle: 'dashed',
              borderColor: dangerColor,
            }}
          />
        </LegendItem>
        <LegendItem
          label={t('caffeine.legendBedtime', {
            defaultValue: 'Bedtime {{time}}',
          }).replace('{{time}}', kinetics.target_bedtime)}
        >
          <View
            style={{
              width: 0,
              height: 12,
              borderLeftWidth: 2,
              borderStyle: 'dashed',
              borderColor: INDIGO,
            }}
          />
        </LegendItem>
        {nowIsInWindow ? (
          <LegendItem label={t('caffeine.legendNow', { defaultValue: 'Now' })}>
            <View
              style={{
                width: 0,
                height: 12,
                borderLeftWidth: 2,
                borderColor: SLATE,
              }}
            />
          </LegendItem>
        ) : null}
        {cutoffInWindow && cutoffMs !== null ? (
          <LegendItem
            label={t('caffeine.legendCutoff', {
              defaultValue: 'Last {{dose}}mg dose {{time}}',
            })
              .replace('{{dose}}', String(Math.round(kinetics.cutoff_dose_mg)))
              .replace('{{time}}', clockLabel(cutoffMs))}
          >
            <View
              style={{
                width: 0,
                height: 12,
                borderLeftWidth: 2,
                borderStyle: 'dashed',
                borderColor: EMERALD,
              }}
            />
          </LegendItem>
        ) : null}
        <LegendItem
          label={t('caffeine.legendDose', { defaultValue: 'Logged dose' })}
        >
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: AMBER,
            }}
          />
        </LegendItem>
        {kinetics.has_estimated_times ? (
          <LegendItem
            label={t('caffeine.legendEstimated', {
              defaultValue: 'Assumed time',
            })}
          >
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                borderWidth: 1,
                borderStyle: 'dashed',
                borderColor: AMBER,
              }}
            />
          </LegendItem>
        ) : null}
      </View>

      <Text className="text-text-muted text-xs text-center mt-1">
        {crossingAt
          ? t('caffeine.crossingNote', {
              defaultValue: 'Back under {{threshold}}mg from {{time}}',
            })
              .replace('{{threshold}}', String(kinetics.threshold_mg))
              .replace('{{time}}', clockLabel(crossingAt))
          : t('caffeine.underThreshold', {
              defaultValue: 'Stays under {{threshold}}mg tonight',
            }).replace('{{threshold}}', String(kinetics.threshold_mg))}
      </Text>

      {kinetics.has_estimated_times ? (
        <Text className="text-text-muted text-[11px] text-center mt-1">
          {t('caffeine.estimatedTimes', {
            defaultValue: 'Some dose times were estimated',
          })}
        </Text>
      ) : null}

      <Text className="text-text-muted text-xs font-medium mt-3 mb-1.5">
        {t('caffeine.recentDoses', { defaultValue: 'Recent Doses (48h)' })}
      </Text>
      <View className="flex-row flex-wrap gap-1.5">
        {kinetics.doses.map((dose, idx) => (
          <View
            key={`${dose.at}-${idx}`}
            className="flex-row items-center gap-1.5 rounded px-2 py-1 bg-raised"
          >
            <Text className="text-text-primary text-xs font-medium">
              {dose.name || t('caffeine.dose', { defaultValue: 'Dose' })}:
            </Text>
            <Text className="text-text-primary text-xs">
              {t('caffeine.doseMg', { defaultValue: '{{mg}}mg' }).replace(
                '{{mg}}',
                String(dose.mg)
              )}
            </Text>
            <Text className="text-text-muted text-[10px]">
              ({clockLabel(dose.at)})
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const LegendItem: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <View className="flex-row items-center gap-1.5">
    {children}
    <Text className="text-text-muted text-[10px]">{label}</Text>
  </View>
);

export default CaffeineCard;
