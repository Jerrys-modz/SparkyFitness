import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { RunSensorPoint } from '@workspace/shared';
import {
  ActivityDynamicsCard,
  ActivityPowerCard,
} from '@/components/ExerciseCharts/ActivityPowerDynamicsCards';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
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

describe('ActivityPowerCard', () => {
  it('renders nothing without power', () => {
    render(<ActivityPowerCard points={track(600, () => ({ hr: 150 }))} />);
    expect(screen.queryByTestId('activity-power-card')).toBeNull();
  });

  it('shows no zones for a short run', () => {
    render(<ActivityPowerCard points={track(600, () => ({ power: 250 }))} />);
    expect(screen.getByTestId('activity-power-card')).toBeInTheDocument();
    expect(screen.queryByTestId('activity-power-zones')).toBeNull();
  });

  it('shows zones once the run holds a 20 minute effort', () => {
    render(
      <ActivityPowerCard points={track(30 * 60, () => ({ power: 300 }))} />
    );
    expect(screen.getByTestId('activity-power-zones')).toBeInTheDocument();
  });
});

describe('ActivityDynamicsCard', () => {
  it('renders nothing without dynamics', () => {
    render(<ActivityDynamicsCard points={track(60, () => ({ power: 200 }))} />);
    expect(screen.queryByTestId('activity-dynamics-card')).toBeNull();
  });

  it('shows the readings and vertical ratio', () => {
    render(
      <ActivityDynamicsCard
        points={track(120, () => ({ gct: 240, vo: 90, stride: 120 }))}
      />
    );
    expect(screen.getByText('240 ms')).toBeInTheDocument();
    expect(screen.getByText('7.5%')).toBeInTheDocument();
  });
});
