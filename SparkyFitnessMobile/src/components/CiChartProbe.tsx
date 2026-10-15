import React from 'react';
import { View } from 'react-native';

import HydrationBarChart from './HydrationBarChart';
import type { HydrationDataPoint } from '../types/healthTrends';

const SAMPLE_ML = [1900, 1150, 1400, 1100, 1700, 1680, 700];

const dayString = (offset: number): string => {
  const date = new Date();
  date.setDate(date.getDate() - offset);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const DATA: HydrationDataPoint[] = SAMPLE_ML.map((milliliters, index) => ({
  day: dayString(SAMPLE_ML.length - 1 - index),
  milliliters,
}));

/**
 * Renders one trend chart with fixed data, so the iOS CI workflow can screenshot
 * the axis labels in a given language on a simulator with no server. Only
 * mounted when `EXPO_PUBLIC_CI_CHART_PROBE=1` is set at bundle time.
 */
const CiChartProbe: React.FC = () => (
  <View className="flex-1 justify-center bg-background px-4">
    <HydrationBarChart
      data={DATA}
      isLoading={false}
      isError={false}
      range="7d"
      unit="ml"
      goals={DATA.map(() => 1000)}
    />
  </View>
);

export default CiChartProbe;
