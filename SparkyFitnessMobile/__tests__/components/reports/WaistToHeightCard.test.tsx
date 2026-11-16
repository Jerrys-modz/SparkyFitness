import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { waistToHeightSeries } from '@workspace/shared';

import WaistToHeightCard from '../../../src/components/reports/WaistToHeightCard';

const mockUseWaistToHeight = jest.fn();
jest.mock('../../../src/hooks/useWeightProgress', () => ({
  useWaistToHeight: () => mockUseWaistToHeight(),
}));

describe('WaistToHeightCard (mobile)', () => {
  it('shows the latest ratio, its band and a trend', () => {
    mockUseWaistToHeight.mockReturnValue({
      isLoading: false,
      series: waistToHeightSeries([
        { date: '2026-01-01', waist: 95, height: 170 },
        { date: '2026-02-01', waist: 84 },
      ]),
    });
    render(<WaistToHeightCard lengthUnit="inches" />);
    expect(screen.getByTestId('waist-to-height-ratio')).toHaveTextContent(
      '0.49'
    );
    expect(screen.getAllByText(/Lower risk/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Waist 33.1 in/)).toBeTruthy();
    expect(screen.getByTestId('waist-to-height-trend')).toBeTruthy();
  });

  it('renders nothing without a waist and height', () => {
    mockUseWaistToHeight.mockReturnValue({ isLoading: false, series: [] });
    render(<WaistToHeightCard lengthUnit="cm" />);
    expect(screen.queryByTestId('waist-to-height-card')).toBeNull();
  });
});
