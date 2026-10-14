/**
 * Catalog key for a piece of display text that `@workspace/shared` ships in
 * English (flow levels, vitamin names, article titles, ...). The English text is
 * what gets stored or compared, so apps translate it only for display, under
 * `sharedText.<key>` in their own English catalog. The key is the first words
 * of the text plus a hash of the whole text, so it is stable, unique, and can
 * be computed from the text alone.
 */
export function sharedTextKey(text: string): string {
  const words = text
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4);
  const base = words
    .map((word, i) =>
      i === 0
        ? word.charAt(0).toLowerCase() + word.slice(1)
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join("")
    .slice(0, 32);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${base || "text"}_${(hash >>> 0).toString(36)}`;
}
