import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import FuelingRaceCard from '../../src/components/fueling/FuelingRaceCard';
import { useRunGoals } from '../../src/hooks/useRunGoals';
import { getGutTrainingStartDay } from '../../src/services/gutTrainingStart';
import { getTodayDate, addDays } from '../../src/utils/dateUtils';

jest.mock('../../src/hooks/useRunGoals', () => ({ useRunGoals: jest.fn() }));
jest.mock('../../src/services/gutTrainingStart', () => ({
  getGutTrainingStartDay: jest.fn(),
}));

const mockGoals = useRunGoals as jest.Mock;
const mockStart = getGutTrainingStartDay as jest.Mock;

const today = getTodayDate();

const withRace = (raceDay: string | null, name: string | null = 'City 10K') =>
  mockGoals.mockReturnValue({
    data: {
      goals: raceDay
        ? {
            race_date: raceDay,
            race_name: name,
            race_distance_km: 10,
            weekly_distance_km: null,
            updated_at: '',
          }
        : null,
    },
    loaded: true,
  });

beforeEach(() => {
  jest.clearAllMocks();
  mockStart.mockImplementation(async (_race: string, day: string) => day);
});

describe('FuelingRaceCard', () => {
  it('shows nothing without a race', () => {
    withRace(null);
    const { queryByTestId } = render(
      <FuelingRaceCard targetCarbsPerHour={90} onUseAmount={jest.fn()} />
    );
    expect(queryByTestId('fueling-race-card')).toBeNull();
  });

  it('shows nothing once the race has passed or without a target', async () => {
    withRace(addDays(today, -3));
    const past = render(
      <FuelingRaceCard targetCarbsPerHour={90} onUseAmount={jest.fn()} />
    );
    await waitFor(() => expect(mockStart).toHaveBeenCalled());
    expect(past.queryByTestId('fueling-race-card')).toBeNull();

    withRace(addDays(today, 70));
    const none = render(
      <FuelingRaceCard targetCarbsPerHour={0} onUseAmount={jest.fn()} />
    );
    await waitFor(() => expect(mockStart).toHaveBeenCalledTimes(2));
    expect(none.queryByTestId('fueling-race-card')).toBeNull();
  });

  it("shows this week's amount and the next steps for a race ten weeks out", async () => {
    withRace(addDays(today, 70));
    const { findByTestId, getByText } = render(
      <FuelingRaceCard targetCarbsPerHour={90} onUseAmount={jest.fn()} />
    );

    const status = await findByTestId('fueling-race-status');
    expect(status.props.children).toBe(
      'This week practise 40 g/h. The race target is 90 g/h.'
    );
    expect(getByText('Race: City 10K')).toBeTruthy();
    expect(getByText(/in 70 days/)).toBeTruthy();
    expect((await findByTestId('fueling-race-weeks')).props.children).toContain(
      '45 g/h'
    );
  });

  it("hands this week's amount to the plan", async () => {
    withRace(addDays(today, 70));
    const onUseAmount = jest.fn();
    const { findByTestId } = render(
      <FuelingRaceCard targetCarbsPerHour={90} onUseAmount={onUseAmount} />
    );
    fireEvent.press(await findByTestId('fueling-race-use'));
    expect(onUseAmount).toHaveBeenCalledWith(40);
  });

  it('warns when there is not enough time to build up', async () => {
    withRace(addDays(today, 10), null);
    const { findByTestId, getByText } = render(
      <FuelingRaceCard targetCarbsPerHour={90} onUseAmount={jest.fn()} />
    );
    const status = await findByTestId('fueling-race-status');
    expect(status.props.children).toContain('not enough time');
    expect(getByText('Your race')).toBeTruthy();
  });

  it('uses the start day it kept for this race', async () => {
    mockStart.mockResolvedValue(addDays(today, -28));
    withRace(addDays(today, 42));
    const { findByTestId } = render(
      <FuelingRaceCard targetCarbsPerHour={90} onUseAmount={jest.fn()} />
    );
    // started 4 weeks ago with 4 weeks of build-up before the 2-week hold
    const status = await findByTestId('fueling-race-status');
    expect(status.props.children).toContain('This week practise');
  });
});
