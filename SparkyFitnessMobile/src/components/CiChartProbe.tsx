import React from 'react';
import { View } from 'react-native';

import HydrationBarChart from './HydrationBarChart';
import type { HydrationDataPoint } from '../types/healthTrends';

const SAMPLE_ML = [1900, 1150, 1400, 1100, 1700, 1680, 700];
const DAYS_30 = 30;

const dayString = (offset: number): string => {
  const date = new Date();
  date.setDate(date.getDate() - offset);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const buildData = (length: number): HydrationDataPoint[] =>
  Array.from({ length }, (_, index) => ({
    day: dayString(length - 1 - index),
    milliliters: SAMPLE_ML[index % SAMPLE_ML.length],
  }));

const DATA_7D = buildData(SAMPLE_ML.length);
const DATA_30D = buildData(DAYS_30);

/**
 * Renders the 7d (weekday labels) and 30d (month/day labels) trend charts with fixed data, so the iOS CI workflow can screenshot
 * the axis labels in a given language on a simulator with no server. Only
 * mounted when `EXPO_PUBLIC_CI_CHART_PROBE=1` is set at bundle time.
 */
const CiChartProbe: React.FC = () => (
  <View className="flex-1 justify-center bg-background px-4">
    <HydrationBarChart
      data={DATA_7D}
      isLoading={false}
      isError={false}
      range="7d"
      unit="ml"
      goals={DATA_7D.map(() => 1000)}
    />
    <HydrationBarChart
      data={DATA_30D}
      isLoading={false}
      isError={false}
      range="30d"
      unit="ml"
      goals={DATA_30D.map(() => 1000)}
    />
  </View>
);

export default CiChartProbe;
