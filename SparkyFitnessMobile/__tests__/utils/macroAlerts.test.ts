import {
  computeMacroAlerts,
  normalizeMacroAlertRules,
} from '../../src/utils/macroAlerts';

describe('normalizeMacroAlertRules', () => {
  it('drops invalid rules and duplicate macros, in macro order', () => {
    expect(
      normalizeMacroAlertRules([
        { macro: 'fat', percent: 80, time: '19:00' },
        { macro: 'protein', percent: 70, time: '18:00' },
        { macro: 'protein', percent: 50, time: '12:00' },
        { macro: 'carbs', percent: 65 as never, time: '18:00' },
        { macro: 'fiber', percent: 60, time: '6:00' },
        { macro: 'sugar' as never, percent: 60, time: '18:00' },
      ])
    ).toEqual([
      { macro: 'protein', percent: 70, time: '18:00' },
      { macro: 'fat', percent: 80, time: '19:00' },
    ]);
  });
});

describe('computeMacroAlerts', () => {
  const now = new Date(2026, 9, 31, 15, 0);
  const rules = [
    { macro: 'protein' as const, percent: 70 as const, time: '18:00' },
  ];

  it('alerts when under the share, with whole-number figures', () => {
    const [alert] = computeMacroAlerts({
      rules,
      totals: { protein: { consumed: 45.4, goal: 120 } },
      now,
    });
    expect(alert).toMatchObject({
      macro: 'protein',
      remaining: 75,
      progressPercent: 38,
    });
    expect(alert.date.getHours()).toBe(18);
  });

  it('stays quiet once caught up, at exactly the share, or without a target', () => {
    expect(
      computeMacroAlerts({
        rules,
        totals: { protein: { consumed: 84, goal: 120 } },
        now,
      })
    ).toEqual([]);
    expect(
      computeMacroAlerts({
        rules,
        totals: { protein: { consumed: 10, goal: 0 } },
        now,
      })
    ).toEqual([]);
    expect(computeMacroAlerts({ rules, totals: {}, now })).toEqual([]);
  });

  it('skips a rule whose time has passed or is under a minute away', () => {
    const totals = { protein: { consumed: 0, goal: 100 } };
    expect(
      computeMacroAlerts({ rules, totals, now: new Date(2026, 9, 31, 18, 0) })
    ).toEqual([]);
    expect(
      computeMacroAlerts({
        rules,
        totals,
        now: new Date(2026, 9, 31, 17, 59, 30),
      })
    ).toEqual([]);
  });

  it('sorts several alerts by time', () => {
    const alerts = computeMacroAlerts({
      rules: [
        { macro: 'protein', percent: 70, time: '19:00' },
        { macro: 'fiber', percent: 50, time: '13:00' },
      ],
      totals: {
        protein: { consumed: 0, goal: 100 },
        fiber: { consumed: 0, goal: 30 },
      },
      now: new Date(2026, 9, 31, 9, 0),
    });
    expect(alerts.map((a) => a.macro)).toEqual(['fiber', 'protein']);
  });
});
