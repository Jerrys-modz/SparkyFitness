import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyDietPhaseToRules,
  dietPhaseEnd,
  dietPhaseOnDay,
  dietPhasePlannedEnd,
  dietPhaseTargetReached,
  dietPhaseTimelineStatus,
  dietPhasesChangePast,
  findDietPhaseProblems,
  saveDietPhasesBodySchema,
} from '@workspace/shared';
import type { DietPhaseLike } from '@workspace/shared';
import { preferencesOnDay } from '../services/calorieRuleHistoryService.js';
import type { CalorieRuleHistoryRow } from '../models/calorieRuleHistoryRepository.js';
import type { DietPhaseRecord } from '../models/dietPhaseRepository.js';
import dietPhaseRepository from '../models/dietPhaseRepository.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import {
  DietPhaseValidationError,
  checkDietPhaseTargetsAfterWeight,
  getDietPhaseOverview,
  loadDietPhasesForCalories,
  planDietPhaseSave,
} from '../services/dietPhaseService.js';

vi.mock('../models/dietPhaseRepository.js', () => ({
  default: {
    getDietPhases: vi.fn(),
    replaceDietPhases: vi.fn(),
    markDietPhaseTargetReached: vi.fn(),
    getWeightsInRange: vi.fn(),
  },
}));
vi.mock('../models/calorieRuleHistoryRepository.js', () => ({
  default: { getCalorieRuleHistory: vi.fn(async () => []) },
}));
vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn(async () => 'UTC'),
}));

function phase(
  overrides: Partial<DietPhaseRecord> & { start_date: string }
): DietPhaseRecord {
  return {
    id: overrides.id ?? `p-${overrides.start_date}`,
    phase_type: 'loss',
    weekly_change_kg: 0.5,
    end_date: null,
    duration_weeks: null,
    target_weight_kg: null,
    target_reached_on: null,
    label: null,
    ...overrides,
  };
}

// cut (4 weeks) -> maintain (2 weeks) -> gap -> cut until a date.
const cut = phase({
  id: 'cut',
  start_date: '2026-01-05',
  duration_weeks: 4,
});
const maintain = phase({
  id: 'maintain',
  phase_type: 'maintenance',
  weekly_change_kg: 0,
  start_date: '2026-02-02',
  end_date: '2026-02-15',
});
const cut2 = phase({
  id: 'cut2',
  weekly_change_kg: 0.75,
  start_date: '2026-03-01',
  end_date: '2026-03-31',
});
const plan = [cut, maintain, cut2];

describe('diet phase ends', () => {
  it('counts a duration in whole weeks, start day included', () => {
    expect(dietPhasePlannedEnd(cut)).toBe('2026-02-01');
    expect(
      dietPhasePlannedEnd(
        phase({ start_date: '2026-01-05', duration_weeks: 1 })
      )
    ).toBe('2026-01-11');
  });

  it('uses the end date when given, and stays open with only a target', () => {
    expect(dietPhasePlannedEnd(maintain)).toBe('2026-02-15');
    expect(
      dietPhasePlannedEnd(
        phase({ start_date: '2026-01-05', target_weight_kg: 80 })
      )
    ).toBeNull();
  });

  it('ends early on the day the target was reached', () => {
    expect(dietPhaseEnd({ ...cut, target_reached_on: '2026-01-20' })).toBe(
      '2026-01-20'
    );
    expect(dietPhaseEnd({ ...cut, target_reached_on: '2026-03-20' })).toBe(
      '2026-02-01'
    );
    expect(
      dietPhaseEnd(
        phase({
          start_date: '2026-01-05',
          target_weight_kg: 80,
          target_reached_on: '2026-04-01',
        })
      )
    ).toBe('2026-04-01');
  });
});

describe('the phase of each day', () => {
  it.each([
    ['2026-01-04', null],
    ['2026-01-05', 'cut'],
    ['2026-02-01', 'cut'],
    ['2026-02-02', 'maintain'],
    ['2026-02-15', 'maintain'],
    ['2026-02-16', null],
    ['2026-02-28', null],
    ['2026-03-01', 'cut2'],
    ['2026-03-31', 'cut2'],
    ['2026-04-01', null],
  ])('%s -> %s', (day, expected) => {
    expect(dietPhaseOnDay(plan, day)?.id ?? null).toBe(expected);
  });

  it('a phase with a target and no end runs until the target is reached', () => {
    const open = phase({ start_date: '2026-05-01', target_weight_kg: 80 });
    expect(dietPhaseOnDay([open], '2027-05-01')?.id).toBe(open.id);
    const reached = { ...open, target_reached_on: '2026-06-10' };
    expect(dietPhaseOnDay([reached], '2026-06-10')?.id).toBe(open.id);
    expect(dietPhaseOnDay([reached], '2026-06-11')).toBeNull();
  });
});

