import type { TrainingCalendarResponse } from '@workspace/shared';
import {
  currentSplits,
  itemsByDay,
  monthRange,
  sportLoadRange,
  sportShares,
  weekDays,
} from '../../src/utils/trainingCalendar';

const none = { running: 0, cycling: 0, walking: 0, strength: 0, other: 0 };

describe('trainingCalendar helpers', () => {
  it('asks the month grid from the first day of the week', () => {
    // October 2026 starts on a Thursday.
    expect(monthRange('2026-10', 1)).toMatchObject({
      start: '2026-09-28',
      end: '2026-11-01',
    });
    expect(monthRange('2026-10', 0).start).toBe('2026-09-27');
  });

  it('lists the seven days of a week', () => {
    expect(weekDays('2026-10-14', 1)).toEqual([
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
      '2026-10-18',
    ]);
  });

  it('reaches back past eight weeks and the month for the load card', () => {
    expect(sportLoadRange('2026-10-14')).toEqual({
      start: '2026-08-13',
      end: '2026-10-14',
    });
  });

  it('shares load between sports, biggest first, without empty ones', () => {
    const shares = sportShares({ ...none, running: 60, strength: 180 });
    expect(shares.map((s) => [s.sport, s.load, s.share])).toEqual([
      ['strength', 180, 0.75],
      ['running', 60, 0.25],
    ]);
    expect(sportShares({ ...none })).toEqual([]);
    expect(sportShares(undefined)).toEqual([]);
  });

  it('groups items by day', () => {
    const data = {
      planned: [{ id: 'p', day: '2026-10-14' }],
      completed: [
        { id: 'c1', day: '2026-10-14' },
        { id: 'c2', day: '2026-10-13' },
      ],
    } as unknown as TrainingCalendarResponse;
    const days = itemsByDay(data);
    expect(days.get('2026-10-14')?.planned).toHaveLength(1);
    expect(days.get('2026-10-14')?.completed).toHaveLength(1);
    expect(days.get('2026-10-13')?.planned).toEqual([]);
  });

  it('picks the week and month that hold today', () => {
    const data = {
      sportLoad: {
        weeks: [
          { start: '2026-10-05', bySport: { ...none, running: 10 } },
          { start: '2026-10-12', bySport: { ...none, running: 20 } },
        ],
        months: [
          { month: '2026-09', bySport: { ...none, running: 1 } },
          { month: '2026-10', bySport: { ...none, running: 30 } },
        ],
        total: none,
      },
    } as unknown as TrainingCalendarResponse;
    const { week, month } = currentSplits(data, '2026-10-14');
    expect(week?.running).toBe(20);
    expect(month?.running).toBe(30);
  });
});
