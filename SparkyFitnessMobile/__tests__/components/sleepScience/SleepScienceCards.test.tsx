import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import {
  ChronotypeCard,
  EnergyCard,
  SleepBaselineCard,
  SleepDebtCard,
} from '../../../src/components/sleepScience/SleepScienceCards';
import {
  useChronotype,
  useEnergyCurve,
  useRecalculateSleepBaseline,
  useSleepBaseline,
  useSleepDataSufficiency,
  useSleepDebt,
} from '../../../src/hooks/useSleepScience';

jest.mock('../../../src/hooks/useSleepScience', () => ({
  useChronotype: jest.fn(),
  useEnergyCurve: jest.fn(),
  useRecalculateSleepBaseline: jest.fn(),
  useSleepBaseline: jest.fn(),
  useSleepDataSufficiency: jest.fn(),
  useSleepDebt: jest.fn(),
}));

jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: { show: jest.fn() },
}));

const mocked = <T,>(fn: T) => fn as unknown as jest.Mock;

const debt = (currentDebt: number) => ({
  currentDebt,
  debtCategory: 'moderate',
  sleepNeed: 8,
  last14Days: [],
  trend: { direction: 'improving', change7d: -0.5 },
  paybackTime: currentDebt > 0 ? 3 : 0,
});

describe('SleepDebtCard', () => {
  it('shows a debt with its level, trend and nights to recover', () => {
    mocked(useSleepDebt).mockReturnValue({ data: debt(1.5) });
    render(<SleepDebtCard />);
    const current = screen.getByTestId('sleep-debt-current');
    expect(current).toHaveTextContent(/Sleep debt/);
    expect(current).toHaveTextContent(/1h 30m/);
    expect(current).toHaveTextContent(/Moderate/);
    expect(screen.getByTestId('sleep-debt-trend')).toHaveTextContent(
      /Improving/
    );
    expect(screen.getByTestId('sleep-debt-payback')).toHaveTextContent(
      /3 nights/
    );
  });

  it('shows a negative debt as a surplus with no payback row', () => {
    mocked(useSleepDebt).mockReturnValue({ data: debt(-1 / 3) });
    render(<SleepDebtCard />);
    const current = screen.getByTestId('sleep-debt-current');
    expect(current).toHaveTextContent(/Sleep surplus/);
    expect(current).toHaveTextContent(/0h 20m/);
    expect(current).not.toHaveTextContent(/-/);
    expect(screen.queryByTestId('sleep-debt-payback')).toBeNull();
  });

  it('renders nothing before the debt has loaded', () => {
    mocked(useSleepDebt).mockReturnValue({ data: undefined });
    render(<SleepDebtCard />);
    expect(screen.queryByTestId('sleep-debt-card')).toBeNull();
  });
});

describe('EnergyCard', () => {
  it('shows the current energy and zone', () => {
    mocked(useEnergyCurve).mockReturnValue({
      data: {
        success: true,
        currentEnergy: 72.4,
        currentZone: 'peak',
        nextPeak: null,
        nextDip: { hour: 14.5, energy: 40 },
        melatoninWindow: { start: 20, end: 22 },
      },
    });
    render(<EnergyCard />);
    const now = screen.getByTestId('sleep-energy-now');
    expect(now).toHaveTextContent(/72%/);
    expect(now).toHaveTextContent(/Peak/);
    expect(screen.getByTestId('sleep-energy-dip')).toBeTruthy();
    expect(screen.queryByTestId('sleep-energy-peak')).toBeNull();
    expect(screen.getByTestId('sleep-energy-wind-down')).toBeTruthy();
  });

  it('renders nothing when the server could not build a curve', () => {
    mocked(useEnergyCurve).mockReturnValue({
      data: { success: false, error: 'insufficient_data' },
    });
    render(<EnergyCard />);
    expect(screen.queryByTestId('sleep-energy-card')).toBeNull();
  });
});

describe('ChronotypeCard', () => {
  it('names the chronotype and lists the body clock times', () => {
    mocked(useChronotype).mockReturnValue({
      data: {
        success: true,
        chronotype: 'late',
        averageWakeTime: '06:21',
        averageSleepTime: '21:54',
        circadianNadir: '04:21',
        circadianAcrophase: '16:21',
        melatoninWindowStart: null,
        melatoninWindowEnd: null,
        basedOnDays: 30,
      },
    });
    render(<ChronotypeCard />);
    const type = screen.getByTestId('sleep-chronotype-type');
    expect(type).toHaveTextContent(/Night owl/);
    expect(type).toHaveTextContent(/Based on 30 days/);
    expect(screen.getByTestId('sleep-chronotype-wake')).toBeTruthy();
    expect(screen.getByTestId('sleep-chronotype-nadir')).toBeTruthy();
    expect(screen.queryByTestId('sleep-chronotype-melatonin')).toBeNull();
  });
});

describe('SleepBaselineCard', () => {
  const mutate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mocked(useRecalculateSleepBaseline).mockReturnValue({
      mutate,
      isPending: false,
    });
  });

  it('shows the baseline, social jetlag and a recalculate button', () => {
    mocked(useSleepBaseline).mockReturnValue({
      data: {
        profile: {
          baselineSleepNeed: 7.75,
          method: 'mctq_corrected',
          confidence: 'medium',
          basedOnDays: 60,
          lastCalculated: '2026-11-04T17:42:00Z',
          sdWorkday: 7.5,
          sdFreeday: 8.25,
          socialJetlag: 0.75,
        },
        latestCalculation: null,
        dayClassifications: [],
      },
    });
    mocked(useSleepDataSufficiency).mockReturnValue({
      data: {
        sufficient: true,
        totalDays: 60,
        daysWithTimestamps: 60,
        workdaysAvailable: 40,
        freedaysAvailable: 20,
        workdaysNeeded: 20,
        freedaysNeeded: 8,
        projectedConfidence: 'medium',
        recommendation: '',
      },
    });
    render(<SleepBaselineCard />);
    const need = screen.getByTestId('sleep-baseline-need');
    expect(need).toHaveTextContent(/7h 45m/);
    expect(need).toHaveTextContent(/Medium confidence/);
    expect(screen.getByTestId('sleep-baseline-jetlag')).toHaveTextContent(
      /0h 45m/
    );
    expect(screen.queryByTestId('sleep-baseline-more-data')).toBeNull();

    fireEvent.press(screen.getByTestId('sleep-baseline-recalculate'));
    expect(mutate).toHaveBeenCalledTimes(1);
    const [, options] = mutate.mock.calls[0];
    options.onSuccess({ success: false });
    expect(Toast.show).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        text1: 'Not enough sleep data yet',
      })
    );
  });

  it('says how much more data is needed before a baseline exists', () => {
    mocked(useSleepBaseline).mockReturnValue({
      data: { profile: null, latestCalculation: null, dayClassifications: [] },
    });
    mocked(useSleepDataSufficiency).mockReturnValue({
      data: {
        sufficient: false,
        totalDays: 10,
        daysWithTimestamps: 10,
        workdaysAvailable: 7,
        freedaysAvailable: 3,
        workdaysNeeded: 20,
        freedaysNeeded: 8,
        projectedConfidence: 'low',
        recommendation: '',
      },
    });
    render(<SleepBaselineCard />);
    expect(screen.getByTestId('sleep-baseline-more-data')).toHaveTextContent(
      'More data needed: 7/20 workdays and 3/8 days off.'
    );
    expect(screen.queryByTestId('sleep-baseline-need')).toBeNull();
    expect(screen.getByTestId('sleep-baseline-recalculate')).toBeTruthy();
  });
});
