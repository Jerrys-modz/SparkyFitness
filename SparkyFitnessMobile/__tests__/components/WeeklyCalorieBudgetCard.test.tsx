import React from 'react';
import { render, screen } from '@testing-library/react-native';
import type { WeeklyCalorieBudgetDay } from '@workspace/shared';
import WeeklyCalorieBudgetCard from '../../src/components/WeeklyCalorieBudgetCard';

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

describe('WeeklyCalorieBudgetCard', () => {
  it('shows used, remaining and the adjusted target with the reason', () => {
    render(<WeeklyCalorieBudgetCard budget={budget()} eatenToday={500} />);
    expect(screen.getByTestId('weekly-budget-used')).toHaveTextContent(
      /3,?900/
    );
    expect(screen.getByTestId('weekly-budget-remaining')).toHaveTextContent(
      /10,?100/
    );
    expect(screen.getByTestId('weekly-budget-target')).toHaveTextContent(
      /2,?120/
    );
    expect(screen.getByTestId('weekly-budget-reason')).toHaveTextContent(
      /under so far, spread over 5 days left: \+120 kcal today\./
    );
  });

  it('explains a capped overeating day', () => {
    render(
      <WeeklyCalorieBudgetCard
        budget={budget({
          carryover: -4000,
          shift: -400,
          uncappedShift: -667,
          target: 1600,
          limitedBy: 'cap',
          daysLeft: 6,
        })}
        eatenToday={0}
      />
    );
    expect(screen.getByTestId('weekly-budget-reason')).toHaveTextContent(
      /over so far, spread over 6 days left: −400 kcal today\. Limited to ±20% of your daily target\./
    );
  });

  it('says when no finished day has counted yet', () => {
    render(
      <WeeklyCalorieBudgetCard
        budget={budget({ countedDays: 0, carryover: 0, shift: 0 })}
        eatenToday={0}
      />
    );
    expect(screen.getByTestId('weekly-budget-reason')).toHaveTextContent(
      /No finished days counted yet/
    );
  });
});
