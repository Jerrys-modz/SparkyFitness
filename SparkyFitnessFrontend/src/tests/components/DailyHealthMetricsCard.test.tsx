import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { DailyHealthMetrics } from '@workspace/shared';
import { DailyHealthMetricsCard } from '@/components/Health/DailyHealthMetricsCard';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, second?: unknown) => {
      if (typeof second === 'string') return second;
      const opts = second as Record<string, unknown> | undefined;
      const template = (opts?.['defaultValue'] as string) ?? key;
      return template.replace(/\{\{(\w+)\}\}/g, (_m, name: string) =>
        String(opts?.[name] ?? '')
      );
    },
  }),
}));

const metrics = (overrides: Partial<DailyHealthMetrics>): DailyHealthMetrics =>
  ({
    source_provider: 'polar',
    body_battery_highest: null,
    body_battery_lowest: null,
    body_battery_charged: null,
    body_battery_drained: null,
    avg_stress_level: null,
    max_stress_level: null,
    resting_heart_rate: null,
    heart_rate_recovery_1min: null,
    vo2_max: null,
    fitness_age: null,
    training_readiness_score: null,
    recovery_time_hours: null,
    ...overrides,
  }) as DailyHealthMetrics;

describe('DailyHealthMetricsCard section visibility', () => {
  // Polar reports a resting HR but no body battery, stress, VO2 max or
  // readiness. Those tiles used to render as a wall of "--" (issue #2471).
  it('renders only the tiles the provider actually reported', () => {
    render(
      <DailyHealthMetricsCard metrics={metrics({ resting_heart_rate: 54 })} />
    );

    expect(screen.getByText('Resting HR')).toBeInTheDocument();
    expect(screen.getByText('54')).toBeInTheDocument();

    expect(screen.queryByText('Body Battery')).not.toBeInTheDocument();
    expect(screen.queryByText('Avg Stress')).not.toBeInTheDocument();
    expect(screen.queryByText('VO2 Max')).not.toBeInTheDocument();
    expect(screen.queryByText('Readiness')).not.toBeInTheDocument();
  });

  it('renders every tile when a provider reports everything', () => {
    render(
      <DailyHealthMetricsCard
        metrics={metrics({
          source_provider: 'garmin',
          body_battery_highest: 80,
          avg_stress_level: 30,
          resting_heart_rate: 48,
          vo2_max: 47,
          training_readiness_score: 72,
        })}
      />
    );

    [
      'Body Battery',
      'Avg Stress',
      'Resting HR',
      'VO2 Max',
      'Readiness',
    ].forEach((label) => expect(screen.getByText(label)).toBeInTheDocument());
  });

  it('treats a zero reading as real data, not a missing tile', () => {
    render(
      <DailyHealthMetricsCard
        metrics={metrics({ body_battery_highest: 0, avg_stress_level: 0 })}
      />
    );

    expect(screen.getByText('Body Battery')).toBeInTheDocument();
    expect(screen.getByText('Avg Stress')).toBeInTheDocument();
  });

  it('reports an empty day rather than collapsing the tile', () => {
    // The Diary grid is user-arranged and persistent: the card stays put and
    // says the day has no sync, instead of vanishing and reflowing the layout.
    render(<DailyHealthMetricsCard />);

    expect(
      screen.getByText('No wearable data synced for this day.')
    ).toBeInTheDocument();
    expect(
      screen.getByText('Daily Wearable Health Summary')
    ).toBeInTheDocument();
  });
});
