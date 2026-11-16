import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { WeeklyCalorieBudgetDay } from '@workspace/shared';
import { WeeklyCalorieBudgetSummary } from '@/pages/Diary/WeeklyCalorieBudgetSummary';
import { WeeklyCalorieBudgetSettings } from '@/components/WeeklyCalorieBudgetSettings';

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    energyUnit: 'kcal',
    convertEnergy: (value: number) => value,
    getEnergyUnitString: () => 'kcal',
  }),
}));

const budget = (
  overrides: Partial<WeeklyCalorieBudgetDay> = {}
): WeeklyCalorieBudgetDay => ({
  weekStart: '2026-11-16',
  weekEnd: '2026-11-22',
  daysLeft: 5,
  baseTarget: 2000,
  target: 2120,
  shift: 120,
  uncappedShift: 120,
  limitedBy: 'none',
  maxShift: 400,
  maxShiftPercent: 20,
  floor: 1500,
  carryover: 600,
  allowanceSoFar: 4000,
  eatenSoFar: 3400,
  countedDays: 2,
  unloggedDays: 0,
  weekBudget: 14000,
  ...overrides,
});

describe('WeeklyCalorieBudgetSummary', () => {
  it('shows used, remaining and the adjusted target with the reason', () => {
    render(<WeeklyCalorieBudgetSummary budget={budget()} eatenToday={500} />);
    expect(screen.getByTestId('weekly-budget-used')).toHaveTextContent('3,900');
    expect(screen.getByTestId('weekly-budget-remaining')).toHaveTextContent(
      '10,100'
    );
    expect(screen.getByTestId('weekly-budget-target')).toHaveTextContent(
      '2,120'
    );
    expect(screen.getByTestId('weekly-budget-reason')).toHaveTextContent(
      '600 kcal under so far, spread over 5 days left: +120 kcal today.'
    );
  });

  it('explains a capped overeating day', () => {
    render(
      <WeeklyCalorieBudgetSummary
        budget={budget({
          carryover: -4000,
          shift: -400,
          uncappedShift: -667,
          target: 1600,
          limitedBy: 'cap',
          daysLeft: 6,
          countedDays: 1,
        })}
        eatenToday={0}
      />
    );
    expect(screen.getByTestId('weekly-budget-reason')).toHaveTextContent(
      '4,000 kcal over so far, spread over 6 days left: −400 kcal today. Limited to ±20% of your daily target.'
    );
  });

  it('says when no finished day has counted yet', () => {
    render(
      <WeeklyCalorieBudgetSummary
        budget={budget({
          countedDays: 0,
          carryover: 0,
          shift: 0,
          target: 2000,
          unloggedDays: 1,
        })}
        eatenToday={0}
      />
    );
    expect(screen.getByTestId('weekly-budget-reason')).toHaveTextContent(
      'No finished days counted yet'
    );
    expect(screen.getByTestId('weekly-budget-reason')).toHaveTextContent(
      'nothing logged count as on target'
    );
  });
});

describe('WeeklyCalorieBudgetSettings', () => {
  it('turns the budget on and keeps the cap', () => {
    const onChange = jest.fn();
    render(
      <WeeklyCalorieBudgetSettings
        enabled={false}
        maxShiftPercent={25}
        onChange={onChange}
      />
    );
    expect(
      screen.queryByTestId('weekly-calorie-budget-cap-value')
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch'));
    expect(onChange).toHaveBeenCalledWith({
      enabled: true,
      maxShiftPercent: 25,
    });
  });

  it('shows the cap while on', () => {
    render(
      <WeeklyCalorieBudgetSettings
        enabled
        maxShiftPercent={20}
        onChange={jest.fn()}
      />
    );
    expect(
      screen.getByTestId('weekly-calorie-budget-cap-value')
    ).toHaveTextContent('±20%');
  });
});
