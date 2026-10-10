import { useCallback, useState } from 'react';

import type { ReportSectionKey } from '../constants/reports';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import type { TrendRange } from '../utils/trendRange';

/**
 * What a report screen reads from Reports → Customize: the window it opens on
 * (still switchable on the screen, without changing the saved default) and a
 * way to ask whether a section is turned on.
 */
export function useReportCustomization() {
  const defaultRange = useAppPreferencesStore((s) => s.reportDefaultRange);
  const hiddenSections = useAppPreferencesStore((s) => s.hiddenReportSections);
  const [range, setRange] = useState<TrendRange>(defaultRange);
  const isSectionShown = useCallback(
    (key: ReportSectionKey) => !hiddenSections.includes(key),
    [hiddenSections]
  );
  return { range, setRange, isSectionShown };
}
