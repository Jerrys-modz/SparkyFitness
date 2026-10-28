import {
  buildPaceByZone,
  monthKeyBefore,
  paceByZoneStartDay,
  type PaceByZoneActivity,
} from '@workspace/shared';

// Max heart rate 190: zone 2 starts at 114 bpm, zone 3 at 133, zone 4 at 152.
const FLOORS = [95, 114, 133, 152, 171];
const TODAY = '2026-04-27';

const run = (
  entryDate: string,
  paceSecondsPerKm: number,
  avgHeartRate: number | null,
  extra: Partial<PaceByZoneActivity> = {}
): PaceByZoneActivity => ({
  exerciseName: 'Morning Run',
  category: 'running',
  entryDate,
  durationMinutes: (5 * paceSecondsPerKm) / 60,
  distanceMeters: 5000,
  avgHeartRate,
  ...extra,
});

describe('monthKeyBefore', () => {
  it('steps back across a year boundary', () => {
    expect(monthKeyBefore('2026-02-10', 0)).toBe('2026-02');
    expect(monthKeyBefore('2026-02-10', 3)).toBe('2025-11');
  });

  it('starts the window on the first of the oldest month', () => {
    expect(paceByZoneStartDay(TODAY, 4)).toBe('2026-01-01');
  });
});

describe('buildPaceByZone', () => {
  const activities = [
    run('2026-01-10', 331, 120),
    run('2026-02-10', 326, 125),
    run('2026-03-10', 328, 118),
    run('2026-04-10', 320, 122),
    run('2026-01-12', 298, 140),
    run('2026-04-12', 290, 145),
  ];

  it('averages each zone by month, oldest first, with the change from the month before', () => {
    const [zone2, zone3] = buildPaceByZone(activities, FLOORS, {
      today: TODAY,
    });
    expect(zone2!.zone).toBe(2);
    expect(zone2!.months.map((m) => m.month)).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
    ]);
    expect(zone2!.months.map((m) => Math.round(m.paceSecondsPerKm!))).toEqual([
      331, 326, 328, 320,
    ]);
    expect(zone2!.months[0]!.changeSeconds).toBeNull();
    expect(zone2!.months[1]!.changeSeconds).toBeCloseTo(-5);
    expect(zone3!.months[1]!.paceSecondsPerKm).toBeNull();
    expect(zone3!.months[3]!.changeSeconds).toBeCloseTo(-8);
  });

  it('reports the trend from the first month with runs to the last', () => {
    const [zone2, zone3] = buildPaceByZone(activities, FLOORS, {
      today: TODAY,
    });
    expect(zone2!.trend).toEqual({
      changeSeconds: expect.closeTo(-11, 0),
      months: 3,
      direction: 'faster',
    });
    expect(zone3!.trend?.direction).toBe('faster');
  });

  it('has no trend until two months have runs', () => {
    const [zone2] = buildPaceByZone([run('2026-04-10', 320, 120)], FLOORS, {
      today: TODAY,
    });
    expect(zone2!.trend).toBeNull();
  });

  it('calls a change under three seconds steady', () => {
    const [zone2] = buildPaceByZone(
      [run('2026-01-10', 320, 120), run('2026-04-10', 318, 120)],
      FLOORS,
      { today: TODAY }
    );
    expect(zone2!.trend?.direction).toBe('steady');
  });

  it('weights a month by distance', () => {
    const [zone2] = buildPaceByZone(
      [
        run('2026-04-02', 300, 120, {
          distanceMeters: 10000,
          durationMinutes: 50,
        }),
        run('2026-04-09', 360, 120, {
          distanceMeters: 5000,
          durationMinutes: 30,
        }),
      ],
      FLOORS,
      { today: TODAY }
    );
    // 80 minutes over 15 km.
    expect(zone2!.months[3]!.paceSecondsPerKm).toBeCloseTo(320);
    expect(zone2!.months[3]!.runs).toBe(2);
  });

  it('ignores walks, short runs, missing or implausible heart rate and old runs', () => {
    const [zone2] = buildPaceByZone(
      [
        run('2026-04-10', 320, 120, {
          exerciseName: 'Walk',
          category: 'walking',
        }),
        run('2026-04-10', 320, 120, { distanceMeters: 800 }),
        run('2026-04-10', 320, null),
        run('2026-04-10', 320, 250),
        run('2025-12-31', 320, 120),
        run('2026-04-10', 320, 120, { durationMinutes: 5 }),
      ],
      FLOORS,
      { today: TODAY }
    );
    expect(zone2!.months.every((m) => m.runs === 0)).toBe(true);
  });
});
