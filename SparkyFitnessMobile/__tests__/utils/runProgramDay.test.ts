import { programStatus } from '@workspace/shared';
import { programDayCard } from '../../src/utils/runProgramDay';

const status = programStatus({ programId: 'beginner5k', next: 3 })!;
// 2026-10-12 is a Monday (weekday 1).
const base = {
  enabled: true,
  status,
  runDays: [] as number[],
  doneDay: null as string | null,
  today: '2026-10-12',
  date: '2026-10-12',
};

describe('programDayCard', () => {
  it('offers the next workout every day when no run days are chosen', () => {
    expect(programDayCard(base)).toBe('upNext');
  });

  it('says scheduled on a chosen run day and stays quiet on the others', () => {
    expect(programDayCard({ ...base, runDays: [1, 3, 6] })).toBe('scheduled');
    expect(programDayCard({ ...base, runDays: [2, 4] })).toBeNull();
  });

  it('only shows for today', () => {
    expect(programDayCard({ ...base, date: '2026-10-11' })).toBeNull();
    expect(programDayCard({ ...base, date: '2026-10-13' })).toBeNull();
  });

  it('hides once a workout has been done today, but not from yesterday', () => {
    expect(programDayCard({ ...base, doneDay: '2026-10-12' })).toBeNull();
    expect(programDayCard({ ...base, doneDay: '2026-10-11' })).toBe('upNext');
  });

  it('hides when the program is off, missing or finished', () => {
    expect(programDayCard({ ...base, enabled: false })).toBeNull();
    expect(programDayCard({ ...base, status: null })).toBeNull();
    const finished = programStatus({ programId: 'beginner5k', next: 27 })!;
    expect(programDayCard({ ...base, status: finished })).toBeNull();
  });
});
