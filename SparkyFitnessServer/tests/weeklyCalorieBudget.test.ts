import { describe, expect, it } from 'vitest';
import {
  normalizeWeeklyBudgetShiftPercent,
  instantToDay,
  weeklyBudgetDayTarget,
  weeklyBudgetWeek,
  type WeeklyBudgetLedgerDay,
} from '@workspace/shared';

// 2026-11-16 is a Monday.
const MON = '2026-11-16';
const TUE = '2026-11-17';
const WED = '2026-11-18';
const THU = '2026-11-19';
const SUN = '2026-11-22';

const day = (
  date: string,
  eaten: number | null,
  allowance = 2000,
  budgeted = true
): WeeklyBudgetLedgerDay => ({ date, eaten, allowance, budgeted });

const base = {
  firstDayOfWeek: 1,
  baseTarget: 2000,
  floor: 1500,
  maxShiftPercent: 20,
};

describe('weekly budget week', () => {
  it('starts on the account first day of the week', () => {
    expect(weeklyBudgetWeek(WED, 1)).toEqual({
      weekStart: MON,
      weekEnd: SUN,
    });
    expect(weeklyBudgetWeek(WED, 0)).toEqual({
      weekStart: '2026-11-15',
      weekEnd: '2026-11-21',
    });
    // Saturday start: a Wednesday belongs to the week from the Saturday before.
    expect(weeklyBudgetWeek(WED, 6)).toEqual({
      weekStart: '2026-11-14',
      weekEnd: '2026-11-20',
    });
    // The first day of the week is its own week start.
    expect(weeklyBudgetWeek(MON, 1).weekStart).toBe(MON);
    expect(weeklyBudgetWeek(SUN, 1).weekStart).toBe(MON);
  });

  it('crosses month and year ends on calendar days', () => {
    expect(weeklyBudgetWeek('2027-01-01', 1)).toEqual({
      weekStart: '2026-12-28',
      weekEnd: '2027-01-03',
    });
  });
});

