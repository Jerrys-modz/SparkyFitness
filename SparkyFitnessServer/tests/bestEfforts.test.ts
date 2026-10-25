import { describe, expect, it } from 'vitest';
import {
  bestEffortsFromSamples,
  DISTANCE_SERIES_EFFORT_OPTIONS,
  effortSamplesFromDistanceSeries,
  effortSamplesFromGpsTrack,
  fastestEffort,
  fasterEffort,
  UNGUARDED_EFFORT_OPTIONS,
  type EffortSample,
} from '@workspace/shared';

/** A steady run: one sample a second at `mps` metres per second. */
function steady(seconds: number, mps: number, startAt = 0): EffortSample[] {
  return Array.from({ length: seconds + 1 }, (_, i) => ({
    seconds: startAt + i,
    meters: i * mps,
  }));
}

describe('fastestEffort', () => {
  it('times a steady run exactly', () => {
    const effort = fastestEffort(steady(600, 4), 1000);
    expect(effort?.seconds).toBeCloseTo(250, 6);
    expect(effort?.distanceMeters).toBe(1000);
  });

  it('finds the fast kilometre hidden inside a slower run', () => {
    // 2 km at 3 m/s, 1 km at 5 m/s, 2 km at 3 m/s.
    const samples: EffortSample[] = [];
    let seconds = 0;
    let meters = 0;
    for (const [length, mps] of [
      [2000, 3],
      [1000, 5],
      [2000, 3],
    ] as const) {
      const steps = length / mps;
      for (let i = 0; i < steps; i++) {
        samples.push({ seconds, meters });
        seconds += 1;
        meters += mps;
      }
    }
    samples.push({ seconds, meters });
    const effort = fastestEffort(samples, 1000);
    expect(effort?.seconds).toBeCloseTo(200, 3);
    // 2000 / 3 is not a whole number of seconds, so the fast part starts at 2001 m.
    expect(effort?.startMeters).toBeCloseTo(2001, 3);
    expect(effort?.endMeters).toBeCloseTo(3001, 3);
  });

  it('interpolates between samples that straddle the distance', () => {
    // Only three readings; 1000 m falls between the second and third.
    const effort = fastestEffort(
      [
        { seconds: 0, meters: 0 },
        { seconds: 10, meters: 40 },
        { seconds: 20, meters: 1200 },
      ],
      1000,
      { maxGapSeconds: 60, maxSpeedMps: 1000 }
    );
    // Window 200..1200 m is the only fully reached one: starts 1.6 s... check by hand.
    // t(200) = 10 + (160/1160)*10 = 11.379..., t(1200) = 20.
    expect(effort?.seconds).toBeCloseTo(20 - (10 + (160 / 1160) * 10), 6);
  });

  it('returns null for a run shorter than the distance', () => {
    expect(fastestEffort(steady(100, 4), 1000)).toBeNull();
    expect(fastestEffort([], 1000)).toBeNull();
    expect(fastestEffort([{ seconds: 0, meters: 0 }], 1000)).toBeNull();
    expect(fastestEffort(steady(600, 4), 0)).toBeNull();
  });

  it('accepts a run exactly the distance', () => {
    expect(fastestEffort(steady(250, 4), 1000)?.seconds).toBeCloseTo(250, 6);
  });

  it('does not let an effort span a gap in the recording', () => {
    // 600 m, a 5 minute hole, then 600 m. No 1 km exists without the hole.
    const before = steady(150, 4);
    const after = steady(150, 4, 450).map((s) => ({
      seconds: s.seconds,
      meters: s.meters + 600,
    }));
    expect(fastestEffort([...before, ...after], 1000)).toBeNull();
    expect(fastestEffort([...before, ...after], 500)?.seconds).toBeCloseTo(
      125,
      6
    );
  });

  it('does not count a pause inside the window as running time', () => {
    // A 2 km run with a 40 s stop at 1 km; the faster 1 km lies after it.
    const first = steady(250, 4);
    const second = steady(200, 5, 290).map((s) => ({
      seconds: s.seconds,
      meters: s.meters + 1000,
    }));
    const effort = fastestEffort([...first, ...second], 1000);
    expect(effort?.seconds).toBeCloseTo(200, 6);
    expect(effort?.startMeters).toBeCloseTo(1000, 6);
  });

  it('ignores a GPS jump rather than reading it as a fast stretch', () => {
    // 100 m is covered in one second, then the run carries on at 3 m/s.
    const samples: EffortSample[] = [
      ...steady(100, 3),
      { seconds: 101, meters: 300 + 2000 },
      ...steady(400, 3, 102).map((s) => ({
        seconds: s.seconds,
        meters: s.meters + 2300,
      })),
    ];
    const effort = fastestEffort(samples, 1000);
    expect(effort?.seconds).toBeCloseTo(1000 / 3, 3);
  });

  it('copes with repeated and out-of-order timestamps', () => {
    const clean = steady(300, 4);
    const messy: EffortSample[] = [
      ...clean.slice(150),
      ...clean.slice(0, 150),
      { seconds: 10, meters: 9999 }, // repeated timestamp, absurd distance
      { seconds: Number.NaN, meters: 5 },
    ];
    const effort = fastestEffort(messy, 1000);
    expect(effort?.seconds).toBeCloseTo(250, 6);
  });

  it('never lets distance run backwards', () => {
    const samples: EffortSample[] = [
      { seconds: 0, meters: 0 },
      { seconds: 100, meters: 500 },
      { seconds: 101, meters: 480 },
      { seconds: 200, meters: 1000 },
      { seconds: 300, meters: 1500 },
    ];
    const effort = fastestEffort(samples, 1000, {
      maxGapSeconds: 200,
      maxSpeedMps: 100,
    });
    // The backwards reading is held at 500 m, so the window starts there.
    expect(effort?.seconds).toBeCloseTo(199, 6);
  });

  it('keeps the quicker half when a stop sits at the window edge', () => {
    // Stationary for 30 s at 0 m, then 1 km in 240 s. Waiting is not part of the effort.
    const samples: EffortSample[] = [
      { seconds: 0, meters: 0 },
      { seconds: 15, meters: 0 },
      { seconds: 30, meters: 0 },
      ...steady(240, 1000 / 240, 30).slice(1),
    ];
    expect(fastestEffort(samples, 1000)?.seconds).toBeCloseTo(240, 6);
  });
});

