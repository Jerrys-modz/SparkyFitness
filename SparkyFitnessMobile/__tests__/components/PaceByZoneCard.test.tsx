import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { buildPaceByZone, type PaceByZoneActivity } from '@workspace/shared';
import PaceByZoneCard from '../../src/components/exerciseStats/PaceByZoneCard';

const FLOORS = [95, 114, 133, 152, 171];

const run = (
  entryDate: string,
  paceSecondsPerKm: number,
  avgHeartRate: number
): PaceByZoneActivity => ({
  exerciseName: 'Morning Run',
  category: 'running',
  entryDate,
  durationMinutes: (5 * paceSecondsPerKm) / 60,
  distanceMeters: 5000,
  avgHeartRate,
});

const zonesFor = (activities: PaceByZoneActivity[]) =>
  buildPaceByZone(activities, FLOORS, { today: '2026-04-27', months: 4 });

describe('PaceByZoneCard', () => {
  it('shows each month, the change from the month before and a verdict', () => {
    render(
      <PaceByZoneCard
        distanceUnit="km"
        zones={zonesFor([
          run('2026-01-10', 331, 120),
          run('2026-02-10', 326, 120),
          run('2026-04-10', 320, 120),
          run('2026-01-12', 298, 140),
          run('2026-04-12', 290, 145),
        ])}
      />
    );
    expect(screen.getByText('Pace by Heart Rate Zone')).toBeTruthy();
    expect(screen.getByText('Zone 2 Easy Aerobic')).toBeTruthy();
    expect(screen.getByText('Zone 3 Tempo')).toBeTruthy();
    expect(
      screen.getAllByText('JAN'.toLowerCase(), { exact: false }).length
    ).toBeGreaterThan(0);
    expect(screen.getByText('-5s')).toBeTruthy();
    expect(
      screen.getByText('Aerobic fitness improving (-11s over 3 months)')
    ).toBeTruthy();
    expect(
      screen.getByText('Tempo fitness improving (-8s over 3 months)')
    ).toBeTruthy();
  });

  it('words a slower trend and converts to miles', () => {
    render(
      <PaceByZoneCard
        distanceUnit="miles"
        zones={zonesFor([
          run('2026-01-10', 300, 120),
          run('2026-04-10', 320, 120),
        ])}
      />
    );
    // 20 s per km is about 32 s per mile.
    expect(
      screen.getByText('Easy pace slowing (+32s over 3 months)')
    ).toBeTruthy();
  });

  it('says steady when the pace has not moved', () => {
    render(
      <PaceByZoneCard
        distanceUnit="km"
        zones={zonesFor([
          run('2026-01-10', 320, 120),
          run('2026-04-10', 319, 120),
        ])}
      />
    );
    expect(screen.getByText('Easy pace steady over 3 months')).toBeTruthy();
  });
});
