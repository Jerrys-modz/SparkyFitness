import React from 'react';
import { render, screen } from '@testing-library/react-native';
import type { StrengthVolume } from '@workspace/shared';
import StrengthVolumeCard from '../../src/components/exerciseStats/StrengthVolumeCard';

const BASE: StrengthVolume = {
  today: '2026-10-02',
  firstDayOfWeek: 1,
  thisWeekStart: '2026-09-28',
  lastWeekStart: '2026-09-21',
  range: { min: 10, max: 20 },
  muscles: [
    {
      muscle: 'Chest',
      thisWeek: 12,
      lastWeek: 8,
      thisWeekStatus: 'inRange',
      lastWeekStatus: 'under',
    },
  ],
  deload: { status: 'ok', reasons: [], score: 0, plan: null },
};

describe('StrengthVolumeCard', () => {
  it('lists muscles with their status against the range', () => {
    render(
      <StrengthVolumeCard data={BASE} isLoading={false} isError={false} />
    );
    expect(screen.getByText('Weekly Muscle Volume')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('Under')).toBeTruthy();
    expect(screen.getByText('In range')).toBeTruthy();
    expect(screen.getByText('No deload needed right now.')).toBeTruthy();
  });

  it('shows a deload suggestion with reasons and says it changes nothing', () => {
    render(
      <StrengthVolumeCard
        isLoading={false}
        isError={false}
        data={{
          ...BASE,
          deload: {
            status: 'suggest',
            score: 2,
            reasons: [{ code: 'e1rm_dropping', items: ['Squat'], value: 8 }],
            plan: {
              weekStart: '2026-10-05',
              setsPercent: { min: 50, max: 60 },
              loadPercent: { min: 90, max: 100 },
              muscleTargets: [{ muscle: 'Chest', from: 6, to: 7 }],
            },
          },
        }}
      />
    );
    expect(screen.getByText('Consider a lighter week')).toBeTruthy();
    expect(screen.getByText(/Squat/)).toBeTruthy();
    expect(screen.getByText(/nothing in your plans/i)).toBeTruthy();
  });

  it('shows an error when nothing loaded', () => {
    render(<StrengthVolumeCard data={undefined} isLoading={false} isError />);
    expect(
      screen.getByText('Could not load your weekly muscle volume.')
    ).toBeTruthy();
  });
});