describe('bestEffortsFromSamples', () => {
  it('reports only the distances the run reaches, shortest first', () => {
    const efforts = bestEffortsFromSamples(steady(1500, 4)); // 6 km
    expect(efforts.map((e) => e.id)).toEqual(['1k', '1mi', '5k']);
    const mile = efforts.find((e) => e.id === '1mi');
    expect(mile?.seconds).toBeCloseTo(1609.344 / 4, 4);
  });

  it('is empty for a short run', () => {
    expect(bestEffortsFromSamples(steady(100, 3))).toEqual([]);
  });
});

describe('effortSamplesFromGpsTrack', () => {
  // About 0.0000899 degrees of latitude is 10 m.
  const point = (second: number, northMeters: number) => ({
    t: new Date(Date.UTC(2026, 0, 1, 8, 0, second)).toISOString(),
    lat: 50 + (northMeters / 10) * 0.0000899,
    lon: 4,
  });

  it('builds cumulative metres from the trackpoints', () => {
    const samples = effortSamplesFromGpsTrack([
      point(0, 0),
      point(5, 20),
      point(10, 40),
    ]);
    expect(samples).toHaveLength(3);
    expect(samples[2]?.seconds - (samples[0]?.seconds ?? 0)).toBe(10);
    expect(samples[2]?.meters).toBeCloseTo(40, 0);
  });

  it('sorts, de-duplicates and skips unusable points', () => {
    const samples = effortSamplesFromGpsTrack([
      point(10, 40),
      point(0, 0),
      point(0, 5),
      { t: 'not a date', lat: 50, lon: 4 },
      point(5, 20),
    ]);
    expect(samples.map((s) => s.seconds - (samples[0]?.seconds ?? 0))).toEqual([
      0, 5, 10,
    ]);
  });

  it('finds the fastest kilometre in a track', () => {
    const track = Array.from({ length: 401 }, (_, i) => point(i, i * 4));
    const effort = fastestEffort(effortSamplesFromGpsTrack(track), 1000);
    expect(effort?.seconds).toBeCloseTo(250, 0);
  });
});

describe('effortSamplesFromDistanceSeries', () => {
  it('reads active-time rows, allowing the coarser sampling', () => {
    const rows: [number, number][] = [];
    for (let s = 0; s <= 600; s += 45) rows.push([s, s * 4]);
    const samples = effortSamplesFromDistanceSeries(rows);
    expect(fastestEffort(samples, 1000)).toBeNull(); // 45 s legs exceed the GPS gap
    expect(
      fastestEffort(samples, 1000, DISTANCE_SERIES_EFFORT_OPTIONS)?.seconds
    ).toBeCloseTo(250, 6);
  });
});

