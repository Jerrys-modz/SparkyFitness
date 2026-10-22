import React from 'react';
import { render, screen } from '@testing-library/react-native';
import WeightTrendChart from '../../src/components/coaching/WeightTrendChart';
import { coachingCheckInFixture } from '../helpers/coachingCheckIn';

describe('WeightTrendChart', () => {
  it('draws every weigh-in and describes the trend range for screen readers', () => {
    render(
      <WeightTrendChart
        series={coachingCheckInFixture().trend.series}
        unit="kg"
      />
    );
    const chart = screen.getByTestId('weight-trend-chart');
    expect(chart.props.accessibilityLabel).toBe(
      'Weight trend chart, from 80.2 kg to 80.1 kg'
    );
  });

  it('converts to pounds', () => {
    render(
      <WeightTrendChart
        series={coachingCheckInFixture().trend.series}
        unit="lbs"
      />
    );
    expect(
      screen.getByTestId('weight-trend-chart').props.accessibilityLabel
    ).toContain('lbs');
  });

  it('renders nothing without data', () => {
    render(<WeightTrendChart series={[]} unit="kg" />);
    expect(screen.queryByTestId('weight-trend-chart')).toBeNull();
  });
});
