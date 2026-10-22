import { vi, beforeEach, describe, expect, it } from 'vitest';
import { buildCoachTools } from '../ai/tools/coachTools.js';
import { isReadOnlyTool } from '../ai/mcp/toolAccess.js';
import { getCoachingCheckIn } from '../services/weightCoachingService.js';
import { toolOpts } from './helpers/toolExecutionOptions.js';

vi.mock('../services/weightCoachingService.js', () => ({
  getCoachingCheckIn: vi.fn(),
}));
vi.mock('../models/coachRepository', () => ({ default: {} }));
vi.mock('../models/symptomRepository', () => ({ default: {} }));
vi.mock('../services/exerciseCalorieRangeService', () => ({
  getResolvedExerciseCaloriesTotal: vi.fn(),
}));
vi.mock('../config/logging', () => ({ log: vi.fn() }));

const CHECK_IN = {
  asOf: '2026-12-01',
  reason: 'behind',
  goal: { direction: 'lose', rateKgPerWeek: 0.5, targetWeeklyChangeKg: -0.5 },
  dataQuality: { ready: true, loggedDays: 20 },
  trend: {
    series: [{ date: '2026-12-01', weightKg: 80 }],
    currentKg: 80,
    weeklyRateKg: -0.1,
  },
  expenditure: {
    kcal: 2300,
    marginKcal: 120,
    avgIntakeKcal: 2100,
    history: [{ date: '2026-12-01', kcal: 2300, smoothedKcal: 2300 }],
  },
  current: { calories: 2000, protein: 150, carbs: 200, fat: 55 },
  suggested: { calories: 1800, protein: 140, carbs: 180, fat: 50 },
  limits: ['weekly-cap'],
  goalManagedBySettings: false,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('sparky_get_coaching_checkin', () => {
  it('is classified read-only for MCP keys', () => {
    expect(isReadOnlyTool('sparky_get_coaching_checkin')).toBe(true);
  });

  it('returns a compact read of the check-in without the raw series', async () => {
    vi.mocked(getCoachingCheckIn).mockResolvedValue(CHECK_IN as never);
    const tools = buildCoachTools('user-1', 'UTC');
    const text = (await tools.sparky_get_coaching_checkin.execute!(
      {},
      toolOpts
    )) as string;

    expect(getCoachingCheckIn).toHaveBeenCalledWith('user-1', 'user-1');
    expect(text.startsWith('# Weekly Coaching Check-In')).toBe(true);
    const body = JSON.parse(text.slice(text.indexOf('{')));
    expect(body).toMatchObject({
      reason: 'behind',
      estimated_expenditure_kcal: 2300,
      expenditure_margin_kcal: 120,
      suggested_target: { calories: 1800 },
      limits: ['weekly-cap'],
    });
    expect(text).not.toContain('"series"');
    expect(body.note).toMatch(/not medical advice/i);
  });

  it('answers with a database error rather than throwing', async () => {
    vi.mocked(getCoachingCheckIn).mockRejectedValue(new Error('boom'));
    const tools = buildCoachTools('user-1', 'UTC');
    const text = (await tools.sparky_get_coaching_checkin.execute!(
      {},
      toolOpts
    )) as string;
    expect(text).toContain('DB_ERROR');
  });
});
