import { useMemo } from 'react';

import { useWidgetLayoutStore } from '../stores/widgetLayoutStore';
import type { WidgetMetricExtras } from '../services/widgetMetricSnapshot';
import type { CheckInMeasurement } from '../types/measurements';
import { toWatchFast } from '../utils/watchFast';
import { useCurrentFast } from './useFasting';

interface UseWidgetExtrasOptions {
  /** The day's check-in, already loaded by the caller. */
  measurements: CheckInMeasurement | undefined;
  /** The day the widget numbers are for; a check-in from another day is ignored. */
  date: string | undefined;
  enabled: boolean;
}

const positive = (n: number | null | undefined): number | undefined =>
  typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : undefined;

/**
 * The widget figures the daily summary does not carry, for `useWidgetSync`.
 * Steps and weight come from the check-in the caller already has, so they
 * cost nothing. The running fast is fetched only while a saved widget actually
 * shows the fasting timer, so a person without such a widget makes no extra
 * request.
 *
 * Sleep, heart rate and the logging streak are not wired yet: those metrics
 * show their empty state on the widget until they are.
 */
export function useWidgetExtras({
  measurements,
  date,
  enabled,
}: UseWidgetExtrasOptions): WidgetMetricExtras {
  const needsFast = useWidgetLayoutStore((state) =>
    state.layouts.some((layout) =>
      layout.metrics.some((m) => m.metric === 'fasting_elapsed')
    )
  );
  const { data: currentFast } = useCurrentFast({
    enabled: enabled && needsFast,
  });

  const checkIn =
    measurements && measurements.entry_date === date ? measurements : undefined;
  const steps = positive(checkIn?.steps);
  const weightKg = positive(checkIn?.weight);
  const fastStartedAt = needsFast
    ? toWatchFast(currentFast)?.startedAt
    : undefined;

  return useMemo(
    () => ({ steps, weightKg, fastStartedAt }),
    [steps, weightKg, fastStartedAt]
  );
}
