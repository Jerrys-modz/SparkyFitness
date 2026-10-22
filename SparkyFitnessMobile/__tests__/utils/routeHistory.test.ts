import type { RouteRun } from '@workspace/shared';
import {
  formatRunPace,
  routeBestNote,
  routeTrend,
  TREND_MAX_BARS,
} from '../../src/utils/routeHistory';

const run = (entryId: string, durationSeconds: number): RouteRun => ({
  entryId,
  date: '2026-10-12',
  durationSeconds,
  distanceM: 5000,
  paceSecPerKm: null,
  avgHeartRate: null,
});

describe('routeBestNote', () => {
  it('is null until the run is in the list', () => {
    expect(routeBestNote([run('a', 1500)], 'missing')).toBeNull();
  });

  it('is not a best for a first run: nothing to beat', () => {
    expect(routeBestNote([run('a', 1500)], 'a')).toEqual({
      isRouteBest: false,
      previousBestSeconds: null,
    });
  });

  it('is a best when strictly faster than every earlier run', () => {
    expect(
      routeBestNote([run('a', 1400), run('b', 1500), run('c', 1600)], 'a')
    ).toEqual({ isRouteBest: true, previousBestSeconds: 1500 });
  });

  it('is not a best when tied or slower', () => {
    expect(routeBestNote([run('a', 1500), run('b', 1500)], 'a')).toEqual({
      isRouteBest: false,
      previousBestSeconds: 1500,
    });
    expect(
      routeBestNote([run('a', 1700), run('b', 1500)], 'a')?.isRouteBest
    ).toBe(false);
  });

  it('ignores runs with no time', () => {
    expect(routeBestNote([run('a', 1500), run('b', 0)], 'a')).toEqual({
      isRouteBest: false,
      previousBestSeconds: null,
    });
  });
});

describe('formatRunPace', () => {
  it('shows a dash with no pace', () => {
    expect(formatRunPace(null, 'km')).toBe('—');
    expect(formatRunPace(Number.NaN, 'km')).toBe('—');
  });

  it('keeps seconds per km and converts to per mile', () => {
    expect(formatRunPace(300, 'km')).toBe('5:00');
    expect(formatRunPace(300, 'miles')).toBe('8:03');
  });
});

describe('routeTrend', () => {
  it('needs two timed runs', () => {
    expect(routeTrend([])).toBeNull();
    expect(routeTrend([run('a', 1500)])).toBeNull();
    expect(routeTrend([run('a', 1500), run('b', 0)])).toBeNull();
  });

  it('compares the newest run with the few before it', () => {
    const trend = routeTrend([
      run('a', 1400),
      run('b', 1500),
      run('c', 1500),
      run('d', 1500),
      run('e', 9000),
    ]);
    expect(trend?.direction).toBe('faster');
    expect(trend?.deltaSeconds).toBe(-100);
    expect(trend?.durations).toEqual([9000, 1500, 1500, 1500, 1400]);
  });

  it('calls a slower run slower and a close one steady', () => {
    expect(routeTrend([run('a', 1700), run('b', 1500)])).toMatchObject({
      direction: 'slower',
      deltaSeconds: 200,
    });
    expect(routeTrend([run('a', 1510), run('b', 1500)])?.direction).toBe(
      'steady'
    );
  });

  it('draws at most eight bars, oldest first', () => {
    const many = Array.from({ length: 12 }, (_, i) => run(`r${i}`, 1000 + i));
    const trend = routeTrend(many);
    expect(trend?.durations).toHaveLength(TREND_MAX_BARS);
    expect(trend?.durations[TREND_MAX_BARS - 1]).toBe(1000);
  });

  it('ignores hostile durations', () => {
    expect(
      routeTrend([run('a', Number.NaN), run('b', 1500), run('c', -5)])
    ).toBeNull();
  });
});
