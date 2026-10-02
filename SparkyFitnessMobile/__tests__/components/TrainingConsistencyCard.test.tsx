import React from 'react';
import { render } from '@testing-library/react-native';
import type { TrainingConsistency } from '@workspace/shared';

import TrainingConsistencyCard from '../../src/components/exerciseStats/TrainingConsistencyCard';
import { initializeI18n } from '../../src/localization/i18n';

jest.mock('../../src/components/Icon', () => {
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

const DATA: TrainingConsistency = {
  today: '2026-10-02',
  weeks: [
    { weekStart: '2026-09-21', workoutDays: 2 },
    { weekStart: '2026-09-28', workoutDays: 1 },
  ],
  trainingDays: ['2026-09-22', '2026-09-24', '2026-10-01'],
  weeklyStreak: { current: 2, longest: 5 },
  muscleSets: {
    thisWeek: { Chest: 8 },
    lastWeek: { Chest: 10, Back: 6 },
  },
};

describe('TrainingConsistencyCard', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  it('shows the weekly streak, this week and the muscle comparison', () => {
    const { getByText, getAllByTestId } = render(
      <TrainingConsistencyCard data={DATA} isLoading={false} isError={false} />
    );

    expect(getByText('Training Consistency')).toBeTruthy();
    expect(getByText('2 weeks')).toBeTruthy();
    expect(getByText('5 weeks')).toBeTruthy();
    expect(getByText('1 day')).toBeTruthy();
    expect(getAllByTestId('consistency-trained')).toHaveLength(3);
    expect(getByText('Chest')).toBeTruthy();
    expect(getByText('Back')).toBeTruthy();
  });

  it('says when no sets were logged this week or last', () => {
    const { getByText } = render(
      <TrainingConsistencyCard
        data={{ ...DATA, muscleSets: { thisWeek: {}, lastWeek: {} } }}
        isLoading={false}
        isError={false}
      />
    );
    expect(getByText('No sets logged this week or last.')).toBeTruthy();
  });

  it('shows an error line when nothing loaded', () => {
    const { getByText } = render(
      <TrainingConsistencyCard data={undefined} isLoading={false} isError />
    );
    expect(getByText('Could not load your training consistency.')).toBeTruthy();
  });
});
