import type { TFunction } from 'i18next';
import { sharedText } from '@/utils/sharedText';

const labelKey = (label: string): string => {
  const words = label
    .replace(/[^A-Za-z0-9 ]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words
    .map((word, i) =>
      i === 0
        ? word.charAt(0).toLowerCase() + word.slice(1)
        : word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join('');
};

/**
 * Display text for a built-in symptom option (location, quality, trigger,
 * relief, phase or default symptom). The English label is what is stored on
 * entries, so this only translates what is shown. Labels without a catalog
 * entry, such as options the user created, render as typed.
 */
export function translateSymptomLabel(t: TFunction, label: string): string {
  const key = labelKey(label);
  return key ? t(`symptoms.builtIn.${key}`, sharedText(t, label)) : label;
}
