import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import RouteHeatmapCard from '@/pages/Reports/RouteHeatmapCard';
import { heatmapPeriodStart } from '@/utils/heatmapPeriod';
import { useHeatmap } from '@/hooks/Reports/useReports';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      key: string,
      fallback?: string | { defaultValue?: string; count?: number }
    ) => {
      if (typeof fallback === 'string') return fallback;
      const count = fallback?.count;
      const plural = (fallback as Record<string, string> | undefined)?.[
        count === 1 ? 'defaultValue_one' : 'defaultValue_other'
      ];
      return plural ? plural.replace('{{count}}', String(count)) : key;
    },
    i18n: { language: 'en' },
  }),
}));
jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({ timezone: 'UTC' }),
}));
jest.mock('@/hooks/Reports/useReports', () => ({ useHeatmap: jest.fn() }));

const data = (overrides = {}) => ({
  cellM: 50,
  cells: [
    [40, -74, 1],
    [40.001, -74, 5],
  ],
  maxCount: 5,
  activityCount: 7,
  truncated: false,
  bounds: { minLat: 40, maxLat: 40.01, minLon: -74.01, maxLon: -74 },
  firstDate: '2025-01-02',
  lastDate: '2026-10-12',
  ...overrides,
});
const answer = (value: unknown, state = {}) =>
  jest.mocked(useHeatmap).mockReturnValue({
    data: value,
    isLoading: false,
    isError: false,
    ...state,
  } as never);
const firstRequest = () =>
  jest.mocked(useHeatmap).mock.calls.at(-2)?.[0] as Record<string, unknown>;

beforeEach(() => jest.clearAllMocks());

describe('heatmapPeriodStart', () => {
  it('turns a period into its first day', () => {
    expect(heatmapPeriodStart('30d', '2026-10-30')).toBe('2026-10-01');
    expect(heatmapPeriodStart('90d', '2026-10-30')).toBe('2026-08-02');
    expect(heatmapPeriodStart('1y', '2026-10-30')).toBe('2025-10-31');
    expect(heatmapPeriodStart('all', '2026-10-30')).toBeUndefined();
  });
});

describe('RouteHeatmapCard', () => {
  it('draws a cell per entry with a summary', () => {
    answer(data());
    render(<RouteHeatmapCard />);
    expect(screen.getAllByTestId('heat-cell')).toHaveLength(2);
    expect(screen.getByTestId('heatmap-summary')).toHaveTextContent(
      '7 activities · 2025-01-02 – 2026-10-12'
    );
    expect(screen.queryByTestId('heatmap-truncated')).toBeNull();
  });

  it('says when it is showing only the busiest places', () => {
    answer(data({ truncated: true }));
    render(<RouteHeatmapCard />);
    expect(screen.getByTestId('heatmap-truncated')).toBeInTheDocument();
  });

  it('explains an empty map and a failure', () => {
    answer(data({ cells: [], activityCount: 0, bounds: null }));
    const { unmount } = render(<RouteHeatmapCard />);
    expect(screen.getByTestId('heatmap-empty')).toBeInTheDocument();
    unmount();
    answer(undefined, { isError: true });
    render(<RouteHeatmapCard />);
    expect(
      screen.getByText('Failed to load your route heatmap.')
    ).toBeInTheDocument();
  });

  it('shows a loading note first', () => {
    answer(undefined, { isLoading: true });
    render(<RouteHeatmapCard />);
    expect(screen.getByText('Loading your heatmap...')).toBeInTheDocument();
  });

  it('asks for everything first, then for the chosen kind and period', () => {
    answer(data());
    render(<RouteHeatmapCard />);
    expect(firstRequest()).toMatchObject({ maxCells: 2500 });
    expect(firstRequest()).not.toHaveProperty('activities');
    expect(firstRequest()).not.toHaveProperty('from');

    fireEvent.click(screen.getByRole('button', { name: 'Ride' }));
    expect(firstRequest()).toMatchObject({ activities: ['ride'] });
    fireEvent.click(screen.getByRole('button', { name: '30 days' }));
    expect(String(firstRequest()['from'])).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(firstRequest()).not.toHaveProperty('activities');
  });
});
