import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { VitalsEntries } from '@workspace/shared';
import * as bpApi from '@/api/CheckIn/bloodPressureService';
import { BloodPressureSection } from '@/pages/CheckIn/BloodPressureSection';
import { wrapper } from '../Labs/labsTestKit';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);
jest.mock('@/api/CheckIn/bloodPressureService');
jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    timezone: 'UTC',
    formatTime: () => '8:00 AM',
  }),
}));
const activeUser = { isActingOnBehalf: false };
jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => activeUser,
}));
jest.mock('recharts', () => {
  const Passthrough = ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  );
  return {
    ResponsiveContainer: Passthrough,
    LineChart: Passthrough,
    Line: () => null,
    CartesianGrid: () => null,
    ReferenceLine: () => null,
    Legend: () => null,
    XAxis: () => null,
    YAxis: () => null,
    Tooltip: () => null,
  };
});

const api = jest.mocked(bpApi);

const row = (over: Partial<VitalsEntries> = {}): VitalsEntries => ({
  id: 'v1',
  user_id: 'u1',
  entry_date: '2026-11-24',
  timestamp: new Date('2026-11-24T08:00:00.000Z'),
  systolic_mmhg: 138,
  diastolic_mmhg: 86,
  blood_glucose_mgdl: null,
  body_temperature_celsius: null,
  pulse_bpm: 64,
  meal_context: null,
  source_provider: 'manual',
  device_name: null,
  external_id: null,
  created_at: null,
  updated_at: null,
  ...over,
});

const renderSection = (selectedDate = '2026-11-24') => {
  const { Wrapper } = wrapper();
  return render(<BloodPressureSection selectedDate={selectedDate} />, {
    wrapper: Wrapper,
  });
};

beforeEach(() => {
  jest.clearAllMocks();
  activeUser.isActingOnBehalf = false;
  api.fetchVitals.mockResolvedValue([
    row(),
    // A glucose-only row must not show up as a blood pressure reading.
    row({
      id: 'v2',
      systolic_mmhg: null,
      diastolic_mmhg: null,
      blood_glucose_mgdl: 95,
    }),
  ]);
  api.createBloodPressure.mockResolvedValue(row());
});

const updateBp = jest.mocked(bpApi.updateBloodPressure);

describe('BloodPressureSection', () => {
  it('lists blood pressure readings with their category', async () => {
    renderSection();
    expect((await screen.findAllByText('138/86')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Stage 1').length).toBeGreaterThan(0);
    expect(screen.queryByText('95/null')).not.toBeInTheDocument();
  });

  it('keeps Save disabled until systolic is above diastolic, then saves', async () => {
    renderSection();
    await screen.findAllByText('138/86');
    const save = screen.getByRole('button', { name: 'Save reading' });
    fireEvent.change(screen.getByLabelText('Systolic'), {
      target: { value: '80' },
    });
    fireEvent.change(screen.getByLabelText('Diastolic'), {
      target: { value: '90' },
    });
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Systolic'), {
      target: { value: '122' },
    });
    fireEvent.change(screen.getByLabelText('Diastolic'), {
      target: { value: '79' },
    });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() =>
      expect(api.createBloodPressure).toHaveBeenCalledWith(
        expect.objectContaining({
          systolic_mmhg: 122,
          diastolic_mmhg: 79,
          pulse_bpm: null,
          arm: null,
          body_position: null,
        })
      )
    );
  });

  it('does not offer logging while acting on behalf of someone', async () => {
    activeUser.isActingOnBehalf = true;
    renderSection();
    expect(
      await screen.findByText(
        'Readings can only be logged on your own account.'
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Save reading' })
    ).not.toBeInTheDocument();
  });

  it('keeps the edited reading on its own day, not the selected one', async () => {
    api.fetchVitals.mockResolvedValue([
      row({
        id: 'old',
        timestamp: new Date('2026-11-20T08:00:00.000Z'),
        entry_date: '2026-11-20',
      }),
    ]);
    updateBp.mockResolvedValue(row());
    renderSection();
    await screen.findAllByText('138/86');
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0]!);
    fireEvent.change(screen.getByLabelText('Pulse (bpm)'), {
      target: { value: '70' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(updateBp).toHaveBeenCalled());
    const body = updateBp.mock.calls[0]?.[1];
    // The selected day is 2026-11-24; the reading belongs to the 20th.
    expect(body?.timestamp?.startsWith('2026-11-20')).toBe(true);
    expect(body?.pulse_bpm).toBe(70);
  });

  it('blocks a time in the future', async () => {
    renderSection('2099-01-01');
    await screen.findByText('Log a reading');
    fireEvent.change(screen.getByLabelText('Systolic'), {
      target: { value: '122' },
    });
    fireEvent.change(screen.getByLabelText('Diastolic'), {
      target: { value: '79' },
    });
    expect(screen.getByRole('button', { name: 'Save reading' })).toBeDisabled();
    expect(
      screen.getByText('The time cannot be in the future.')
    ).toBeInTheDocument();
  });
});
