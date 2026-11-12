import { useMemo } from 'react';
import { WIDGET_ACCENTS, type WidgetAccent } from '@workspace/shared';
import { useCSSVariable } from 'uniwind';

import { WIDGET_ACCENT_TOKENS } from '../constants/widgetBuilder';

/**
 * The widget accents as colors for the current theme, read from the
 * `global.css` tokens in `WIDGET_ACCENT_TOKENS`. A color is undefined only
 * where the theme has not resolved it (tests).
 */
export function useWidgetAccentColors(): Record<
  WidgetAccent,
  string | undefined
> {
  const values = useCSSVariable(
    WIDGET_ACCENTS.map((accent) => WIDGET_ACCENT_TOKENS[accent])
  ) as (string | undefined)[];
  const key = values.join('|');
  return useMemo(
    () =>
      Object.fromEntries(
        WIDGET_ACCENTS.map((accent, index) => [accent, values[index]])
      ) as Record<WidgetAccent, string | undefined>,
    // `values` is a new array each render; its contents are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key]
  );
}
