import { beforeEach, describe, expect, it, vi } from 'vitest';
// @ts-expect-error TS7016 supertest typing
import request from 'supertest';
import express from 'express';
import {
  CHECKIN_COACH_IDS,
  COACH_CHECKINS_MAX_PER_DAY,
  computeLoggingStreak,
  evaluateCoachTriggers,
  updateCoachCheckinSettingsBodySchema,
  type CoachTriggerFacts,
} from '@workspace/shared';
import errorHandler from '../middleware/errorHandler.js';
import coachCheckinRoutes from '../routes/v2/coachCheckinRoutes.js';
import * as repository from '../models/coachCheckinRepository.js';
import coachRepository from '../models/coachRepository.js';
import chatRepository from '../models/chatRepository.js';
import goalService from '../services/goalService.js';
import { dispatchAiRequest } from '../ai/providerDispatch.js';
import {
  hourInZone,
  runCheckinForUser,
  runScheduledCoachCheckins,
} from '../services/coachCheckinService.js';

vi.mock('../models/coachCheckinRepository.js');
vi.mock('../models/coachRepository');
vi.mock('../models/chatRepository');
vi.mock('../models/preferenceRepository');
vi.mock('../services/goalService');
vi.mock('../services/assistantMemoryService.js', () => ({
  loadAssistantMemory: vi.fn().mockResolvedValue([]),
  formatAssistantMemory: vi.fn().mockReturnValue(''),
}));
vi.mock('../ai/providerDispatch.js');
vi.mock('../config/logging', () => ({ log: vi.fn() }));
vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn().mockResolvedValue('UTC'),
}));
vi.mock('../utils/adminCheck.js', () => ({
  resolveIsAdminByUserId: vi.fn().mockResolvedValue(false),
}));
vi.mock('../utils/outboundUrlPolicy.js', () => ({
  resolveAiNetworkPolicy: vi.fn().mockResolvedValue({}),
}));
vi.mock('../middleware/authMiddleware.js', () => ({
  authenticate: (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => {
    req.authenticatedUserId = 'actor';
    req.userId = 'family-member';
    next();
  },
}));

const TODAY = '2026-11-12';
const quiet: CoachTriggerFacts = {
  today: TODAY,
  loggedDays: [TODAY, '2026-11-11'],
  yesterday: { foodEntries: 4, proteinGrams: 140, workouts: 0 },
  proteinGoalGrams: 140,
  lastNightSleepHours: 7.5,
  workoutsLast3Days: 0,
};

function days(from: string, count: number): string[] {
  const out: string[] = [];
  const start = Date.parse(from);
  for (let i = 0; i < count; i++) {
    out.push(new Date(start - i * 86_400_000).toISOString().slice(0, 10));
  }
  return out;
}

describe('evaluateCoachTriggers', () => {
  it('says nothing on an ordinary day', () => {
    expect(evaluateCoachTriggers(quiet)).toEqual([]);
  });

  it('flags low protein only after a training day with food logged', () => {
    const trained = {
      ...quiet,
      yesterday: { foodEntries: 3, proteinGrams: 80, workouts: 1 },
    };
    expect(evaluateCoachTriggers(trained)).toEqual([
      {
        type: 'low_protein_after_training',
        coachKey: 'recovery',
        facts: { protein: 80, goal: 140 },
      },
    ]);
    // No workout, no food logged (unknown, not zero), no goal, or close enough.
    for (const other of [
      { ...trained, yesterday: { ...trained.yesterday, workouts: 0 } },
      { ...trained, yesterday: { ...trained.yesterday, foodEntries: 0 } },
      { ...trained, proteinGoalGrams: null },
      { ...trained, yesterday: { ...trained.yesterday, proteinGrams: 115 } },
    ]) {
      expect(evaluateCoachTriggers(other)).toEqual([]);
    }
  });

  it('flags a short night only on top of recent training', () => {
    const tired = { ...quiet, lastNightSleepHours: 5.25, workoutsLast3Days: 2 };
    expect(evaluateCoachTriggers(tired)).toEqual([
      {
        type: 'short_sleep_under_load',
        coachKey: 'sleep_recovery',
        facts: { hours: 5.3, workouts: 2 },
      },
    ]);
    expect(evaluateCoachTriggers({ ...tired, workoutsLast3Days: 1 })).toEqual(
      []
    );
    expect(
      evaluateCoachTriggers({ ...tired, lastNightSleepHours: null })
    ).toEqual([]);
  });

  it('mentions a logging gap on day 2 and day 5 only', () => {
    const fired = [1, 2, 3, 4, 5, 6, 10].filter((gap) => {
      const last = days(TODAY, gap + 1)[gap];
      return evaluateCoachTriggers({ ...quiet, loggedDays: [last] }).some(
        (trigger) => trigger.type === 'logging_gap'
      );
    });
    expect(fired).toEqual([2, 5]);
    expect(evaluateCoachTriggers({ ...quiet, loggedDays: [] })).toEqual([]);
  });

  it('celebrates a streak of finished days exactly at a milestone', () => {
    const yesterday = '2026-11-11';
    const at = (length: number) =>
      evaluateCoachTriggers({
        ...quiet,
        loggedDays: [TODAY, ...days(yesterday, length)],
      }).filter((trigger) => trigger.type === 'streak_milestone');
    expect(at(7)).toEqual([
      { type: 'streak_milestone', coachKey: 'consistency', facts: { days: 7 } },
    ]);
    expect(at(6)).toEqual([]);
    expect(at(8)).toEqual([]);
  });
});

describe('computeLoggingStreak', () => {
  it('counts back from today or yesterday and stops at a gap', () => {
    expect(computeLoggingStreak([], TODAY)).toBe(0);
    expect(computeLoggingStreak(days(TODAY, 4), TODAY)).toBe(4);
    expect(computeLoggingStreak(days('2026-11-11', 3), TODAY)).toBe(3);
    expect(computeLoggingStreak(days('2026-11-10', 3), TODAY)).toBe(0);
    expect(
      computeLoggingStreak([TODAY, '2026-11-11', '2026-11-08'], TODAY)
    ).toBe(2);
  });
});

describe('hourInZone', () => {
  it('reads the hour in the person’s timezone', () => {
    const noonUtc = new Date('2026-11-12T12:30:00Z');
    expect(hourInZone('UTC', noonUtc)).toBe(12);
    expect(hourInZone('Asia/Tokyo', noonUtc)).toBe(21);
    expect(hourInZone('America/Los_Angeles', noonUtc)).toBe(4);
    expect(hourInZone('UTC', new Date('2026-11-12T00:05:00Z'))).toBe(0);
  });
});

const settings = {
  enabled: true,
  coach_ids: ['builtin:recovery', 'builtin:sleep_recovery'],
  checkin_hour: 9,
  ai_wording: false,
};

function mockBusyDay() {
  vi.mocked(repository.getCheckinDayFacts).mockResolvedValue({
    loggedDays: [TODAY, '2026-11-11'],
    yesterdayWorkouts: 1,
    workoutsLast3Days: 2,
    lastNightSleepHours: 5,
  });
  vi.mocked(coachRepository.getDayNutritionTotals).mockResolvedValue({
    calories: 1800,
    protein: 70,
    carbs: 200,
    fat: 60,
    entry_count: 4,
  });
  vi.mocked(goalService.getUserGoals).mockResolvedValue({ protein: 140 });
}

describe('runCheckinForUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(repository.countMessagesOnDay).mockResolvedValue(0);
    vi.mocked(repository.hasRecentMessage).mockResolvedValue(false);
    vi.mocked(repository.insertMessage).mockResolvedValue(true);
    mockBusyDay();
  });

  it('does nothing while check-ins are off or no coach is chosen', async () => {
    expect(
      await runCheckinForUser('u', { ...settings, enabled: false }, TODAY)
    ).toBe(0);
    expect(
      await runCheckinForUser('u', { ...settings, coach_ids: [] }, TODAY)
    ).toBe(0);
    expect(repository.getCheckinDayFacts).not.toHaveBeenCalled();
  });

  it('writes one message per chosen coach without calling the AI', async () => {
    expect(await runCheckinForUser('u', settings, TODAY)).toBe(2);
    expect(dispatchAiRequest).not.toHaveBeenCalled();
    const written = vi
      .mocked(repository.insertMessage)
      .mock.calls.map((call) => [call[1], call[2].type, call[4]]);
    expect(written).toEqual([
      ['builtin:recovery', 'low_protein_after_training', null],
      ['builtin:sleep_recovery', 'short_sleep_under_load', null],
    ]);
  });

  it('skips a coach that is not switched on', async () => {
    const only = { ...settings, coach_ids: ['builtin:sleep_recovery'] };
    expect(await runCheckinForUser('u', only, TODAY)).toBe(1);
    expect(vi.mocked(repository.insertMessage).mock.calls[0][1]).toBe(
      'builtin:sleep_recovery'
    );
  });

  it('keeps to the daily limit across runs', async () => {
    vi.mocked(repository.countMessagesOnDay).mockResolvedValue(
      COACH_CHECKINS_MAX_PER_DAY - 1
    );
    expect(await runCheckinForUser('u', settings, TODAY)).toBe(1);

    vi.mocked(repository.countMessagesOnDay).mockResolvedValue(
      COACH_CHECKINS_MAX_PER_DAY
    );
    expect(await runCheckinForUser('u', settings, TODAY)).toBe(0);
  });

  it('does not repeat an observation the coach made recently', async () => {
    vi.mocked(repository.hasRecentMessage).mockImplementation(
      async (_user, _coach, type) => type === 'low_protein_after_training'
    );
    expect(await runCheckinForUser('u', settings, TODAY)).toBe(1);
  });

  it('does not count a message that already existed', async () => {
    vi.mocked(repository.insertMessage).mockResolvedValue(false);
    expect(await runCheckinForUser('u', settings, TODAY)).toBe(0);
  });

  it('uses the AI service for wording only when asked, and survives its failure', async () => {
    vi.mocked(chatRepository.getActiveAiServiceSetting).mockResolvedValue({
      id: 'svc',
    });
    vi.mocked(chatRepository.getAiServiceSettingForBackend).mockResolvedValue({
      id: 'svc',
      service_type: 'openai',
      api_key: 'k',
      model_name: 'm',
      custom_url: null,
    });
    vi.mocked(dispatchAiRequest)
      .mockResolvedValueOnce({
        ok: true,
        text: '',
        json: { message: 'A little more protein today would help.' },
      })
      .mockResolvedValueOnce({ ok: false, category: 'timeout', detail: 'x' });

    expect(
      await runCheckinForUser('u', { ...settings, ai_wording: true }, TODAY)
    ).toBe(2);
    const texts = vi
      .mocked(repository.insertMessage)
      .mock.calls.map((call) => call[4]);
    expect(texts).toEqual(['A little more protein today would help.', null]);
    expect(vi.mocked(dispatchAiRequest).mock.calls[0][0].prompt).toContain(
      'logged 70 g of protein against a daily goal of 140 g'
    );
  });
});

