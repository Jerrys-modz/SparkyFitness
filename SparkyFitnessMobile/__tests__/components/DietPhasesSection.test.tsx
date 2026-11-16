import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { DietPhase, DietPhasesResponse } from '@workspace/shared';
import DietPhasesSection from '../../src/components/DietPhasesSection';

const mockSavePhases = jest.fn();
let mockResponse: DietPhasesResponse | null = null;

jest.mock('../../src/hooks/useGoals', () => ({
  useDietPhases: () => ({ dietPhases: mockResponse }),
  useSaveDietPhases: () => ({
    savePhases: mockSavePhases,
    isPending: false,
  }),
}));
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: { default_weight_unit: 'kg' } }),
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

const response = (
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
    mockSavePhases.mockReset().mockResolvedValue(undefined);
    mockResponse = response('2026-01-20', {
      current: cut,
      days_left: 13,
      next: maintain,
      change_on: '2026-02-02',
      days_until_change: 13,
    });
  });

  it('shows the current phase, days left and the next phase', () => {
    render(<DietPhasesSection onEdit={jest.fn()} />);
    expect(screen.getByText('Current phase: Winter cut')).toBeTruthy();
    expect(screen.getByText('13 days left')).toBeTruthy();
    expect(screen.getByText(/^Next: Maintenance from/)).toBeTruthy();
    expect(screen.queryByTestId('diet-phase-change-soon')).toBeNull();
  });

  it('shows a notice when the phase is about to change', () => {
    mockResponse = response('2026-01-30', {
      current: cut,
      days_left: 3,
      next: maintain,
      change_on: '2026-02-02',
      days_until_change: 3,
      change_soon: true,
    });
    render(<DietPhasesSection onEdit={jest.fn()} />);
    expect(screen.getByTestId('diet-phase-change-soon')).toBeTruthy();
    expect(screen.getByText('Phase change coming up')).toBeTruthy();
  });

  it('only offers to delete a phase that has not started', () => {
    render(<DietPhasesSection onEdit={jest.fn()} />);
    expect(screen.queryByTestId('diet-phase-delete-cut')).toBeNull();
    const alert = jest.spyOn(Alert, 'alert');
    fireEvent.press(screen.getByTestId('diet-phase-delete-maintain'));
    const buttons = alert.mock.calls[0]![2]!;
    buttons[1]!.onPress!();
    expect(mockSavePhases).toHaveBeenCalledWith({
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
    });
  });

  it('ends the running phase today', () => {
    render(<DietPhasesSection onEdit={jest.fn()} />);
    fireEvent.press(screen.getByTestId('diet-phase-end-cut'));
    expect(mockSavePhases.mock.calls[0][0].phases[0]).toMatchObject({
      id: 'cut',
      end_date: '2026-01-20',
      duration_weeks: null,
    });
  });

  it('opens the editor for a new phase', () => {
    const onEdit = jest.fn();
    render(<DietPhasesSection onEdit={onEdit} />);
    fireEvent.press(screen.getByTestId('diet-phase-add'));
    expect(onEdit).toHaveBeenCalledWith();
  });
});
