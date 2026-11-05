import { DASHBOARD_CARD_KEYS } from '../../src/constants/dashboardCards';
import {
  DASHBOARD_TABS,
  cardShowsOnTab,
  cardsForTab,
  resolveDashboardTab,
  tabsForCard,
} from '../../src/constants/dashboardTabs';

describe('dashboard tabs', () => {
  it('puts every card on at least one tab', () => {
    for (const key of DASHBOARD_CARD_KEYS) {
      expect(tabsForCard(key).length).toBeGreaterThan(0);
    }
  });

  it('shows Ask Sparky on every tab', () => {
    for (const tab of DASHBOARD_TABS) {
      expect(cardShowsOnTab('askSparky', tab)).toBe(true);
    }
  });

  it('repeats the daily essentials on Summary', () => {
    expect(tabsForCard('calorieRing')).toEqual(['summary', 'nutrition']);
    expect(tabsForCard('medications')).toEqual(['summary', 'wellness']);
    expect(tabsForCard('trainingLoad')).toEqual(['summary', 'activity']);
    expect(tabsForCard('pinnedMetrics')).toEqual(['summary']);
  });

  it('keeps the saved order within a tab and moves Ask Sparky to the top', () => {
    expect(
      cardsForTab(
        ['hydration', 'calorieRing', 'mood', 'askSparky', 'macros'],
        'nutrition'
      )
    ).toEqual(['askSparky', 'hydration', 'calorieRing', 'macros']);
  });

  it('leaves Ask Sparky out when the order does not have it', () => {
    expect(cardsForTab(['exercise', 'activityRings'], 'activity')).toEqual([
      'exercise',
      'activityRings',
    ]);
  });

  it('falls back to Summary for a tab it does not know', () => {
    expect(resolveDashboardTab('activity')).toBe('activity');
    expect(resolveDashboardTab('sleep')).toBe('summary');
    expect(resolveDashboardTab(undefined)).toBe('summary');
  });
});