describe('fasterEffort', () => {
  it('keeps the shorter time and the incumbent on a tie', () => {
    const a = { seconds: 240, id: 'a' };
    const b = { seconds: 230, id: 'b' };
    expect(fasterEffort(undefined, a)).toBe(a);
    expect(fasterEffort(a, b)).toBe(b);
    expect(fasterEffort(b, a)).toBe(b);
    expect(fasterEffort(a, { seconds: 240, id: 'c' })).toBe(a);
  });
});

describe('record windows over the recorded clock (personal records)', () => {
  const secondsFor = (samples: EffortSample[], meters: number) =>
    fastestEffort(samples, meters, UNGUARDED_EFFORT_OPTIONS)?.seconds ?? null;

  it('finds the fastest stretch, not the average', () => {
    // 1 km at 6:00, then 1 km at 4:00, then 1 km at 6:00.
    const samples = [
      { seconds: 0, meters: 0 },
      { seconds: 360, meters: 1000 },
      { seconds: 600, meters: 2000 },
      { seconds: 960, meters: 3000 },
    ];
    expect(secondsFor(samples, 1000)).toBe(240);
    expect(secondsFor(samples, 2000)).toBe(600);
  });

  it('interpolates between coarse samples', () => {
    expect(
      secondsFor(
        [
          { seconds: 0, meters: 0 },
          { seconds: 600, meters: 2000 },
        ],
        1000
      )
    ).toBeCloseTo(300);
  });

  it('is null when the activity is shorter than the distance', () => {
    expect(
      secondsFor(
        [
          { seconds: 0, meters: 0 },
          { seconds: 1200, meters: 4000 },
        ],
        5000
      )
    ).toBeNull();
  });

  it('does not charge a stop at the window edge to the window', () => {
    const samples = [
      { seconds: 0, meters: 0 },
      { seconds: 300, meters: 1000 },
      { seconds: 900, meters: 1000 },
      { seconds: 1200, meters: 2000 },
    ];
    expect(secondsFor(samples, 1000)).toBe(300);
  });
});

describe('effortSamplesFromGpsTrack distance source', () => {
  it('uses the device distance when every point has it', () => {
    const samples = effortSamplesFromGpsTrack([
      { t: '2026-07-01T07:00:00Z', lat: 50, lon: 4, dist: 100 },
      { t: '2026-07-01T07:05:00Z', lat: 50, lon: 4, dist: 1100 },
    ]);
    expect(samples.map((s) => s.meters)).toEqual([0, 1000]);
    expect((samples[1] as EffortSample).seconds - samples[0]!.seconds).toBe(
      300
    );
  });

  it('sums the distance between fixes when the device gave none', () => {
    // 0.01 degrees of latitude is about 1112 m.
    const samples = effortSamplesFromGpsTrack([
      { t: '2026-07-01T07:00:00Z', lat: 50, lon: 4 },
      { t: '2026-07-01T07:05:00Z', lat: 50.01, lon: 4 },
    ]);
    expect(samples[1]?.meters).toBeCloseTo(1112, -1);
  });

  it('gives nothing for a track with no usable time', () => {
    expect(
      effortSamplesFromGpsTrack([{ t: 'not a date', lat: 50, lon: 4 }])
    ).toEqual([]);
  });

  it('drops a glitch jump and its return when given a speed ceiling', () => {
    // A fix 0.004 degrees (about 445 m) away for one 3 s sample, then back.
    const track = [
      { t: '2026-07-01T07:00:00Z', lat: 50, lon: 4 },
      { t: '2026-07-01T07:00:03Z', lat: 50.004, lon: 4 },
      { t: '2026-07-01T07:00:06Z', lat: 50, lon: 4 },
      { t: '2026-07-01T07:00:36Z', lat: 50.0027, lon: 4 },
    ];
    const unfiltered = effortSamplesFromGpsTrack(track);
    const filtered = effortSamplesFromGpsTrack(track, 12);
    expect(unfiltered[2]?.meters).toBeGreaterThan(800);
    expect(filtered[2]?.meters).toBe(0);
    // The real 300 m over 30 s (10 m/s) is kept.
    expect(filtered[3]?.meters).toBeCloseTo(300, -1);
  });
});
