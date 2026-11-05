import type { TFunction } from 'i18next';
import type { DashboardCardKey } from './dashboardCards';

export const DASHBOARD_TABS = [
  'summary',
  'nutrition',
  'activity',
  'wellness',
] as const;

export type DashboardTab = (typeof DASHBOARD_TABS)[number];

export const DEFAULT_DASHBOARD_TAB: DashboardTab = 'summary';

/**
 * The cards each tab may show. A card can sit on more than one tab: Summary repeats the
 * few daily essentials (calories, meds due, nutrients, training load) whose full home is
 * another tab. Ask Sparky is on every tab and is pinned to the top of it.
 */
const TAB_CARDS: Record<DashboardTab, readonly DashboardCardKey[]> = {
  summary: [
    'askSparky',
    'calorieRing',
    'pinnedMetrics',
    'medications',
    'macros',
    'trainingLoad',
  ],
  nutrition: [
    'askSparky',
    'calorieRing',
    'macros',
    'hydration',
    'caffeine',
    'fasting',
    'meals',
  ],
  activity: [
    'askSparky',
    'activityRings',
    'exercise',
    'trainingLoad',
    'workouts',
  ],
  wellness: [
    'askSparky',
    'sleep',
    'readiness',
    'medications',
    'symptoms',
    'mood',
    'mindfulness',
    'cycle',
    'healthTrends',
    'labResults',
    'progressPhotos',
  ],
};

const TAB_CARD_SETS: Record<DashboardTab, ReadonlySet<DashboardCardKey>> = {
  summary: new Set(TAB_CARDS.summary),
  nutrition: new Set(TAB_CARDS.nutrition),
  activity: new Set(TAB_CARDS.activity),
  wellness: new Set(TAB_CARDS.wellness),
};

export const isDashboardTab = (value: unknown): value is DashboardTab =>
  typeof value === 'string' &&
  (DASHBOARD_TABS as readonly string[]).includes(value);

/** A saved tab a later build no longer knows falls back to Summary. */
export const resolveDashboardTab = (value: unknown): DashboardTab =>
  isDashboardTab(value) ? value : DEFAULT_DASHBOARD_TAB;

export const cardShowsOnTab = (
  key: DashboardCardKey,
  tab: DashboardTab
): boolean => TAB_CARD_SETS[tab].has(key);

/** The tabs a card shows on, in tab order. */
export const tabsForCard = (key: DashboardCardKey): DashboardTab[] =>
  DASHBOARD_TABS.filter((tab) => cardShowsOnTab(key, tab));

/**
 * The cards of one tab in the person's saved order, with Ask Sparky moved to the top so
 * every tab opens on it.
 */
export const cardsForTab = (
  order: readonly DashboardCardKey[],
  tab: DashboardTab
): DashboardCardKey[] => {
  const onTab = order.filter((key) => cardShowsOnTab(key, tab));
  return onTab.includes('askSparky')
    ? ['askSparky', ...onTab.filter((key) => key !== 'askSparky')]
    : onTab;
};

export const DASHBOARD_TAB_LABELS: Record<
  DashboardTab,
  (t: TFunction) => string
> = {
  summary: (t) => t('dashboard.tabs.summary', { defaultValue: 'Summary' }),
  nutrition: (t) =>
    t('dashboard.tabs.nutrition', { defaultValue: 'Nutrition' }),
  activity: (t) => t('dashboard.tabs.activity', { defaultValue: 'Activity' }),
  wellness: (t) => t('dashboard.tabs.wellness', { defaultValue: 'Wellness' }),
};

/** The Ask Sparky prompt, worded for what each tab is about. */
export const ASK_SPARKY_PROMPTS: Record<
  DashboardTab,
  (t: TFunction) => string
> = {
  summary: (t) =>
    t('dashboard.askSparkyTabs.summary', {
      defaultValue: "Ask Sparky about today's progress…",
    }),
  nutrition: (t) =>
    t('dashboard.askSparkyTabs.nutrition', {
      defaultValue: "Ask Sparky about today's meals or macros…",
    }),
  activity: (t) =>
    t('dashboard.askSparkyTabs.activity', {
      defaultValue: 'Ask Sparky about workouts, pacing or load…',
    }),
  wellness: (t) =>
    t('dashboard.askSparkyTabs.wellness', {
      defaultValue: 'Ask Sparky about sleep, meds or recovery…',
    }),
};