describe('overlaps and invalid phases', () => {
  it('accepts back-to-back phases and gaps', () => {
    expect(findDietPhaseProblems(plan)).toEqual([]);
  });

  it('rejects a phase that starts on the last day of another', () => {
    const clash = phase({ start_date: '2026-02-01', end_date: '2026-02-10' });
    expect(findDietPhaseProblems([cut, clash])).toEqual([
      { kind: 'overlap', index: 1, otherIndex: 0 },
    ]);
  });

  it('finds overlaps whatever the order phases are sent in', () => {
    const inside = phase({ start_date: '2026-01-10', end_date: '2026-01-12' });
    expect(findDietPhaseProblems([maintain, inside, cut])).toEqual([
      { kind: 'overlap', index: 1, otherIndex: 2 },
    ]);
  });

  it('rejects any phase after an open-ended one', () => {
    const open = phase({ start_date: '2026-01-05', target_weight_kg: 80 });
    const later = phase({ start_date: '2027-01-01', duration_weeks: 2 });
    expect(findDietPhaseProblems([open, later])).toEqual([
      { kind: 'overlap', index: 1, otherIndex: 0 },
    ]);
  });

  it('allows a phase after an open-ended one that already reached its target', () => {
    const reached = phase({
      start_date: '2026-01-05',
      target_weight_kg: 80,
      target_reached_on: '2026-03-01',
    });
    const later = phase({ start_date: '2026-03-02', duration_weeks: 2 });
    expect(findDietPhaseProblems([reached, later])).toEqual([]);
  });

  it('rejects a phase without any end and one ending before it starts', () => {
    const problems = findDietPhaseProblems([
      phase({ start_date: '2026-01-05' }),
      phase({ start_date: '2026-06-05', end_date: '2026-06-01' }),
    ]);
    expect(problems).toContainEqual({ kind: 'no_end', index: 0 });
    expect(problems).toContainEqual({ kind: 'end_before_start', index: 1 });
  });

  it('the request schema refuses contradictory phases', () => {
    const parse = (p: Record<string, unknown>) =>
      saveDietPhasesBodySchema.safeParse({ phases: [p] }).success;
    const base = {
      phase_type: 'loss',
      weekly_change_kg: 0.5,
      start_date: '2026-01-05',
    };
    expect(parse({ ...base, duration_weeks: 4 })).toBe(true);
    expect(parse({ ...base, end_date: '2026-02-01', duration_weeks: 4 })).toBe(
      false
    );
    expect(parse(base)).toBe(false);
    expect(parse({ ...base, end_date: '2026-01-01' })).toBe(false);
    expect(parse({ ...base, weekly_change_kg: 0, duration_weeks: 4 })).toBe(
      false
    );
    expect(parse({ ...base, weekly_change_kg: 2.5, duration_weeks: 4 })).toBe(
      false
    );
    expect(
      parse({
        phase_type: 'maintenance',
        weekly_change_kg: 0,
        start_date: '2026-01-05',
        duration_weeks: 2,
      })
    ).toBe(true);
    expect(
      parse({
        phase_type: 'maintenance',
        weekly_change_kg: 0.5,
        start_date: '2026-01-05',
        duration_weeks: 2,
      })
    ).toBe(false);
    expect(
      parse({ ...base, start_date: '2026-02-30', duration_weeks: 1 })
    ).toBe(false);
  });
});

