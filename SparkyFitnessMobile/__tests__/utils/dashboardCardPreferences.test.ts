import { DASHBOARD_CARD_KEYS } from '../../src/constants/dashboardCards';
import {
  applyDashboardCardMove,
  resolveDashboardCardOrder,
  selectVisibleDashboardCards,
} from '../../src/utils/dashboardCardPreferences';

describe('resolveDashboardCardOrder', () => {
  test('returns saved order verbatim when complete', () => {
    const savedOrder = [...DASHBOARD_CARD_KEYS].reverse();
    expect(resolveDashboardCardOrder(savedOrder)).toEqual(savedOrder);
  });

  test('appends newly added registry keys', () => {
    const partial = ['fasting', 'hydration', 'caffeine'];
    const resolved = resolveDashboardCardOrder(partial);

    expect(resolved.slice(0, 3)).toEqual(partial);
    expect(resolved).toHaveLength(DASHBOARD_CARD_KEYS.length);
  });

  test('drops invalid/stale keys', () => {
    const withGhost = ['fasting', 'ghostCard', 'hydration'];
    const resolved = resolveDashboardCardOrder(withGhost);

    expect(resolved).not.toContain('ghostCard');
    expect(resolved).toHaveLength(DASHBOARD_CARD_KEYS.length);
  });

  test('de-duplicates duplicate keys', () => {
    const dupes = ['fasting', 'fasting', 'hydration'];
    const resolved = resolveDashboardCardOrder(dupes);

    expect(resolved.filter((k) => k === 'fasting')).toHaveLength(1);
    expect(resolved).toHaveLength(DASHBOARD_CARD_KEYS.length);
  });

  test('returns default order for null or empty input', () => {
    expect(resolveDashboardCardOrder([])).toEqual([...DASHBOARD_CARD_KEYS]);
    expect(resolveDashboardCardOrder(null)).toEqual([...DASHBOARD_CARD_KEYS]);
  });
});

describe('selectVisibleDashboardCards', () => {
  test('filters out hidden cards while maintaining order', () => {
    const order = ['fasting', 'hydration', 'caffeine'] as const;
    expect(selectVisibleDashboardCards(order, ['hydration'])).toEqual([
      'fasting',
      'caffeine',
    ]);
  });
});

describe('applyDashboardCardMove', () => {
  test('moves a card from one position to another', () => {
    const order = ['calorieRing', 'askSparky', 'hydration'] as const;
    expect(applyDashboardCardMove(order, 0, 1)).toEqual([
      'askSparky',
      'calorieRing',
      'hydration',
    ]);
  });

  test('clamps out-of-bounds destination index', () => {
    const order = ['calorieRing', 'askSparky', 'hydration'] as const;
    expect(applyDashboardCardMove(order, 0, 99)).toEqual([
      'askSparky',
      'hydration',
      'calorieRing',
    ]);
  });
});
