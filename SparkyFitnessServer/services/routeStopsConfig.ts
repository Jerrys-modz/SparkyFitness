/**
 * The Overpass endpoint stops are looked up from, or null when the operator
 * has not set one (the feature is then off and hidden). Read per call so the
 * admin only has to set the variable.
 */
export function getOverpassUrl(): string | null {
  const value = process.env.SPARKY_FITNESS_OVERPASS_URL?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function isRouteStopsAvailable(): boolean {
  return getOverpassUrl() !== null;
}