describe('Goal Mode on each day', () => {
  const rules = {
    goal_mode: 'cut',
    goal_mode_weekly_change_kg: 0,
    goal_mode_calculation_method: 'adaptive',
  };

  it('a phase sets the weekly mode with a signed rate', () => {
    expect(applyDietPhaseToRules(rules, plan, '2026-01-10')).toEqual({
      ...rules,
      goal_mode: 'weekly',
      goal_mode_weekly_change_kg: -0.5,
    });
    expect(
      applyDietPhaseToRules(rules, plan, '2026-02-05')
        .goal_mode_weekly_change_kg
    ).toBe(0);
    const gain = phase({
      phase_type: 'gain',
      weekly_change_kg: 0.25,
      start_date: '2026-06-01',
      duration_weeks: 8,
    });
    expect(
      applyDietPhaseToRules(rules, [gain], '2026-06-01')
        .goal_mode_weekly_change_kg
    ).toBe(0.25);
  });

  it('a day in a gap keeps the base setting', () => {
    expect(applyDietPhaseToRules(rules, plan, '2026-02-20')).toBe(rules);
  });

  const history: CalorieRuleHistoryRow[] = [
    {
      effective_date: '-infinity',
      goal_mode: 'maintain',
      goal_mode_calculation_method: 'manual',
    } as CalorieRuleHistoryRow,
    {
      effective_date: '2026-01-20',
      goal_mode: 'bulk',
      goal_mode_calculation_method: 'adaptive',
    } as CalorieRuleHistoryRow,
  ];
  const current = {
    goal_mode: 'bulk' as const,
    goal_mode_calculation_method: 'adaptive' as const,
    goal_mode_weekly_change_kg: 0,
    timezone: 'UTC',
  };

  it('without phases the recorded settings are used unchanged', () => {
    for (const day of ['2026-01-10', '2026-01-25', '2026-02-20']) {
      expect(preferencesOnDay(current, history, day, [])).toEqual(
        preferencesOnDay(current, history, day)
      );
    }
  });

  it('a phase replaces only Goal Mode and its rate, on top of history', () => {
    const before = preferencesOnDay(current, history, '2026-01-10', plan);
    expect(before.goal_mode).toBe('weekly');
    expect(before.goal_mode_weekly_change_kg).toBe(-0.5);
    expect(before.goal_mode_calculation_method).toBe('manual');
    const after = preferencesOnDay(current, history, '2026-01-25', plan);
    expect(after.goal_mode).toBe('weekly');
    expect(after.goal_mode_calculation_method).toBe('adaptive');
    // In the gap the recorded Goal Mode comes back.
    expect(
      preferencesOnDay(current, history, '2026-02-20', plan).goal_mode
    ).toBe('bulk');
  });
});

describe('past days stay as they were', () => {
  const today = '2026-01-20';

  it('changing what comes after today is allowed', () => {
    const shorter = [{ ...cut, duration_weeks: 3 }, maintain];
    expect(dietPhasesChangePast(plan, shorter, today)).toBe(false);
    const endToday = [{ ...cut, duration_weeks: null, end_date: today }];
    expect(dietPhasesChangePast(plan, endToday, today)).toBe(false);
    const endYesterday = [
      { ...cut, duration_weeks: null, end_date: '2026-01-19' },
    ];
    expect(dietPhasesChangePast(plan, endYesterday, today)).toBe(false);
  });

  it('ending a running phase before yesterday changes a past day', () => {
    const early = [{ ...cut, duration_weeks: null, end_date: '2026-01-18' }];
    expect(dietPhasesChangePast(plan, early, today)).toBe(true);
  });

  it('deleting, retyping or moving a started phase changes past days', () => {
    expect(dietPhasesChangePast(plan, [maintain, cut2], today)).toBe(true);
    expect(
      dietPhasesChangePast(plan, [{ ...cut, weekly_change_kg: 0.4 }], today)
    ).toBe(true);
    expect(
      dietPhasesChangePast(plan, [{ ...cut, start_date: '2026-01-06' }], today)
    ).toBe(true);
  });

  it('a new phase may start today but not earlier', () => {
    const none: DietPhaseLike[] = [];
    expect(
      dietPhasesChangePast(
        none,
        [phase({ start_date: today, duration_weeks: 2 })],
        today
      )
    ).toBe(false);
    expect(
      dietPhasesChangePast(
        none,
        [phase({ start_date: '2026-01-19', duration_weeks: 2 })],
        today
      )
    ).toBe(true);
  });

  it('splitting a started phase into equal back-to-back parts changes nothing', () => {
    const split = [
      { ...cut, duration_weeks: null, end_date: '2026-01-12' },
      phase({ id: 'b', start_date: '2026-01-13', end_date: '2026-02-01' }),
    ];
    expect(dietPhasesChangePast([cut], split, today)).toBe(false);
  });
});

