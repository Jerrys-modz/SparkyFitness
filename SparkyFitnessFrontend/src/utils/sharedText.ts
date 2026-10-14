import type { TFunction } from 'i18next';
import { sharedTextKey } from '@workspace/shared';

/**
 * Display text for a string that `@workspace/shared` ships in English (flow
 * levels, vitamin names, article titles, ...). Falls back to the text itself,
 * so user-created values pass through unchanged.
 */
export function sharedText(t: TFunction, text: string): string {
  if (!text) return text;
  return t(`sharedText.${sharedTextKey(text)}`, text);
}
