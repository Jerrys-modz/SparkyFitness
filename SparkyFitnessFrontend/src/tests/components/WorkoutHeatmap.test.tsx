import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import WorkoutHeatmap from '@/pages/Reports/WorkoutHeatmap';
import { workoutHeatmapWindow } from '@/utils/workoutHeatmap';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | { defaultValue?: string }) =>
      typeof fallback === 'string' ? fallback : (fallback?.defaultValue ?? key),
    i18n: { language: 'en' },
  }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({ firstDayOfWeek: 1, loggingLevel: 'silent' }),
}));

describe('workoutHeatmapWindow (#2461)', () => {
  it('covers the first of the month eleven months back through today', () => {
    expect(workoutHeatmapWindow('2026-09-24')).toEqual({
      start: '2025-10-01',
      end: '2026-09-24',
    });
    expect(workoutHeatmapWindow('2026-01-15')).toEqual({
      start: '2025-02-01',
      end: '2026-01-15',
    });
  });
});

describe('WorkoutHeatmap', () => {
  it('shows the selected report range instead of a fixed year', () => {
    render(
      <WorkoutHeatmap
        workoutDates={['2026-09-10']}
        startDate="2026-09-08"
        endDate="2026-09-22"
      />
    );

    expect(screen.getByLabelText(/2026-09-10/)).toBeInTheDocument();
    expect(screen.getByLabelText(/2026-09-08/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/2026-08-01/)).toBeNull();
    expect(screen.queryByLabelText(/2025-10-03/)).toBeNull();
  });
});
