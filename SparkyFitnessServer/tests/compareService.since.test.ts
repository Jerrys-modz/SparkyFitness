import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addDays,
  CompareModeError,
  todayInZone,
  type CompareSinceQuery,
} from '@workspace/shared';
import compareRepository from '../models/compareRepository.js';
import preferenceRepository from '../models/preferenceRepository.js';
import userRepository from '../models/userRepository.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import { getCompareSince } from '../services/compareService.js';

vi.mock('../models/compareRepository.js');
vi.mock('../models/reportRepository.js');
vi.mock('../models/preferenceRepository.js');
vi.mock('../models/userRepository.js');
vi.mock('../utils/timezoneLoader.js', () => ({ loadUserTimezone: vi.fn() }));
// Pin "today" without touching the clock: only the service's own call is replaced.
vi.mock('@workspace/shared', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@workspace/shared')>()),
  todayInZone: vi.fn(),
}));

const USER = '00000000-0000-4000-a000-000000000001';
const TODAY = '2026-10-21'; // a Wednesday
const YESTERDAY = addDays(TODAY, -1);

const query = (extra: Partial<CompareSinceQuery> = {}): CompareSinceQuery => ({
  a: 'meditationMinutes',
  b: 'mood',
  mode: 'since',
  ...extra,
});

/** Every day from first to last inclusive. */
function daysFrom(first: string, last: string): string[] {
  const days: string[] = [];
  for (let day = first; day <= last; day = addDays(day, 1)) days.push(day);
  return days;
}

const meditationRow = (day: string) => ({ day, minutes: 10, sessions: 1 });
const moodRow = (day: string, mood: number) => ({
  day,
  mood,
  energy: null,
  focus: null,
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(loadUserTimezone).mockResolvedValue('UTC');
  vi.mocked(todayInZone).mockReturnValue(TODAY);
  vi.mocked(preferenceRepository.getUserPreferences).mockResolvedValue(
    undefined
  );
  vi.mocked(userRepository.getUserProfile).mockResolvedValue(undefined);
  vi.mocked(compareRepository.getManualMoodDays).mockResolvedValue([]);
  vi.mocked(compareRepository.getMainSleepDays).mockResolvedValue([]);
  vi.mocked(compareRepository.getMeditationDays).mockResolvedValue([]);
  vi.mocked(compareRepository.getMeditationFirstDay).mockResolvedValue(null);
  vi.mocked(compareRepository.getCheckInDays).mockResolvedValue([]);
});

/** Meditation every day in from..to, and mood 5 before `start`, 8 from it. */
function seedHabit(
  from: string,
  to: string,
  start: string,
  outcomeFrom: string
) {
  vi.mocked(compareRepository.getMeditationFirstDay).mockResolvedValue(from);
  vi.mocked(compareRepository.getMeditationDays).mockImplementation(
    async (_user, f, t) =>
      daysFrom(from, to)
        .filter((d) => d >= f && d <= t && d >= start)
        .map(meditationRow)
  );
  vi.mocked(compareRepository.getManualMoodDays).mockImplementation(
    async (_user, f, t) =>
      daysFrom(outcomeFrom, to)
        .filter((d) => d >= f && d <= t)
        .map((d) => moodRow(d, d < start ? 5 : 8))
  );
}

describe('getCompareSince: validation', () => {
  it('rejects a habitStart that is today, before loading anything', async () => {
    await expect(
      getCompareSince(USER, query({ habitStart: TODAY }))
    ).rejects.toBeInstanceOf(CompareModeError);
    expect(compareRepository.getMeditationDays).not.toHaveBeenCalled();
    expect(compareRepository.getManualMoodDays).not.toHaveBeenCalled();
  });

  it('rejects a habitStart 731 days ago and accepts 730', async () => {
    await expect(
      getCompareSince(USER, query({ habitStart: addDays(TODAY, -731) }))
    ).rejects.toBeInstanceOf(CompareModeError);
    await expect(
      getCompareSince(USER, query({ habitStart: addDays(TODAY, -730) }))
    ).resolves.toMatchObject({ mode: 'since' });
  });
});

