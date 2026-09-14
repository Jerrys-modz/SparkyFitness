import { vi, beforeEach, describe, expect, it } from 'vitest';
import { todayInZone } from '@workspace/shared';
import { buildCaffeineKineticsTools } from '../ai/tools/caffeineKineticsTools.js';
import { getActiveCaffeineKinetics } from '../services/caffeineKineticsService.js';

vi.mock('../services/caffeineKineticsService.js', () => ({
  getActiveCaffeineKinetics: vi.fn(),
}));
vi.mock('../config/logging.js', () => ({
  log: vi.fn(),
}));

const svc = { getActiveCaffeineKinetics: vi.mocked(getActiveCaffeineKinetics) };

const opts = { toolCallId: 'tc-1', messages: [] };
const DB_ERROR_TEXT =
  'Error [DB_ERROR]: A database error occurred.\n\nSuggestion: Do NOT retry the same call — it will fail the same way. Tell the user what failed and stop.';

const KINETICS_RESULT = {
  half_life_hours: 5,
  target_bedtime: '22:30',
  bedtime_at: '2026-02-01T22:30:00.000Z',
  doses: [{ at: '2026-02-01T14:00:00.000Z', mg: 95, name: 'Coffee' }],
  active_mg_now: 60,
  at_bedtime_mg: 12,
  latest_safe_dose_time: '16:45',
  cutoff_state: 'by' as const,
  bedtime_headroom_mg: 88,
  cutoff_dose_mg: 200,
  threshold_mg: 100,
  has_estimated_times: false,
};

let tools: ReturnType<typeof buildCaffeineKineticsTools>;

beforeEach(() => {
  vi.clearAllMocks();
  tools = buildCaffeineKineticsTools('user-1', 'UTC');
});

// #1958: caffeine_half_life_hours and target_bedtime power an existing
// active-caffeine/bedtime-impact estimate (services/caffeineKineticsService.ts,
// routes/v2/nutritionKineticsRoutes.ts), but nothing in ai/tools/ wrapped it,
// so Sparky had no way to answer "how much caffeine will still be active at
// my bedtime?" even though the feature itself already worked on web/mobile.
describe('sparky_get_caffeine_kinetics', () => {
  it('active_caffeine returns the kinetics estimate for an explicit date', async () => {
    svc.getActiveCaffeineKinetics.mockResolvedValue(KINETICS_RESULT);

    const result = await tools.sparky_get_caffeine_kinetics.execute!(
      { action: 'active_caffeine', date: '2026-02-01' },
      opts
    );

    expect(result).toBe(JSON.stringify(KINETICS_RESULT));
    expect(svc.getActiveCaffeineKinetics).toHaveBeenCalledWith('user-1', {
      date: '2026-02-01',
      doseMg: undefined,
    });
  });

  it('passes a custom dose_mg through for the cutoff calculation', async () => {
    svc.getActiveCaffeineKinetics.mockResolvedValue(KINETICS_RESULT);

    await tools.sparky_get_caffeine_kinetics.execute!(
      { action: 'active_caffeine', date: '2026-02-01', dose_mg: 80 },
      opts
    );

    expect(svc.getActiveCaffeineKinetics).toHaveBeenCalledWith('user-1', {
      date: '2026-02-01',
      doseMg: 80,
    });
  });

  it('defaults to today (UTC) when no date is given', async () => {
    svc.getActiveCaffeineKinetics.mockResolvedValue(KINETICS_RESULT);
    const today = todayInZone('UTC');

    const result = await tools.sparky_get_caffeine_kinetics.execute!({}, opts);

    expect(result).toBe(JSON.stringify(KINETICS_RESULT));
    expect(svc.getActiveCaffeineKinetics).toHaveBeenCalledWith('user-1', {
      date: today,
      doseMg: undefined,
    });
  });

  it('rejects malformed dates', async () => {
    const result = await tools.sparky_get_caffeine_kinetics.execute!(
      { action: 'active_caffeine', date: '02/01/2026' },
      opts
    );

    expect(result).toBe(
      'Error [VALIDATION]: date: Date must be in YYYY-MM-DD format (or "today", "yesterday", "tomorrow")'
    );
  });

  it('returns a DB error string when the service throws', async () => {
    svc.getActiveCaffeineKinetics.mockRejectedValue(new Error('boom'));

    const result = await tools.sparky_get_caffeine_kinetics.execute!(
      { action: 'active_caffeine', date: '2026-02-01' },
      opts
    );

    expect(result).toBe(DB_ERROR_TEXT);
  });
});
