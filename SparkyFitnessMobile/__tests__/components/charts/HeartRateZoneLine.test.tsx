import React from 'react';
import { render } from '@testing-library/react-native';
import {
  HEART_RATE_ZONE_COLORS,
  heartRateDisplayBands,
  type HeartRateZone,
} from '@workspace/shared';

import HeartRateZoneLine from '../../../src/components/charts/HeartRateZoneLine';

const mockLine = jest.fn();
const mockSeries = jest.fn();
const mockGradient = jest.fn();
jest.mock('@shopify/react-native-skia', () => ({
  DashPathEffect: () => null,
  LinearGradient: (props: unknown) => {
    mockGradient(props);
    return null;
  },
  Line: (props: unknown) => {
    mockLine(props);
    return null;
  },
  vec: (x: number, y: number) => ({ x, y }),
}));
jest.mock('victory-native', () => ({
  Line: ({ children }: { children?: React.ReactNode }) => {
    mockSeries('gradient');
    return children ?? null;
  },
}));
jest.mock('../../../src/components/charts/LineSeriesMark', () => ({
  __esModule: true,
  default: (props: { color: string }) => {
    mockSeries(props.color);
    return null;
  },
}));

const zones: HeartRateZone[] = [
  { zone: 1, lowerBpm: 95, upperBpm: 113 },
  { zone: 2, lowerBpm: 114, upperBpm: 132 },
  { zone: 3, lowerBpm: 133, upperBpm: 151 },
  { zone: 4, lowerBpm: 152, upperBpm: 170 },
  { zone: 5, lowerBpm: 171, upperBpm: null },
];
const bands = heartRateDisplayBands(zones, 5);
const bounds = { left: 0, right: 100, top: 0, bottom: 200 };
// 1 bpm per pixel, 200 bpm at the top
const yScale = (bpm: number) => 200 - bpm;
const pointsFor = (bpms: number[]) =>
  bpms.map((bpm, i) => ({ x: i, xValue: i, y: yScale(bpm), yValue: bpm }));

describe('HeartRateZoneLine', () => {
  beforeEach(() => {
    mockLine.mockClear();
    mockSeries.mockClear();
    mockGradient.mockClear();
  });

  it('colors a line that climbs through zones with a hard edge at each floor', () => {
    render(
      <HeartRateZoneLine
        points={pointsFor([120, 160, 140])}
        bands={bands}
        chartBounds={bounds}
        yScale={yScale}
      />
    );
    expect(mockSeries).toHaveBeenCalledWith('gradient');
    const { colors, start, end } = mockGradient.mock.calls[0][0];
    expect(start).toEqual({ x: 0, y: 40 });
    expect(end).toEqual({ x: 0, y: 80 });
    expect(colors[0]).toBe(HEART_RATE_ZONE_COLORS[3]);
    expect(colors[colors.length - 1]).toBe(HEART_RATE_ZONE_COLORS[1]);
  });

  it('draws a dotted line in each zone color for floors on the chart', () => {
    render(
      <HeartRateZoneLine
        points={pointsFor([120, 160])}
        bands={bands}
        chartBounds={{ ...bounds, top: 60, bottom: 90 }}
        yScale={yScale}
      />
    );
    // Only 114 (y 86) and 133 (y 67) fall inside the plot area
    expect(mockLine.mock.calls.map(([p]) => p.color)).toEqual([
      HEART_RATE_ZONE_COLORS[1],
      HEART_RATE_ZONE_COLORS[2],
    ]);
  });

  it('draws a line within one zone in that solid color', () => {
    render(
      <HeartRateZoneLine
        points={pointsFor([150, 135])}
        bands={bands}
        chartBounds={bounds}
        yScale={yScale}
        showZoneLines={false}
      />
    );
    expect(mockLine).not.toHaveBeenCalled();
    expect(mockGradient).not.toHaveBeenCalled();
    expect(mockSeries).toHaveBeenCalledWith(HEART_RATE_ZONE_COLORS[2]);
  });
});
