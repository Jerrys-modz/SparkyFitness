import type { ActivityRingKey } from '../constants/activityRings';
import type { HealthTrendKey } from '../constants/healthTrends';
import {
  PINNED_METRIC_KEYS,
  type PinnedMetricKey,
} from '../constants/pinnedMetrics';

export type ResolvedPinnedMetric =
  | { kind: 'ring'; key: ActivityRingKey; pinned: PinnedMetricKey }
  | { kind: 'trend'; key: HealthTrendKey; pinned: PinnedMetricKey };

/**
 * The saved pick as drawable metrics, in registry order. Keys the registry no longer
 * knows are dropped, so removing a metric in a later build never breaks the card.
 */
export function resolvePinnedMetrics(
  saved: readonly string[]
): ResolvedPinnedMetric[] {
  return PINNED_METRIC_KEYS.filter((key) => saved.includes(key)).map(
    (pinned) => {
      const [kind, key] = pinned.split(':');
      return kind === 'ring'
        ? { kind: 'ring', key: key as ActivityRingKey, pinned }
        : { kind: 'trend', key: key as HealthTrendKey, pinned };
    }
  );
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
