/**
 * Helpers for the preferences a person asks Sparky to remember (#2013), shared
 * by the web and mobile editors.
 */

const MAX_KEY_LENGTH = 100;

/**
 * The storage key for a preference a person names in settings, e.g.
 * "Coaching style" becomes `coaching_style`. Keys are lowercase a-z, digits and
 * underscores and start with a letter; a name with none of those (another
 * script, only symbols) falls back to `note_<fallbackSuffix>`.
 */
export function assistantPreferenceKey(
  name: string,
  fallbackSuffix: string
): string {
  const slug = name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^[^a-z]+/, '')
    .replace(/_+$/, '')
    .slice(0, MAX_KEY_LENGTH);
  if (slug) return slug;
  const suffix = fallbackSuffix.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return `note_${suffix || '1'}`.slice(0, MAX_KEY_LENGTH);
}

/** How a stored key is shown: `coaching_style` reads "coaching style". */
export function assistantPreferenceLabel(key: string): string {
  return key.replace(/_/g, ' ');
}
