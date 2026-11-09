import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { RunSensorPoint } from '@workspace/shared';
import RunningPowerCard from '../../../src/components/exerciseStats/RunningPowerCard';
import RunningDynamicsCard from '../../../src/components/exerciseStats/RunningDynamicsCard';
import { initializeI18n } from '../../../src/localization';

const mockPreferences: { running_critical_power_watts?: number | null } = {};
jest.mock('../../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: mockPreferences }),
}));
const mockUpdatePreferences = jest.fn().mockResolvedValue({});
jest.mock('../../../src/services/api/preferencesApi', () => ({
  updatePreferences: (...args: unknown[]) => mockUpdatePreferences(...args),
}));

const renderPower = (points: RunSensorPoint[]) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RunningPowerCard points={points} />
    </QueryClientProvider>
  );

jest.mock('../../../src/components/exerciseStats/RunSeriesChart', () => ({
  __esModule: true,
  default: () => null,
}));

const START = Date.parse('2026-10-13T07:00:00Z');
const track = (
  seconds: number,
  make: (second: number) => Partial<RunSensorPoint>
): RunSensorPoint[] =>
  Array.from({ length: seconds }, (_, i) => ({
    t: new Date(START + i * 1000).toISOString(),
    ...make(i),
  }));

describe('RunningPowerCard', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  it('renders nothing without power', () => {
    const screen = renderPower(track(600, () => ({ hr: 150 })));
    expect(screen.queryByTestId('running-power-card')).toBeNull();
  });

  it('shows average, max and normalized power, but no zones for a short run', () => {
    const screen = renderPower(track(600, () => ({ power: 250 })));
    expect(screen.getByTestId('run-power-average')).toBeTruthy();
    expect(screen.getAllByText('250 W').length).toBeGreaterThan(1);
    expect(screen.queryByTestId('run-power-zones')).toBeNull();
  });

  it('shows power zones once the run holds a 20 minute effort', () => {
    const screen = renderPower(track(30 * 60, () => ({ power: 300 })));
    expect(screen.getByTestId('run-power-zones')).toBeTruthy();
    expect(screen.getByText(/critical power of 285 W/)).toBeTruthy();
  });

  describe('critical power setting', () => {
    afterEach(() => {
      delete mockPreferences.running_critical_power_watts;
      mockUpdatePreferences.mockClear();
    });

    it('draws zones from the saved value even on a short run', () => {
      mockPreferences.running_critical_power_watts = 250;
      const screen = renderPower(track(600, () => ({ power: 200 })));
      expect(screen.getByTestId('run-power-zones')).toBeTruthy();
      expect(
        screen.getByText('Zones from your critical power of 250 W.')
      ).toBeTruthy();
    });

    it('saves a valid value and rejects one out of range', async () => {
      const screen = renderPower(track(600, () => ({ power: 200 })));
      fireEvent.press(screen.getByTestId('run-power-critical-power-edit'));
      fireEvent.changeText(
        screen.getByTestId('run-power-critical-power-input'),
        '20'
      );
      fireEvent.press(screen.getByTestId('run-power-critical-power-save'));
      expect(mockUpdatePreferences).not.toHaveBeenCalled();
      fireEvent.changeText(
        screen.getByTestId('run-power-critical-power-input'),
        '280'
      );
      fireEvent.press(screen.getByTestId('run-power-critical-power-save'));
      await waitFor(() =>
        expect(mockUpdatePreferences).toHaveBeenCalledWith({
          running_critical_power_watts: 280,
        })
      );
    });

    it('clears the saved value back to the estimate', async () => {
      mockPreferences.running_critical_power_watts = 250;
      const screen = renderPower(track(600, () => ({ power: 200 })));
      fireEvent.press(screen.getByTestId('run-power-critical-power-edit'));
      fireEvent.press(screen.getByTestId('run-power-critical-power-clear'));
      await waitFor(() =>
        expect(mockUpdatePreferences).toHaveBeenCalledWith({
          running_critical_power_watts: null,
        })
      );
    });
  });
});

describe('RunningDynamicsCard', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  it('renders nothing without dynamics', () => {
    const screen = render(
      <RunningDynamicsCard points={track(60, () => ({ power: 200 }))} />
    );
    expect(screen.queryByTestId('running-dynamics-card')).toBeNull();
  });

  it('shows the readings and the vertical ratio', () => {
    const screen = render(
      <RunningDynamicsCard
        points={track(120, () => ({ gct: 240, vo: 90, stride: 120 }))}
      />
    );
    expect(screen.getByText('240 ms')).toBeTruthy();
    expect(screen.getByText('90 mm')).toBeTruthy();
    expect(screen.getByText('120 cm')).toBeTruthy();
    expect(screen.getByText('7.5%')).toBeTruthy();
  });
});
