import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { RunSensorPoint } from '@workspace/shared';
import {
  ActivityDynamicsCard,
  ActivityPowerCard,
} from '@/components/ExerciseCharts/ActivityPowerDynamicsCards';

const mockPrefs: { watts: number | null } = { watts: null };
const mockSave = jest.fn();
jest.mock('@/hooks/Settings/usePreferences', () => ({
  useRunningCriticalPower: () => ({
    watts: mockPrefs.watts,
    isSaving: false,
    save: mockSave,
  }),
}));

const renderPower = (points: RunSensorPoint[]) =>
  render(<ActivityPowerCard points={points} />);

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
    renderPower(track(600, () => ({ hr: 150 })));
    expect(screen.queryByTestId('activity-power-card')).toBeNull();
  });

  it('shows no zones for a short run', () => {
    renderPower(track(600, () => ({ power: 250 })));
    expect(screen.getByTestId('activity-power-card')).toBeInTheDocument();
    expect(screen.queryByTestId('activity-power-zones')).toBeNull();
  });

  it('shows zones once the run holds a 20 minute effort', () => {
    renderPower(track(30 * 60, () => ({ power: 300 })));
    expect(screen.getByTestId('activity-power-zones')).toBeInTheDocument();
  });

  describe('critical power setting', () => {
    afterEach(() => {
      mockPrefs.watts = null;
      mockSave.mockClear();
    });

    it('draws zones from the saved value even on a short run', () => {
      mockPrefs.watts = 250;
      renderPower(track(600, () => ({ power: 200 })));
      expect(screen.getByTestId('activity-power-zones')).toBeInTheDocument();
    });

    it('saves a valid value and disables save out of range', async () => {
      renderPower(track(600, () => ({ power: 200 })));
      fireEvent.click(screen.getByTestId('activity-critical-power-edit'));
      const input = screen.getByTestId('activity-critical-power-input');
      fireEvent.change(input, { target: { value: '20' } });
      expect(screen.getByTestId('activity-critical-power-save')).toBeDisabled();
      fireEvent.change(input, { target: { value: '280' } });
      fireEvent.click(screen.getByTestId('activity-critical-power-save'));
      await waitFor(() =>
        expect(mockSave).toHaveBeenCalledWith(280, expect.any(Function))
      );
    });

    it('clears the saved value back to the estimate', async () => {
      mockPrefs.watts = 250;
      renderPower(track(600, () => ({ power: 200 })));
      fireEvent.click(screen.getByTestId('activity-critical-power-edit'));
      fireEvent.click(screen.getByTestId('activity-critical-power-clear'));
      await waitFor(() =>
        expect(mockSave).toHaveBeenCalledWith(null, expect.any(Function))
      );
    });
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