describe('runScheduledCoachCheckins', () => {
  const due = (overrides: Partial<repository.DueCheckin>) => ({
    ...settings,
    user_id: 'u1',
    last_evaluated_day: null,
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${TODAY}T10:00:00Z`));
    vi.mocked(repository.countMessagesOnDay).mockResolvedValue(0);
    vi.mocked(repository.hasRecentMessage).mockResolvedValue(false);
    vi.mocked(repository.insertMessage).mockResolvedValue(true);
    vi.mocked(repository.claimEvaluationDay).mockResolvedValue(true);
    vi.mocked(repository.deleteOldMessages).mockResolvedValue(0);
    mockBusyDay();
    return () => vi.useRealTimers();
  });

  it('waits for the chosen hour and evaluates a day once', async () => {
    vi.mocked(repository.listEnabledCheckins).mockResolvedValue([
      due({ user_id: 'early', checkin_hour: 18 }),
      due({ user_id: 'done', last_evaluated_day: TODAY }),
      due({ user_id: 'ready' }),
    ]);
    await runScheduledCoachCheckins(new Date(`${TODAY}T10:00:00Z`));
    expect(repository.claimEvaluationDay).toHaveBeenCalledTimes(1);
    expect(repository.claimEvaluationDay).toHaveBeenCalledWith('ready', TODAY);
    expect(repository.insertMessage).toHaveBeenCalled();
  });

  it('skips a day another run already claimed', async () => {
    vi.mocked(repository.listEnabledCheckins).mockResolvedValue([due({})]);
    vi.mocked(repository.claimEvaluationDay).mockResolvedValue(false);
    await runScheduledCoachCheckins(new Date(`${TODAY}T10:00:00Z`));
    expect(repository.insertMessage).not.toHaveBeenCalled();
  });

  it('carries on after one person’s check fails', async () => {
    vi.mocked(repository.listEnabledCheckins).mockResolvedValue([
      due({ user_id: 'broken' }),
      due({ user_id: 'fine' }),
    ]);
    vi.mocked(repository.getCheckinDayFacts)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue({
        loggedDays: [TODAY],
        yesterdayWorkouts: 1,
        workoutsLast3Days: 2,
        lastNightSleepHours: 5,
      });
    await runScheduledCoachCheckins(new Date(`${TODAY}T10:00:00Z`));
    expect(
      vi
        .mocked(repository.insertMessage)
        .mock.calls.every((call) => call[0] === 'fine')
    ).toBe(true);
    expect(repository.insertMessage).toHaveBeenCalled();
    expect(repository.deleteOldMessages).toHaveBeenCalled();
  });
});

describe('coach check-in settings contract', () => {
  it('accepts only coaches that can check in', () => {
    expect(CHECKIN_COACH_IDS).toContain('builtin:recovery');
    expect(CHECKIN_COACH_IDS).not.toContain('builtin:macro_timing');
    const ok = updateCoachCheckinSettingsBodySchema.safeParse({
      enabled: true,
      coach_ids: ['builtin:recovery'],
    });
    expect(ok.success).toBe(true);
    for (const bad of [
      {},
      { coach_ids: ['builtin:macro_timing'] },
      { coach_ids: ['builtin:recovery', 'builtin:recovery'] },
      { checkin_hour: 24 },
      { enabled: 'yes' },
      { user_id: 'someone-else' },
    ]) {
      expect(updateCoachCheckinSettingsBodySchema.safeParse(bad).success).toBe(
        false
      );
    }
  });
});

describe('/api/v2/coach-checkins', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/v2/coach-checkins', coachCheckinRoutes);
  app.use(errorHandler);
  const ID = 'd3ebfc08-7f2e-4736-8b08-b8a0cbac2d17';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reads and saves settings for the signed-in person', async () => {
    vi.mocked(repository.getSettings).mockResolvedValue(settings);
    vi.mocked(repository.saveSettings).mockResolvedValue(settings);
    const read = await request(app).get('/api/v2/coach-checkins/settings');
    expect(read.body).toEqual(settings);
    expect(repository.getSettings).toHaveBeenCalledWith('actor');

    const saved = await request(app)
      .put('/api/v2/coach-checkins/settings')
      .send({ enabled: true });
    expect(saved.status).toBe(200);
    expect(repository.saveSettings).toHaveBeenCalledWith('actor', {
      enabled: true,
    });

    const bad = await request(app)
      .put('/api/v2/coach-checkins/settings')
      .send({ checkin_hour: 99 });
    expect(bad.status).toBe(400);
  });

  it('lists messages and marks them', async () => {
    vi.mocked(repository.listMessages).mockResolvedValue([]);
    expect(
      (await request(app).get('/api/v2/coach-checkins/messages')).status
    ).toBe(200);

    vi.mocked(repository.markMessage).mockResolvedValue(true);
    const dismissed = await request(app).post(
      `/api/v2/coach-checkins/messages/${ID}/dismiss`
    );
    expect(dismissed.status).toBe(204);
    expect(repository.markMessage).toHaveBeenCalledWith('actor', ID, 'dismiss');

    vi.mocked(repository.markMessage).mockResolvedValue(false);
    expect(
      (await request(app).post(`/api/v2/coach-checkins/messages/${ID}/read`))
        .status
    ).toBe(404);
    expect(
      (await request(app).post('/api/v2/coach-checkins/messages/nope/read'))
        .status
    ).toBe(404);
  });
});