describe('getCompareSince: fetch range', () => {
  it('loads both metrics over 736 days back to yesterday for a recent start', async () => {
    await getCompareSince(USER, query({ habitStart: addDays(TODAY, -100) }));
    const from = addDays(TODAY, -736);
    expect(compareRepository.getMeditationDays).toHaveBeenCalledWith(
      USER,
      from,
      YESTERDAY
    );
    expect(compareRepository.getManualMoodDays).toHaveBeenCalledWith(
      USER,
      from,
      YESTERDAY
    );
  });

  it('loads the outcome further back for a start 500 days ago; the habit stays at 736', async () => {
    const start = addDays(TODAY, -500);
    await getCompareSince(USER, query({ habitStart: start }));
    expect(compareRepository.getMeditationDays).toHaveBeenCalledWith(
      USER,
      addDays(TODAY, -736),
      YESTERDAY
    );
    expect(compareRepository.getManualMoodDays).toHaveBeenCalledWith(
      USER,
      addDays(start, -371),
      YESTERDAY
    );
  });

  it('without a start, loads the habit first and sizes the outcome from the suggestion', async () => {
    const start = addDays(TODAY, -600);
    seedHabit(addDays(TODAY, -736), YESTERDAY, start, addDays(TODAY, -736));
    const { result } = await getCompareSince(USER, query());
    expect(result.suggestedStart).not.toBeNull();
    expect(compareRepository.getManualMoodDays).toHaveBeenCalledWith(
      USER,
      addDays(result.suggestedStart ?? '', -371),
      YESTERDAY
    );
  });

  it('without a start or a suggestion, loads the outcome from 736 days back', async () => {
    await getCompareSince(USER, query());
    expect(compareRepository.getManualMoodDays).toHaveBeenCalledWith(
      USER,
      addDays(TODAY, -736),
      YESTERDAY
    );
  });
});

describe('getCompareSince: start and line', () => {
  const start = addDays(TODAY, -100);
  const from = addDays(TODAY, -736);

  it('uses the suggestion when no habitStart is given', async () => {
    seedHabit(from, YESTERDAY, start, addDays(TODAY, -300));
    const { result } = await getCompareSince(USER, query());
    expect(result.suggestedStart).not.toBeNull();
    expect(result.start).toBe(result.suggestedStart);
  });

  it('an explicit habitStart overrides the suggestion', async () => {
    seedHabit(from, YESTERDAY, start, addDays(TODAY, -300));
    const explicit = addDays(TODAY, -60);
    const { result } = await getCompareSince(
      USER,
      query({ habitStart: explicit })
    );
    expect(result.start).toBe(explicit);
    expect(result.suggestedStart).not.toBe(explicit);
  });

  it('passes line through', async () => {
    seedHabit(from, YESTERDAY, start, addDays(TODAY, -300));
    const { result } = await getCompareSince(USER, query({ line: 6.5 }));
    expect(result.line).toBe(6.5);
  });

  it('reads mood from the manual check-ins', async () => {
    await getCompareSince(USER, query({ habitStart: start }));
    expect(compareRepository.getManualMoodDays).toHaveBeenCalled();
  });

  it('never suggests a start older than 730 days (R10)', async () => {
    const old = addDays(TODAY, -736);
    vi.mocked(compareRepository.getMeditationFirstDay).mockResolvedValue(old);
    vi.mocked(compareRepository.getMeditationDays).mockResolvedValue(
      daysFrom(old, addDays(old, 27)).map(meditationRow)
    );
    const { result } = await getCompareSince(USER, query());
    // The run's first days are older than a start may be, so the suggestion starts inside the limit.
    expect(result.suggestedStart).toBe(addDays(TODAY, -730));
  });
});

describe('getCompareSince: response', () => {
  it('with no start, returns empty values', async () => {
    const response = await getCompareSince(USER, query());
    expect(response.mode).toBe('since');
    expect(response.result).toMatchObject({
      status: 'not_enough',
      reason: 'noStart',
      start: null,
    });
    expect(response.habit).toEqual({ key: 'meditationMinutes', values: {} });
    expect(response.outcome).toEqual({ key: 'mood', values: {} });
  });

  it('trims values to the before stretch start through yesterday', async () => {
    const start = addDays(TODAY, -60);
    const from = addDays(TODAY, -736);
    seedHabit(from, YESTERDAY, start, addDays(TODAY, -300));
    const { result, habit, outcome } = await getCompareSince(
      USER,
      query({ habitStart: start })
    );
    const first = result.before?.days ? result.before.from : result.since?.from;
    const days = Object.keys(outcome.values).sort();
    expect(days[0]).toBe(first);
    expect(days[days.length - 1]).toBe(YESTERDAY);
    expect(Object.keys(habit.values).every((d) => d >= (first ?? ''))).toBe(
      true
    );
    expect(Object.keys(habit.values).every((d) => d <= YESTERDAY)).toBe(true);
  });
});
