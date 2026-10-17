import type { RouteRun } from '@workspace/shared';
import { formatRunPace, routeBestNote } from '../../src/utils/routeHistory';

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
  });

  it('keeps seconds per km and converts to per mile', () => {
    expect(formatRunPace(300, 'km')).toBe('5:00');
    expect(formatRunPace(300, 'miles')).toBe('8:03');
  });
});
