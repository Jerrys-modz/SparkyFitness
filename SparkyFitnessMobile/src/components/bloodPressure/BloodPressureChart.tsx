import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { CartesianChart } from 'victory-native';
import { useCSSVariable } from 'uniwind';
import { CHART_LABEL_FONT_SIZE, useChartFont } from '../charts/chartFormatting';
import LineSeriesMark from '../charts/LineSeriesMark';
import TrendGoalLine from '../charts/TrendGoalLine';
import { getAppLocale } from '../../localization';
import type { BloodPressureReading } from '../../hooks/useBloodPressure';

interface BloodPressureChartProps {
  readings: BloodPressureReading[];
}

const formatDay = (day: string): string => {
  const parts = day.split('-').map(Number);
  const [year, month, d] = parts;
  if (!year || !month || !d) return day;
  return new Date(year, month - 1, d).toLocaleDateString(getAppLocale(), {
    month: 'short',
    day: 'numeric',
  });
};

/** Systolic and diastolic readings over time, one point per reading. */
const BloodPressureChart: React.FC<BloodPressureChartProps> = ({
  readings,
}) => {
  const { t } = useTranslation();
  const font = useChartFont(CHART_LABEL_FONT_SIZE);
  const [systolicColor, diastolicColor, textMuted] = useCSSVariable([
    '--color-text-danger-subtle',
    '--color-accent-primary',
    '--color-text-muted',
  ]) as [string, string, string];

  // The category lines at 130 and 80 stay inside the plot.
  const data = useMemo(
    () =>
      readings.map((r, index) => ({
        index,
        day: r.date,
        systolic: r.systolic,
        diastolic: r.diastolic,
      })),
    [readings]
  );
  const domain = useMemo(() => {
    const values = [
      ...readings.flatMap((r) => [r.systolic, r.diastolic]),
      130,
      80,
    ];
    return {
      y: [Math.min(...values) - 10, Math.max(...values) + 10] as [
        number,
        number,
      ],
    };
  }, [readings]);

  if (readings.length === 0) {
    return (
      <View className="h-40 justify-center items-center">
        <Text className="text-text-muted text-sm">
          {t('bloodPressure.chartEmpty', { defaultValue: 'No readings yet' })}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ height: 200 }}>
      <CartesianChart
        data={data}
        xKey="index"
        yKeys={['systolic', 'diastolic']}
        domain={domain}
        domainPadding={{ left: 25, right: 25, top: 12, bottom: 12 }}
        xAxis={{
          font,
          tickCount: Math.min(data.length, 4),
          labelColor: textMuted,
          formatXLabel: (value: number) =>
            formatDay(data[Math.round(value)]?.day ?? ''),
        }}
        yAxis={[{ font, tickCount: 5, labelColor: textMuted }]}
      >
        {({ points, chartBounds, yScale }) => (
          <>
            <LineSeriesMark
              points={points.systolic}
              color={systolicColor}
              strokeWidth={2}
              curveType="linear"
              connectMissingData
            />
            <LineSeriesMark
              points={points.diastolic}
              color={diastolicColor}
              strokeWidth={2}
              curveType="linear"
              connectMissingData
            />
            <TrendGoalLine
              points={points.systolic}
              chartBounds={chartBounds}
              yScale={yScale}
              goals={data.map(() => 130)}
              color={textMuted}
            />
            <TrendGoalLine
              points={points.diastolic}
              chartBounds={chartBounds}
              yScale={yScale}
              goals={data.map(() => 80)}
              color={textMuted}
            />
          </>
        )}
      </CartesianChart>
    </View>
  );
};

export default BloodPressureChart;
