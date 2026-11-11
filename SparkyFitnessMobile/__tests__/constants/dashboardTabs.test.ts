import { DASHBOARD_CARD_KEYS } from '../../src/constants/dashboardCards';
import {
  DASHBOARD_TABS,
  cardShowsOnTab,
  cardsForTab,
  homeTabOf,
  resolveDashboardTab,
  resolveHomeTabCards,
  resolveSummaryCards,
} from '../../src/constants/dashboardTabs';

const SHARED = [...DASHBOARD_CARD_KEYS];

describe('dashboard tabs', () => {
  it('gives every card but Ask Sparky a home tab', () => {
    for (const key of DASHBOARD_CARD_KEYS) {
      if (key === 'askSparky') {
        expect(homeTabOf(key)).toBeNull();
      } else {
        expect(DASHBOARD_TABS).toContain(homeTabOf(key));
      }
    }
  });

  it('opens every tab on Ask Sparky', () => {
    for (const tab of DASHBOARD_TABS) {
      expect(
        cardsForTab(tab, {
          sharedOrder: SHARED,
          tabOrders: {},
          summaryCards: resolveSummaryCards(null),
        })[0]
      ).toBe('askSparky');
    }
  });

  describe('Summary', () => {
    it('starts with the daily essentials', () => {
      expect(resolveSummaryCards(null)).toEqual([
        'calorieRing',
        'pinnedMetrics',
        'medications',
        'macros',
        'trainingLoad',
        'sparkySummary',
        'coachMessages',
      ]);
    });

    it('keeps the saved list, drops unknown or repeated keys, and always keeps At a Glance', () => {
      expect(
        resolveSummaryCards(['hydration', 'gone', 'hydration', 'askSparky'])
      ).toEqual([
        'hydration',
        'sparkySummary',
        'coachMessages',
        'pinnedMetrics',
      ]);
    });

    it('shows a repeated card on Summary as well as on its home tab', () => {
      const summary = resolveSummaryCards(['hydration']);
      expect(cardShowsOnTab('hydration', 'summary', summary)).toBe(true);
      expect(cardShowsOnTab('hydration', 'nutrition', summary)).toBe(true);
      expect(cardShowsOnTab('macros', 'summary', summary)).toBe(false);
    });
  });

  describe('home tabs', () => {
    it('follow the shared order until the tab is reordered', () => {
      expect(
        resolveHomeTabCards('nutrition', undefined, [
          'hydration',
          'mood',
          'calorieRing',
          'macros',
          'caffeine',
          'fasting',
          'meals',
        ])
      ).toEqual([
        'hydration',
        'calorieRing',
        'macros',
        'caffeine',
        'fasting',
        'meals',
      ]);
    });

    it('use the saved tab order, then any card it does not list yet', () => {
      expect(
        resolveHomeTabCards(
          'activity',
          ['steps', 'mood', 'workouts', 'steps'],
          SHARED
        )
      ).toEqual([
        'steps',
        'workouts',
        'exercise',
        'activityRings',
        'trainingLoad',
        'heartRate',
      ]);
    });
  });

  it('falls back to Summary for a tab it does not know', () => {
    expect(resolveDashboardTab('activity')).toBe('activity');
    expect(resolveDashboardTab('sleep')).toBe('summary');
    expect(resolveDashboardTab(undefined)).toBe('summary');
  });
});
