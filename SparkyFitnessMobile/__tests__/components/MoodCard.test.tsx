import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { moodTagForValue } from '@workspace/shared';
import MoodCard from '../../src/components/mood/MoodCard';
import { useMoodEntriesBetween } from '../../src/hooks/useMood';
import type { MoodEntry } from '../../src/services/api/moodApi';

jest.mock('../../src/hooks/useMood', () => ({
  useMoodEntriesBetween: jest.fn(),
}));

jest.mock('../../src/components/Icon', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: { name: string }) => <View testID={`icon-${name}`} />,
  };
});

jest.mock('uniwind', () => ({
  useCSSVariable: (keys: string | string[]) =>
    Array.isArray(keys) ? keys.map(() => '#111827') : '#111827',
}));

const mockUseMoodEntries = useMoodEntriesBetween as jest.MockedFunction<
  typeof useMoodEntriesBetween
>;
const mockNavigate = jest.fn();
const navigation = {
  navigate: mockNavigate,
} as unknown as React.ComponentProps<typeof MoodCard>['navigation'];

const DATE = '2026-10-05';
const entry = (overrides: Partial<MoodEntry> = {}): MoodEntry => ({
  id: '1',
  mood_value: 80,
  mood_tags: [],
  notes: null,
  entry_date: DATE,
  entry_timestamp: `${DATE}T12:00:00Z`,
  source: 'manual',
  ...overrides,
});

describe('MoodCard on Dashboard', () => {
  beforeEach(() => jest.clearAllMocks());

  it('offers a log button when nothing is logged for the day', () => {
    mockUseMoodEntries.mockReturnValue([]);
    const { getByText, getByLabelText } = render(
      <MoodCard navigation={navigation} date={DATE} />
    );

    expect(getByText('No mood logged for this day')).toBeTruthy();
    expect(getByLabelText(`Mood on ${DATE}: none logged`)).toBeTruthy();
    fireEvent.press(getByText('+ Log'));
    expect(mockNavigate).toHaveBeenCalledWith('MoodDay', { date: DATE });
  });

  it("shows the day's mood face and label when logged", () => {
    mockUseMoodEntries.mockReturnValue([entry()]);
    const { getByText, getByLabelText, queryByText } = render(
      <MoodCard navigation={navigation} date={DATE} />
    );

    expect(getByText(/Happy/)).toBeTruthy();
    expect(getByLabelText(`Mood on ${DATE}: Happy`)).toBeTruthy();
    expect(queryByText('+ Log')).toBeNull();
  });

  it('prefers the manual mood over a Garmin one for the day', () => {
    mockUseMoodEntries.mockReturnValue([
      entry({ id: 'g', mood_value: 30, source: 'garmin' }),
      entry({ id: 'm', mood_value: 70, source: 'manual' }),
    ]);
    const { getByText, queryByText } = render(
      <MoodCard navigation={navigation} date={DATE} />
    );

    const manual = moodTagForValue(70);
    expect(manual).toBe('confident');
    expect(getByText(/Confident/)).toBeTruthy();
    expect(queryByText(/Sad/)).toBeNull();
  });

  it('shows a day of check-ins with no mood as not logged', () => {
    mockUseMoodEntries.mockReturnValue([
      entry({ mood_value: null, energy_value: 3, notes: 'tired' }),
    ]);
    const { getByText, getByLabelText } = render(
      <MoodCard navigation={navigation} date={DATE} />
    );

    expect(getByText('No mood logged for this day')).toBeTruthy();
    expect(getByLabelText(`Mood on ${DATE}: none logged`)).toBeTruthy();
  });

  it('opens the day view when the card is pressed', () => {
    mockUseMoodEntries.mockReturnValue([entry()]);
    const { getByLabelText } = render(
      <MoodCard navigation={navigation} date={DATE} />
    );

    fireEvent.press(getByLabelText(`Mood on ${DATE}: Happy`));
    expect(mockNavigate).toHaveBeenCalledWith('MoodDay', { date: DATE });
  });
});
