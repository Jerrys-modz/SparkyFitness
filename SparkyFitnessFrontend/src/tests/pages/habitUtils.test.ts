import { computeStreak } from '@/pages/Habits/habitUtils';

const log = (entry_date: string, completed = true, habit_id = 'h1') => ({
  habit_id,
  entry_date,
  completed,
});

describe('computeStreak', () => {
  it('counts consecutive completed days ending on the date', () => {
    const logs = [log('2026-10-04'), log('2026-10-05'), log('2026-10-06')];
    expect(computeStreak(logs, 'h1', '2026-10-06')).toBe(3);
  });

  it('keeps the streak when the selected day is not done yet', () => {
    const logs = [log('2026-10-04'), log('2026-10-05')];
    expect(computeStreak(logs, 'h1', '2026-10-06')).toBe(2);
  });

  it('stops at a gap or a missed day and ignores other habits', () => {
    const logs = [
      log('2026-10-03'),
      log('2026-10-05', false),
      log('2026-10-06'),
      log('2026-10-05', true, 'h2'),
    ];
    expect(computeStreak(logs, 'h1', '2026-10-06')).toBe(1);
  });
});