describe('weight target', () => {
  const loss = phase({ start_date: '2026-01-05', target_weight_kg: 80 });
  const trend = [
    { date: '2026-01-01', trend: 79 },
    { date: '2026-01-10', trend: 81 },
    { date: '2026-01-15', trend: 80 },
    { date: '2026-01-25', trend: 79.5 },
  ];

  it('a loss phase is reached when the latest trend is at or under it', () => {
    expect(dietPhaseTargetReached(loss, trend, '2026-01-12')).toBe(false);
    expect(dietPhaseTargetReached(loss, trend, '2026-01-15')).toBe(true);
  });

  it('ignores trend before the start and after today', () => {
    expect(dietPhaseTargetReached(loss, trend.slice(0, 1), '2026-01-20')).toBe(
      false
    );
    expect(dietPhaseTargetReached(loss, trend.slice(1, 2), '2026-01-20')).toBe(
      false
    );
  });

  it('a gain phase is reached at or over the target; maintenance never', () => {
    const gain = { ...loss, phase_type: 'gain' as const, target_weight_kg: 81 };
    expect(dietPhaseTargetReached(gain, trend, '2026-01-10')).toBe(true);
    expect(dietPhaseTargetReached(gain, trend, '2026-01-15')).toBe(false);
    const keep = {
      ...loss,
      phase_type: 'maintenance' as const,
      weekly_change_kg: 0,
    };
    expect(dietPhaseTargetReached(keep, trend, '2026-01-15')).toBe(false);
  });
});

describe('timeline status', () => {
  it('shows the current phase, days left and what comes next', () => {
    const status = dietPhaseTimelineStatus(plan, '2026-01-20');
    expect(status.current?.id).toBe('cut');
    expect(status.daysLeft).toBe(13);
    expect(status.next?.id).toBe('maintain');
    expect(status.changeOn).toBe('2026-02-02');
    expect(status.daysUntilChange).toBe(13);
    expect(status.changeSoon).toBe(false);
  });

  it('warns three days before a change, not four', () => {
    expect(dietPhaseTimelineStatus(plan, '2026-01-29').changeSoon).toBe(false);
    const soon = dietPhaseTimelineStatus(plan, '2026-01-30');
    expect(soon.changeSoon).toBe(true);
    expect(soon.daysUntilChange).toBe(3);
    expect(dietPhaseTimelineStatus(plan, '2026-02-01').daysLeft).toBe(1);
  });

  it('in a gap the next change is the next phase start', () => {
    const status = dietPhaseTimelineStatus(plan, '2026-02-26');
    expect(status.current).toBeNull();
    expect(status.next?.id).toBe('cut2');
    expect(status.daysUntilChange).toBe(3);
    expect(status.changeSoon).toBe(true);
  });

  it('after the plan, or in an open-ended phase, nothing is due', () => {
    const after = dietPhaseTimelineStatus(plan, '2026-05-01');
    expect(after.current).toBeNull();
    expect(after.next).toBeNull();
    expect(after.changeSoon).toBe(false);
    const open = phase({ start_date: '2026-01-01', target_weight_kg: 70 });
    const running = dietPhaseTimelineStatus([open], '2026-03-01');
    expect(running.current?.id).toBe(open.id);
    expect(running.daysLeft).toBeNull();
    expect(running.changeOn).toBeNull();
  });
});

describe('saving a plan', () => {
  const body = (phases: Record<string, unknown>[]) =>
    saveDietPhasesBodySchema.parse({ phases });

  it('keeps ids and the reached day of an unchanged target', () => {
    const stored = phase({
      id: '7b0c58f8-61b8-4a5e-9a39-9d3a2c3b9a11',
      start_date: '2026-01-05',
      target_weight_kg: 80,
      target_reached_on: '2026-01-15',
    });
    const rows = planDietPhaseSave(
      [stored],
      body([
        {
          id: stored.id,
          phase_type: 'loss',
          weekly_change_kg: 0.5,
          start_date: '2026-01-05',
          target_weight_kg: 80,
        },
      ]),
      '2026-01-20'
    );
    expect(rows[0]).toMatchObject({
      id: stored.id,
      target_reached_on: '2026-01-15',
    });
  });

  it('refuses an id that is not one of the person phases', () => {
    expect(() =>
      planDietPhaseSave(
        [],
        body([
          {
            id: '7b0c58f8-61b8-4a5e-9a39-9d3a2c3b9a11',
            phase_type: 'loss',
            weekly_change_kg: 0.5,
            start_date: '2026-02-01',
            duration_weeks: 2,
          },
        ]),
        '2026-01-20'
      )
    ).toThrow(DietPhaseValidationError);
  });

  it('refuses overlaps with code overlap', () => {
    try {
      planDietPhaseSave(
        [],
        body([
          {
            phase_type: 'loss',
            weekly_change_kg: 0.5,
            start_date: '2026-02-01',
            duration_weeks: 2,
          },
          {
            phase_type: 'maintenance',
            weekly_change_kg: 0,
            start_date: '2026-02-14',
            duration_weeks: 2,
          },
        ]),
        '2026-01-20'
      );
      throw new Error('expected a refusal');
    } catch (error) {
      expect((error as DietPhaseValidationError).code).toBe('overlap');
    }
  });

  it('refuses rewriting the past with code past_locked', () => {
    try {
      planDietPhaseSave([cut], body([]), '2026-01-20');
      throw new Error('expected a refusal');
    } catch (error) {
      expect((error as DietPhaseValidationError).code).toBe('past_locked');
    }
  });

  it('accepts removing a phase that has not started', () => {
    expect(planDietPhaseSave([cut2], body([]), '2026-01-20')).toEqual([]);
  });
});

