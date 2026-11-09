import React from 'react';
import { render } from '@testing-library/react-native';
import type { RunSensorPoint } from '@workspace/shared';
import RunningPowerCard from '../../../src/components/exerciseStats/RunningPowerCard';
import RunningDynamicsCard from '../../../src/components/exerciseStats/RunningDynamicsCard';
import { initializeI18n } from '../../../src/localization';

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
    const screen = render(
      <RunningPowerCard points={track(600, () => ({ hr: 150 }))} />
    );
    expect(screen.queryByTestId('running-power-card')).toBeNull();
  });

  it('shows average, max and normalized power, but no zones for a short run', () => {
    const screen = render(
      <RunningPowerCard points={track(600, () => ({ power: 250 }))} />
    );
    expect(screen.getByTestId('run-power-average')).toBeTruthy();
    expect(screen.getAllByText('250 W').length).toBeGreaterThan(1);
    expect(screen.queryByTestId('run-power-zones')).toBeNull();
  });

  it('shows power zones once the run holds a 20 minute effort', () => {
    const screen = render(
      <RunningPowerCard points={track(30 * 60, () => ({ power: 300 }))} />
    );
    expect(screen.getByTestId('run-power-zones')).toBeTruthy();
    expect(screen.getByText(/critical power of 285 W/)).toBeTruthy();
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
