import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { trainingCalendarResponseSchema } from '@workspace/shared';

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn().mockResolvedValue('UTC'),
}));
vi.mock('../services/reportService.js', () => ({
  loadMaxHeartRate: vi.fn().mockResolvedValue(190),
}));
vi.mock('../models/preferenceRepository.js', () => ({
  default: {
    getUserPreferences: vi.fn().mockResolvedValue({ first_day_of_week: 1 }),
  },
}));
vi.mock('../models/reportRepository.js', () => ({
  default: {
    getCalendarEntries: vi.fn(),
    getEntryDays: vi.fn(),
    getTrainingLoadSessions: vi.fn(),
  },
}));
vi.mock('../models/workoutPlanTemplateRepository.js', () => ({
  default: {
    getPlanTemplatesForCalendar: vi.fn(),
    getActiveWorkoutPlanForDate: vi.fn(),
  },
}));
vi.mock('../models/runProgramRepository.js', () => ({
  getRunProgram: vi.fn(),
}));

import reportRepository from '../models/reportRepository.js';
import workoutPlanTemplateRepository from '../models/workoutPlanTemplateRepository.js';
import { getRunProgram } from '../models/runProgramRepository.js';
import { getTrainingCalendar } from '../services/trainingCalendarService.js';

const reports = vi.mocked(reportRepository);
const plans = vi.mocked(workoutPlanTemplateRepository);
const programRepo = vi.mocked(getRunProgram);

const row = (overrides: Record<string, unknown>) => ({
  id: '00000000-0000-4000-8000-000000000001',
  day: '2026-10-13',
  exerciseName: 'Morning run',
  category: 'cardio',
  notes: null,
  providerName: null,
  detailData: null,
  exerciseSourceId: null,
  durationMinutes: 30,
  distanceKm: 5,
  avgHeartRate: null,
  workoutPlanAssignmentId: null,
  ...overrides,
});

const workout = {
  week: 0,
  day: 0,
  plan: {
    style: 'runWalk' as const,
    steps: [{ kind: 'work' as const, seconds: 1800 }],
  },
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-14T12:00:00Z'));
  vi.clearAllMocks();
  reports.getEntryDays.mockResolvedValue(new Map());
  reports.getTrainingLoadSessions.mockResolvedValue([]);
  reports.getCalendarEntries.mockResolvedValue([]);
  plans.getPlanTemplatesForCalendar.mockResolvedValue([]);
  plans.getActiveWorkoutPlanForDate.mockResolvedValue([]);
  programRepo.mockResolvedValue(null);
});
afterEach(() => vi.useRealTimers());

describe('getTrainingCalendar', () => {
  it('returns only completed work and per-sport load without any plan', async () => {
    reports.getCalendarEntries.mockResolvedValue([
      row({}),
      row({
        id: '00000000-0000-4000-8000-000000000002',
        exerciseName: 'Lunch ride',
        durationMinutes: 60,
        avgHeartRate: 140,
      }),
    ]);
    const result = await getTrainingCalendar(
      'me',
      'me',
      '2026-10-12',
      '2026-10-18'
    );
    expect(trainingCalendarResponseSchema.safeParse(result).success).toBe(true);
    expect(result.planned).toEqual([]);
    expect(result.completed.map((c) => [c.sport, c.load, c.loadBasis])).toEqual(
      [
        ['running', 60, 'estimated'],
        ['cycling', 180, 'heartRate'],
      ]
    );
    expect(result.sportLoad.total).toMatchObject({ running: 60, cycling: 180 });
    expect(result.weeks[0]).toMatchObject({
      start: '2026-10-12',
      extraSessions: 2,
      completedSessions: 2,
    });
  });

  it('matches the run program through the entry it was completed as', async () => {
    const entryId = '00000000-0000-4000-8000-000000000001';
    programRepo.mockResolvedValue({
      id: 'p',
      program_id: 'beginner5k',
      enabled: true,
      next_index: 1,
      workouts: [workout, workout, workout],
      adjustment_log: [],
      effort_log: [],
      completion_log: [
        { index: 0, entry_id: entryId, at: '2026-10-13T08:00:00Z' },
      ],
      run_days: [2, 3, 5],
      start_date: '2026-10-12',
      end_date: null,
      last_done_date: '2026-10-13',
      updated_at: '2026-10-13T08:00:00Z',
    });
    reports.getEntryDays.mockResolvedValue(new Map([[entryId, '2026-10-13']]));
    reports.getCalendarEntries.mockResolvedValue([
      row({ durationMinutes: 5, exerciseName: 'Beginner 5K week 1' }),
    ]);
    const result = await getTrainingCalendar(
      'me',
      'me',
      '2026-10-12',
      '2026-10-18'
    );
    expect(
      result.planned.map((p) => [p.day, p.workoutNumber, p.status])
    ).toEqual([
      ['2026-10-13', 1, 'done'],
      ['2026-10-14', 2, 'upcoming'],
      ['2026-10-16', 3, 'upcoming'],
    ]);
    expect(result.completed[0]?.plannedItemId).toBe('runProgram:2026-10-13:0');
    expect(result.weeks[0]).toMatchObject({
      plannedSessions: 3,
      doneSessions: 1,
      plannedMinutes: 90,
      extraSessions: 0,
    });
  });

  it('plans a weekly workout plan on its days and finds it missed', async () => {
    plans.getPlanTemplatesForCalendar.mockResolvedValue([
      {
        id: 4,
        plan_name: 'Push pull',
        schedule_type: 'weekly',
        start_day: '2026-10-01',
        end_day: null,
        assignments: [
          {
            id: 40,
            day_of_week: 1,
            session_index: null,
            session_name: 'Push',
            name: 'Push day',
            modality: null,
            is_preset: true,
            minutes: 45,
          },
        ],
      },
    ]);
    const result = await getTrainingCalendar(
      'me',
      'me',
      '2026-10-12',
      '2026-10-18'
    );
    expect(result.planned).toHaveLength(1);
    expect(result.planned[0]).toMatchObject({
      day: '2026-10-12',
      label: 'Push',
      sport: 'strength',
      status: 'missed',
      plannedMinutes: 45,
    });
  });

  it('shows the next session of a sequential plan today', async () => {
    plans.getPlanTemplatesForCalendar.mockResolvedValue([
      {
        id: 5,
        plan_name: 'Full body',
        schedule_type: 'sequential',
        start_day: '2026-10-01',
        end_day: null,
        assignments: [
          {
            id: 50,
            day_of_week: null,
            session_index: 1,
            session_name: 'A',
            name: 'A',
            modality: null,
            is_preset: true,
            minutes: null,
          },
          {
            id: 51,
            day_of_week: null,
            session_index: 2,
            session_name: 'B',
            name: 'B',
            modality: null,
            is_preset: true,
            minutes: null,
          },
        ],
      },
    ]);
    plans.getActiveWorkoutPlanForDate.mockResolvedValue([
      { id: 5, next_assignments: [{ id: 51 }] },
    ] as never);
    const result = await getTrainingCalendar(
      'me',
      'me',
      '2026-10-12',
      '2026-10-18'
    );
    expect(result.planned.map((p) => [p.day, p.label, p.status])).toEqual([
      ['2026-10-14', 'B', 'upcoming'],
    ]);
  });
});