describe('weekly budget day target', () => {
  it('leaves the first day of the week at its own target', () => {
    const result = weeklyBudgetDayTarget({
      ...base,
      date: MON,
      today: MON,
      ledger: [day('2026-11-15', 500)],
    });
    expect(result).toMatchObject({
      target: 2000,
      shift: 0,
      daysLeft: 7,
      countedDays: 0,
      carryover: 0,
      weekBudget: 14000,
    });
  });

  it('spreads earlier under-eating over the days left, today included', () => {
    // Mon and Tue each 300 under: 600 over the 5 days Wed to Sun.
    const result = weeklyBudgetDayTarget({
      ...base,
      date: WED,
      today: WED,
      ledger: [day(MON, 1700), day(TUE, 1700)],
    });
    expect(result).toMatchObject({
      daysLeft: 5,
      carryover: 600,
      shift: 120,
      target: 2120,
      limitedBy: 'none',
      allowanceSoFar: 4000,
      eatenSoFar: 3400,
      countedDays: 2,
      weekBudget: 14000,
    });
  });

  it('takes earlier over-eating off the days left', () => {
    const result = weeklyBudgetDayTarget({
      ...base,
      date: THU,
      today: THU,
      ledger: [day(MON, 2400), day(TUE, 2200), day(WED, 2200)],
    });
    // 800 over across 4 days left.
    expect(result).toMatchObject({ shift: -200, target: 1800, daysLeft: 4 });
  });

  it('caps the change after a big overeating day', () => {
    const result = weeklyBudgetDayTarget({
      ...base,
      floor: 1000,
      date: TUE,
      today: TUE,
      ledger: [day(MON, 6000)],
    });
    // 4000 over / 6 days = -667, capped at 20% of 2000.
    expect(result).toMatchObject({
      uncappedShift: -667,
      shift: -400,
      target: 1600,
      maxShift: 400,
      limitedBy: 'cap',
    });
  });

  it('caps an increase too', () => {
    const result = weeklyBudgetDayTarget({
      ...base,
      date: SUN,
      today: SUN,
      ledger: [day(MON, 1000), day(TUE, 1000)],
    });
    expect(result).toMatchObject({
      uncappedShift: 2000,
      shift: 400,
      target: 2400,
      limitedBy: 'cap',
    });
  });

  it('uses the configured cap', () => {
    const result = weeklyBudgetDayTarget({
      ...base,
      maxShiftPercent: 10,
      floor: null,
      date: TUE,
      today: TUE,
      ledger: [day(MON, 6000)],
    });
    expect(result).toMatchObject({ shift: -200, maxShiftPercent: 10 });
  });

  it('never goes below the safety floor', () => {
    const result = weeklyBudgetDayTarget({
      ...base,
      baseTarget: 1700,
      floor: 1600,
      date: TUE,
      today: TUE,
      ledger: [day(MON, 4000, 1700)],
    });
    // Capped at -340, then held at the floor.
    expect(result).toMatchObject({
      target: 1600,
      shift: -100,
      limitedBy: 'floor',
      floor: 1600,
    });
  });

  it('never lowers a day already at or below the floor', () => {
    const result = weeklyBudgetDayTarget({
      ...base,
      baseTarget: 1400,
      floor: 1500,
      date: TUE,
      today: TUE,
      ledger: [day(MON, 3000, 1400)],
    });
    expect(result).toMatchObject({ target: 1400, shift: 0 });
  });

  it('can still raise a day without a floor', () => {
    const result = weeklyBudgetDayTarget({
      ...base,
      floor: null,
      date: TUE,
      today: TUE,
      ledger: [day(MON, 1400)],
    });
    expect(result).toMatchObject({ target: 2100, floor: null });
  });

  it('starts clean when switched on midweek', () => {
    // Switched on Wednesday: Monday and Tuesday were not budgeted days.
    const wednesday = weeklyBudgetDayTarget({
      ...base,
      date: WED,
      today: WED,
      ledger: [day(MON, 3500, 2000, false), day(TUE, 3500, 2000, false)],
    });
    expect(wednesday).toMatchObject({
      target: 2000,
      countedDays: 0,
      carryover: 0,
      daysLeft: 5,
      weekBudget: 10000,
    });

    // Thursday counts Wednesday only.
    const thursday = weeklyBudgetDayTarget({
      ...base,
      date: THU,
      today: THU,
      ledger: [
        day(MON, 3500, 2000, false),
        day(TUE, 3500, 2000, false),
        day(WED, 1600),
      ],
    });
    expect(thursday).toMatchObject({
      carryover: 400,
      shift: 100,
      target: 2100,
    });
  });

  it('treats a day with nothing logged as on target', () => {
    const result = weeklyBudgetDayTarget({
      ...base,
      date: WED,
      today: WED,
      ledger: [day(MON, null), day(TUE, 0)],
    });
    expect(result).toMatchObject({
      target: 2000,
      countedDays: 0,
      unloggedDays: 2,
    });
  });

  it('counts exercise once, through the day allowance', () => {
    // Monday allowed 2000 + 500 credited exercise; eating 2500 is on target.
    const result = weeklyBudgetDayTarget({
      ...base,
      date: TUE,
      today: TUE,
      ledger: [day(MON, 2500, 2500)],
    });
    expect(result).toMatchObject({ carryover: 0, target: 2000 });
  });

  it('ignores the previous week', () => {
    const result = weeklyBudgetDayTarget({
      ...base,
      date: TUE,
      today: TUE,
      ledger: [
        day('2026-11-14', 4000),
        day('2026-11-15', 4000),
        day(MON, 2000),
      ],
    });
    expect(result).toMatchObject({ target: 2000, countedDays: 1 });
  });

  it('follows a Sunday week start', () => {
    // With Sunday first, Sunday 15th is in the same week as Tuesday 17th.
    const result = weeklyBudgetDayTarget({
      ...base,
      firstDayOfWeek: 0,
      date: TUE,
      today: TUE,
      ledger: [day('2026-11-15', 1500), day(MON, 2000)],
    });
    expect(result).toMatchObject({
      weekStart: '2026-11-15',
      weekEnd: '2026-11-21',
      daysLeft: 5,
      carryover: 500,
      shift: 100,
    });
  });

  it('counts only completed days, not today or the future', () => {
    // Looking ahead to Thursday on Tuesday: Tuesday is still open.
    const result = weeklyBudgetDayTarget({
      ...base,
      date: THU,
      today: TUE,
      ledger: [day(MON, 1600), day(TUE, 400), day(WED, null)],
    });
    expect(result).toMatchObject({ countedDays: 1, carryover: 400 });
  });

  it('keeps a past day at what the days before it gave it', () => {
    // Viewing last Wednesday from Sunday: later days do not move it.
    const ledger = [day(MON, 1700), day(TUE, 1700), day(WED, 3000)];
    const wednesday = weeklyBudgetDayTarget({
      ...base,
      date: WED,
      today: SUN,
      ledger,
    });
    expect(wednesday).toMatchObject({ target: 2120, countedDays: 2 });
  });

  it('decides which days are complete in the person timezone', () => {
    // 2026-11-17 09:30 UTC: still Monday the 16th in Honolulu, already
    // Tuesday the 17th in Auckland.
    const instant = new Date('2026-11-17T09:30:00Z');
    const honolulu = instantToDay(instant, 'Pacific/Honolulu');
    const auckland = instantToDay(instant, 'Pacific/Auckland');
    expect(honolulu).toBe(MON);
    expect(auckland).toBe(TUE);

    const ledger = [day(MON, 1400), day(TUE, 1400)];
    const tomorrowInHonolulu = weeklyBudgetDayTarget({
      ...base,
      date: WED,
      today: honolulu,
      ledger,
    });
    const todayInAuckland = weeklyBudgetDayTarget({
      ...base,
      date: WED,
      today: auckland,
      ledger,
    });
    // Honolulu: Monday is still open, nothing counts yet.
    expect(tomorrowInHonolulu).toMatchObject({ countedDays: 0, target: 2000 });
    // Auckland: Monday is done (600 under over 5 days); Tuesday is open.
    expect(todayInAuckland).toMatchObject({ countedDays: 1, target: 2120 });
  });

  it('keeps the week budget consistent with the targets it hands out', () => {
    // Eating exactly each day's adjusted target uses the whole budget.
    const days = [MON, TUE, WED, THU, '2026-11-20', '2026-11-21', SUN];
    const eatenEachDay = [2600, 1800, 1900];
    const ledger: WeeklyBudgetLedgerDay[] = [];
    let eatenTotal = 0;
    days.forEach((date, index) => {
      const result = weeklyBudgetDayTarget({
        ...base,
        maxShiftPercent: 50,
        floor: null,
        date,
        today: SUN,
        ledger,
      });
      const eaten = eatenEachDay[index] ?? result.target;
      eatenTotal += eaten;
      ledger.push(day(date, eaten));
    });
    // Rounding to whole kcal each day can leave a few kcal.
    expect(Math.abs(eatenTotal - 14000)).toBeLessThanOrEqual(7);
  });
});

describe('weekly budget cap setting', () => {
  it('keeps the cap within range', () => {
    expect(normalizeWeeklyBudgetShiftPercent(20)).toBe(20);
    expect(normalizeWeeklyBudgetShiftPercent(1)).toBe(5);
    expect(normalizeWeeklyBudgetShiftPercent(90)).toBe(50);
    expect(normalizeWeeklyBudgetShiftPercent('25')).toBe(25);
    expect(normalizeWeeklyBudgetShiftPercent(undefined)).toBe(20);
  });
});
