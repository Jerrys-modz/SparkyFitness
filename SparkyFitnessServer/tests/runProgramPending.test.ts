import { describe, expect, it } from 'vitest';
import { pendingEffortRating } from '@workspace/shared';

const NOW = Date.parse('2026-10-13T12:00:00Z');
const done = (index: number, at: string) => ({
  index,
  entry_id: `e${index}`,
  at,
});

describe('pendingEffortRating', () => {
  it('asks about the latest unrated workout', () => {
    expect(
      pendingEffortRating([done(2, '2026-10-13T08:00:00Z')], [], NOW)?.index
    ).toBe(2);
  });

  it('does not ask once it is rated', () => {
    expect(
      pendingEffortRating(
        [done(2, '2026-10-13T08:00:00Z')],
        [{ index: 2, rating: 6, at: '2026-10-13T09:00:00Z' }],
        NOW
      )
    ).toBeNull();
  });

  it('stops asking after two days, or with no workouts', () => {
    expect(
      pendingEffortRating([done(2, '2026-10-10T08:00:00Z')], [], NOW)
    ).toBeNull();
    expect(pendingEffortRating([], [], NOW)).toBeNull();
  });
});
