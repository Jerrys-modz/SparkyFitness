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
 * The tab each card lives on. Summary is the exception: besides At a Glance, which lives
 * there, it shows a person-chosen list of cards that live on other tabs (calories, meds
 * due, nutrients and training load to start). Ask Sparky has no home; it is pinned to
 * the top of every tab.
 */
const HOME_TAB: Record<DashboardCardKey, DashboardTab | null> = {
  askSparky: null,
  pinnedMetrics: 'summary',
  calorieRing: 'nutrition',
  macros: 'nutrition',
  hydration: 'nutrition',
  caffeine: 'nutrition',
  fasting: 'nutrition',
  meals: 'nutrition',
  activityRings: 'activity',
  exercise: 'activity',
  trainingLoad: 'activity',
  workouts: 'activity',
  steps: 'activity',
  heartRate: 'activity',
  sleep: 'wellness',
  readiness: 'wellness',
  medications: 'wellness',
  symptoms: 'wellness',
  mood: 'wellness',
  mindfulness: 'wellness',
  cycle: 'wellness',
  healthTrends: 'wellness',
  labResults: 'wellness',
  progressPhotos: 'wellness',
};

/** The cards Summary repeats until the person picks their own. */
const DEFAULT_SUMMARY_CARDS: readonly DashboardCardKey[] = [
  'calorieRing',
  'pinnedMetrics',
  'medications',
  'macros',
  'trainingLoad',
];

export const isDashboardTab = (value: unknown): value is DashboardTab =>
  typeof value === 'string' &&
  (DASHBOARD_TABS as readonly string[]).includes(value);

/** A saved tab a later build no longer knows falls back to Summary. */
export const resolveDashboardTab = (value: unknown): DashboardTab =>
  isDashboardTab(value) ? value : DEFAULT_DASHBOARD_TAB;

export const homeTabOf = (key: DashboardCardKey): DashboardTab | null =>
  HOME_TAB[key];

const isCardKey = (value: string): value is DashboardCardKey =>
  Object.prototype.hasOwnProperty.call(HOME_TAB, value);

/**
 * The cards on Summary, in order: the saved list (or the default one), with unknown,
 * repeated and Ask Sparky entries dropped, and At a Glance always kept because Summary is
 * its only home.
 */
export const resolveSummaryCards = (
  saved: readonly string[] | null | undefined
): DashboardCardKey[] => {
  const result: DashboardCardKey[] = [];
  for (const key of saved ?? DEFAULT_SUMMARY_CARDS) {
    if (!isCardKey(key) || key === 'askSparky' || result.includes(key))
      continue;
    result.push(key);
  }
  for (const key of Object.keys(HOME_TAB) as DashboardCardKey[]) {
    if (HOME_TAB[key] === 'summary' && !result.includes(key)) result.push(key);
  }
  return result;
};

/**
 * The cards that live on one of Nutrition, Activity or Wellness, in order: the tab's own
 * saved order first, then any card it does not list yet (a card added in a later build,
 * or a tab never reordered) in the one shared Dashboard order, so nobody's layout changes
 * when per-tab ordering arrives.
 */
export const resolveHomeTabCards = (
  tab: Exclude<DashboardTab, 'summary'>,
  savedTabOrder: readonly string[] | undefined,
  sharedOrder: readonly DashboardCardKey[]
): DashboardCardKey[] => {
  const result: DashboardCardKey[] = [];
  for (const key of savedTabOrder ?? []) {
    if (isCardKey(key) && HOME_TAB[key] === tab && !result.includes(key)) {
      result.push(key);
    }
  }
  for (const key of sharedOrder) {
    if (HOME_TAB[key] === tab && !result.includes(key)) result.push(key);
  }
  return result;
};

export interface DashboardTabLayout {
  /** The one shared order, still used with tabs off and as each tab's starting order. */
  sharedOrder: readonly DashboardCardKey[];
  tabOrders: Partial<Record<DashboardTab, readonly string[]>>;
  summaryCards: readonly DashboardCardKey[];
}

/** The cards of one tab, with Ask Sparky at the top so every tab opens on it. */
export const cardsForTab = (
  tab: DashboardTab,
  layout: DashboardTabLayout
): DashboardCardKey[] => [
  'askSparky',
  ...(tab === 'summary'
    ? layout.summaryCards
    : resolveHomeTabCards(tab, layout.tabOrders[tab], layout.sharedOrder)),
];

export const cardShowsOnTab = (
  key: DashboardCardKey,
  tab: DashboardTab,
  summaryCards: readonly DashboardCardKey[]
): boolean =>
  key === 'askSparky' ||
  HOME_TAB[key] === tab ||
  (tab === 'summary' && summaryCards.includes(key));

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