describe('loading phases', () => {
  const repo = vi.mocked(dietPhaseRepository);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('no phases means nothing for the calorie engine', async () => {
    repo.getDietPhases.mockResolvedValue([]);
    await expect(loadDietPhasesForCalories('u1')).resolves.toEqual([]);
    expect(repo.getWeightsInRange).not.toHaveBeenCalled();
  });

  it('a running phase whose target is reached ends today and is recorded', async () => {
    vi.setSystemTime(new Date('2026-01-20T12:00:00Z'));
    const target = phase({
      id: 't',
      start_date: '2026-01-05',
      target_weight_kg: 80,
    });
    repo.getDietPhases.mockResolvedValue([target]);
    repo.getWeightsInRange.mockResolvedValue([
      { date: '2026-01-05', weight: 82 },
      { date: '2026-01-19', weight: 78 },
      { date: '2026-01-20', weight: 77 },
    ]);
    const [resolved] = await loadDietPhasesForCalories('u1', 'u1');
    expect(resolved?.target_reached_on).toBe('2026-01-20');
    expect(repo.markDietPhaseTargetReached).toHaveBeenCalledWith(
      'u1',
      't',
      '2026-01-20',
      'u1'
    );
    expect(repo.getWeightsInRange).toHaveBeenCalledWith(
      'u1',
      '2025-12-22',
      '2026-01-20',
      'u1'
    );
  });

  it('a target not yet reached leaves the phase running', async () => {
    vi.setSystemTime(new Date('2026-01-20T12:00:00Z'));
    repo.getDietPhases.mockResolvedValue([
      phase({ start_date: '2026-01-05', target_weight_kg: 70 }),
    ]);
    repo.getWeightsInRange.mockResolvedValue([
      { date: '2026-01-19', weight: 78 },
    ]);
    const [resolved] = await loadDietPhasesForCalories('u1');
    expect(resolved?.target_reached_on).toBeNull();
    expect(repo.markDietPhaseTargetReached).not.toHaveBeenCalled();
  });

  it('a failed check after a weight save is logged, never thrown', async () => {
    repo.getDietPhases.mockRejectedValue(new Error('database down'));
    await expect(
      checkDietPhaseTargetsAfterWeight('u1', 'u1')
    ).resolves.toBeUndefined();
  });

  it('uses the profile timezone for today', async () => {
    // 23:30 UTC on 10 March is already 11 March in Auckland.
    vi.setSystemTime(new Date('2026-03-10T23:30:00Z'));
    repo.getDietPhases.mockResolvedValue([
      phase({ id: 'm', start_date: '2026-03-11', end_date: '2026-03-20' }),
    ]);
    vi.mocked(loadUserTimezone).mockResolvedValueOnce('Pacific/Auckland');
    const auckland = await getDietPhaseOverview('u1');
    expect(auckland.today).toBe('2026-03-11');
    expect(auckland.status.current?.id).toBe('m');
    expect(auckland.status.days_left).toBe(10);

    vi.mocked(loadUserTimezone).mockResolvedValueOnce('America/Los_Angeles');
    const losAngeles = await getDietPhaseOverview('u1');
    expect(losAngeles.today).toBe('2026-03-10');
    expect(losAngeles.status.current).toBeNull();
    expect(losAngeles.status.next?.id).toBe('m');
    expect(losAngeles.status.change_soon).toBe(true);
  });

  it('returns phases in start order with their actual end', async () => {
    vi.setSystemTime(new Date('2026-01-20T12:00:00Z'));
    repo.getDietPhases.mockResolvedValue([cut2, cut, maintain]);
    const overview = await getDietPhaseOverview('u1');
    expect(overview.phases.map((p) => p.id)).toEqual([
      'cut',
      'maintain',
      'cut2',
    ]);
    expect(overview.phases[0]?.effective_end_date).toBe('2026-02-01');
  });
});
