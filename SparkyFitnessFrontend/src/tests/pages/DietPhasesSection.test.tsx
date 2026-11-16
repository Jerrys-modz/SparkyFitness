import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { DietPhase, DietPhasesResponse } from '@workspace/shared';
import { DietPhasesSection } from '@/pages/Goals/DietPhasesSection';

const mutate = jest.fn();
let response: DietPhasesResponse | undefined;
let actingOnBehalf = false;

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      _key: string,
      arg?: string | Record<string, unknown>,
      opts?: Record<string, unknown>
    ) => {
      const text = typeof arg === 'string' ? arg : '';
      const values = (typeof arg === 'string' ? opts : arg) ?? {};
      return text.replace(/\{\{(\w+)\}\}/g, (_m, k: string) =>
        String(values[k] ?? '')
      );
    },
    i18n: { language: 'en', resolvedLanguage: 'en' },
  }),
}));
jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    weightUnit: 'kg',
    dateFormat: 'yyyy-MM-dd',
    formatDateInUserTimezone: (day: string) => day,
  }),
}));
jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({ isActingOnBehalf: actingOnBehalf }),
}));
jest.mock('@/hooks/Goals/useGoals', () => ({
  useDietPhases: () => ({ data: response }),
  useSaveDietPhasesMutation: () => ({ mutate, isPending: false }),
}));

const phase = (overrides: Partial<DietPhase>): DietPhase => ({
  id: 'p',
  phase_type: 'loss',
  weekly_change_kg: 0.5,
  start_date: '2026-01-05',
  end_date: null,
  duration_weeks: 4,
  target_weight_kg: null,
  target_reached_on: null,
  label: null,
  effective_end_date: '2026-02-01',
  ...overrides,
});

const cut = phase({ id: 'cut', label: 'Winter cut' });
const maintain = phase({
  id: 'maintain',
  phase_type: 'maintenance',
  weekly_change_kg: 0,
  start_date: '2026-02-02',
  duration_weeks: null,
  end_date: '2026-02-15',
  effective_end_date: '2026-02-15',
});

const withStatus = (
  today: string,
  status: Partial<DietPhasesResponse['status']>
): DietPhasesResponse => ({
  today,
  phases: [cut, maintain],
  status: {
    current: null,
    days_left: null,
    next: null,
    change_on: null,
    days_until_change: null,
    change_soon: false,
    ...status,
  },
});

describe('DietPhasesSection', () => {
  beforeEach(() => {
    mutate.mockReset();
    actingOnBehalf = false;
    response = withStatus('2026-01-20', {
      current: cut,
      days_left: 13,
      next: maintain,
      change_on: '2026-02-02',
      days_until_change: 13,
    });
  });

  it('shows the current phase, days left and what comes next', () => {
    render(<DietPhasesSection />);
    expect(screen.getByText('Current phase: Winter cut')).toBeInTheDocument();
    expect(screen.getByText(/13 days left/)).toBeInTheDocument();
    expect(
      screen.getByText('Next: Maintenance from 2026-02-02')
    ).toBeInTheDocument();
    expect(screen.queryByText('Phase change coming up')).toBeNull();
  });

  it('warns when the phase is about to change', () => {
    response = withStatus('2026-01-30', {
      current: cut,
      days_left: 3,
      next: maintain,
      change_on: '2026-02-02',
      days_until_change: 3,
      change_soon: true,
    });
    render(<DietPhasesSection />);
    expect(screen.getByText('Phase change coming up')).toBeInTheDocument();
    expect(
      screen.getByText('Maintenance starts on 2026-02-02, in 3 days.')
    ).toBeInTheDocument();
  });

  it('only lets a phase that has not started be deleted', () => {
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    render(<DietPhasesSection />);
    const deletes = screen.getAllByText('Delete');
    expect(deletes).toHaveLength(1);
    fireEvent.click(deletes[0]!);
    expect(mutate).toHaveBeenCalledWith(
      {
        phases: [
          {
            id: 'cut',
            phase_type: 'loss',
            weekly_change_kg: 0.5,
            start_date: '2026-01-05',
            end_date: null,
            duration_weeks: 4,
            target_weight_kg: null,
            label: 'Winter cut',
          },
        ],
      },
      expect.anything()
    );
  });

  it('ends the running phase today', () => {
    render(<DietPhasesSection />);
    fireEvent.click(screen.getByText('End today'));
    const body = mutate.mock.calls[0][0];
    expect(body.phases[0]).toMatchObject({
      id: 'cut',
      end_date: '2026-01-20',
      duration_weeks: null,
    });
  });

  it('is read-only while acting for someone else', () => {
    actingOnBehalf = true;
    render(<DietPhasesSection />);
    expect(screen.queryByText('Add phase')).toBeNull();
    expect(screen.queryByText('Edit')).toBeNull();
  });

  it('says the base Goal Mode applies with no phase today', () => {
    response = { ...withStatus('2026-03-01', {}), phases: [] };
    render(<DietPhasesSection />);
    expect(
      screen.getByText(
        'No phase today: your Goal Mode from Calculation Settings applies.'
      )
    ).toBeInTheDocument();
  });
});
