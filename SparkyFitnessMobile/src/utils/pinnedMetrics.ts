import {
  STAND_HOURS_SUPPORTED,
  type ActivityRingKey,
} from '../constants/activityRings';
import type { HealthTrendKey } from '../constants/healthTrends';
import {
  GLANCE_AUTO_CANDIDATES,
  GLANCE_AUTO_COUNT,
  MAX_PINNED_METRICS,
  PINNED_METRIC_KEYS,
  type GoalMetricKey,
  type PinnedMetricKey,
} from '../constants/pinnedMetrics';

export type ResolvedPinnedMetric =
  | { kind: 'ring'; key: ActivityRingKey; pinned: PinnedMetricKey }
  | { kind: 'goal'; key: GoalMetricKey; pinned: PinnedMetricKey }
  | { kind: 'trend'; key: HealthTrendKey; pinned: PinnedMetricKey };

const parsePinnedKey = (pinned: PinnedMetricKey): ResolvedPinnedMetric => {
  const [kind, key] = pinned.split(':');
  if (kind === 'ring') return { kind, key: key as ActivityRingKey, pinned };
  if (kind === 'goal') return { kind, key: key as GoalMetricKey, pinned };
  return { kind: 'trend', key: key as HealthTrendKey, pinned };
};

const isAvailable = (key: string): key is PinnedMetricKey =>
  (PINNED_METRIC_KEYS as readonly string[]).includes(key) &&
  (key !== 'ring:stand' || STAND_HOURS_SUPPORTED);

/**
 * The saved pick as drawable metrics, in registry order. Keys the registry no longer
 * knows are dropped, so removing a metric in a later build never breaks the card, and
 * Stand is dropped where Apple Health is not available.
 */
export function resolvePinnedMetrics(
  saved: readonly string[]
): ResolvedPinnedMetric[] {
  return PINNED_METRIC_KEYS.filter(
    (key) => saved.includes(key) && isAvailable(key)
  ).map(parsePinnedKey);
}

/** The candidates for automatic mode, in their own order (best first). */
export function resolveGlanceCandidates(
  auto: boolean,
  saved: readonly string[]
): ResolvedPinnedMetric[] {
  return auto
    ? GLANCE_AUTO_CANDIDATES.filter(isAvailable).map(parsePinnedKey)
    : resolvePinnedMetrics(saved);
}

/** Which cards are on screen, as far as the strip needs to know to avoid repeating them. */
export type VisibleCards = {
  /** The rings the Activity Rings card draws, or null while that card is hidden. */
  activityRings: readonly ActivityRingKey[] | null;
  exercise: boolean;
  calorieRing: boolean;
  macros: boolean;
  hydration: boolean;
};

/** The metrics another visible card already shows, so automatic mode can skip them. */
export function coveredPinnedKeys(cards: VisibleCards): Set<PinnedMetricKey> {
  const covered = new Set<PinnedMetricKey>();
  for (const key of cards.activityRings ?? []) {
    covered.add(`ring:${key}` as PinnedMetricKey);
  }
  if (cards.exercise) {
    covered.add('ring:move');
    covered.add('ring:exercise');
  }
  if (cards.calorieRing) covered.add('goal:calories');
  if (cards.macros) {
    covered.add('goal:protein');
    covered.add('goal:carbs');
    covered.add('goal:fat');
  }
  if (cards.hydration) covered.add('goal:water');
  return covered;
}

/**
 * The chips to draw. Automatic mode takes the first few candidates that no other visible
 * card shows and that have data; a manual pick is honoured as chosen, minus empty ones,
 * because the person asked for those.
 */
export function pickGlanceMetrics(options: {
  auto: boolean;
  candidates: readonly ResolvedPinnedMetric[];
  covered: ReadonlySet<PinnedMetricKey>;
  hasData: (metric: ResolvedPinnedMetric) => boolean;
}): ResolvedPinnedMetric[] {
  const { auto, candidates, covered, hasData } = options;
  const usable = candidates.filter(
    (metric) => hasData(metric) && !(auto && covered.has(metric.pinned))
  );
  return usable.slice(0, auto ? GLANCE_AUTO_COUNT : MAX_PINNED_METRICS);
}

/** The trend graphs the pinned metrics need loaded. */
export function pinnedTrendKeys(
  metrics: readonly ResolvedPinnedMetric[]
): HealthTrendKey[] {
  return metrics.flatMap((metric) =>
    metric.kind === 'trend' ? [metric.key] : []
  );
}

/** Whether the pinned metrics include the Active points ring, which costs requests. */
export function pinsActivePoints(
  metrics: readonly ResolvedPinnedMetric[]
): boolean {
  return metrics.some(
    (metric) => metric.kind === 'ring' && metric.key === 'points'
  );
}
