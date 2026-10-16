import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { FitnessFatigueResponse } from '@workspace/shared';
import FitnessFatigueCard from '@/pages/Reports/FitnessFatigueCard';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: string | { defaultValue?: string }) => {
      if (typeof options === 'string') return options;
      return options?.defaultValue ?? key;
    },
  }),
}));

const points = Array.from({ length: 40 }, (_, i) => ({
  day: `2026-09-${String((i % 28) + 1).padStart(2, '0')}-${i}`,
  load: 50,
  fitness: 40,
  fatigue: 30,
  form: i % 2 === 0 ? 10 : -10,
}));

const response = (
  readiness: Partial<FitnessFatigueResponse['readiness']> = {},
  fitnessFatigue: Partial<FitnessFatigueResponse['fitnessFatigue']> = {}
): FitnessFatigueResponse => ({
  fitnessFatigue: {
    points,
    today: points[points.length - 1] ?? null,
    status: 'fresh',
    ...fitnessFatigue,
  },
  readiness: {
    score: 82,
    level: 'high',
    factors: { form: 90, sleep: 75 },
    weakest: null,
    ...readiness,
  },
});

describe('FitnessFatigueCard', () => {
  it('shows the score, verdict, factors and the last four weeks of form', () => {
    render(<FitnessFatigueCard data={response()} />);
    expect(screen.getByText('82')).toBeInTheDocument();
    expect(screen.getByText('Ready for a hard session.')).toBeInTheDocument();
    expect(screen.getByText('Training form')).toBeInTheDocument();
    expect(screen.getByText('Sleep')).toBeInTheDocument();
    expect(screen.getAllByTestId('form-bar')).toHaveLength(28);
    expect(screen.getByText(/Fresh:/)).toBeInTheDocument();
  });

  it('points to an easy day when readiness is low', () => {
    render(
      <FitnessFatigueCard
        data={response(
          { score: 30, level: 'low', weakest: 'sleep' },
          { status: 'tired' }
        )}
      />
    );
    expect(screen.getByText(/easy day or rest/)).toBeInTheDocument();
    expect(screen.getByText(/Tired:/)).toBeInTheDocument();
  });

  it('explains there is nothing to go on yet', () => {
    render(
      <FitnessFatigueCard
        data={response(
          { score: null, level: 'noData', factors: {} },
          { points: [], today: null, status: 'noData' }
        )}
      />
    );
    expect(screen.getByText('–')).toBeInTheDocument();
    expect(screen.getByText(/Not enough to go on yet/)).toBeInTheDocument();
    expect(screen.queryAllByTestId('form-bar')).toHaveLength(0);
  });

  it('renders nothing before the data loads', () => {
    const { container } = render(<FitnessFatigueCard data={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});
