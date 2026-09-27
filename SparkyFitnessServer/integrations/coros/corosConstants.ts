export const COROS_PROVIDER_TYPE = 'coros_mcp';

export const COROS_REGIONS = {
  us: 'https://mcpus.coros.com/mcp',
  eu: 'https://mcpeu.coros.com/mcp',
  cn: 'https://mcpcn.coros.com/mcp',
} as const;

export type CorosRegion = keyof typeof COROS_REGIONS;
export const DEFAULT_COROS_MCP_URL = COROS_REGIONS.us;
export const COROS_SCOPE = 'openid offline_access mcp.tools';
export const COROS_ENTRY_SOURCE = 'COROS';
export const COROS_FIT_BUDGET_PER_DAY = 45;
export const COROS_SPORT_RECORDS_PAGE_LIMIT = 100;
export const COROS_SPORT_RECORDS_WINDOW_DAYS = 90;
export const COROS_ALL_SPORTS = [65535];

const ALLOWED_MCP_URLS = new Set<string>(Object.values(COROS_REGIONS));

/**
 * Validates and resolves the COROS MCP regional endpoint URL.
 * Throws an error if baseUrl is non-empty and does not match an allowed COROS region (SSRF guard).
 */
export function resolveCorosMcpUrl(baseUrl: string | null | undefined): string {
  if (!baseUrl || baseUrl.trim() === '') {
    return DEFAULT_COROS_MCP_URL;
  }
  const trimmed = baseUrl.trim();
  if (!ALLOWED_MCP_URLS.has(trimmed)) {
    throw new Error(
      `Invalid COROS MCP URL '${trimmed}'. Allowed URLs: ${Array.from(ALLOWED_MCP_URLS).join(', ')}`
    );
  }
  return trimmed;
}

/**
 * Returns the origin / issuer URL for a given COROS MCP endpoint.
 */
export function corosIssuerFromMcpUrl(url: string): string {
  const resolved = resolveCorosMcpUrl(url);
  return new URL(resolved).origin;
}

/**
 * Lookup table for COROS sportType codes to human-readable names and categories.
 * Used primarily for summary fallback when FIT files are unavailable.
 */
export const COROS_SPORT_TYPES: Record<
  number,
  { name: string; category: string }
> = {
  100: { name: 'Outdoor Run', category: 'cardio' },
  101: { name: 'Indoor Run', category: 'cardio' },
  102: { name: 'Trail Run', category: 'cardio' },
  103: { name: 'Track Run', category: 'cardio' },
  104: { name: 'Hike', category: 'cardio' },
  105: { name: 'Mountain Climb', category: 'cardio' },
  106: { name: 'Multi-Pitch', category: 'cardio' },
  200: { name: 'Outdoor Bike', category: 'cardio' },
  201: { name: 'Indoor Bike', category: 'cardio' },
  202: { name: 'E-Bike', category: 'cardio' },
  203: { name: 'Gravel', category: 'cardio' },
  204: { name: 'MTB', category: 'cardio' },
  205: { name: 'E-MTB', category: 'cardio' },
  299: { name: 'Helmet Bike', category: 'cardio' },
  300: { name: 'Pool Swim', category: 'cardio' },
  301: { name: 'Open Water', category: 'cardio' },
  400: { name: 'Gym Cardio', category: 'cardio' },
  401: { name: 'GPS Cardio', category: 'cardio' },
  402: { name: 'Strength', category: 'strength' },
  500: { name: 'Ski', category: 'cardio' },
  501: { name: 'Snowboard', category: 'cardio' },
  502: { name: 'XC Ski', category: 'cardio' },
  503: { name: 'Alpine Touring', category: 'cardio' },
  600: { name: 'Fighter', category: 'cardio' },
  700: { name: 'Rowing', category: 'cardio' },
  701: { name: 'Indoor Row', category: 'cardio' },
  702: { name: 'Whitewater', category: 'cardio' },
  704: { name: 'Flatwater', category: 'cardio' },
  705: { name: 'Windsurfing', category: 'cardio' },
  706: { name: 'Speedsurfing', category: 'cardio' },
  707: { name: 'Spearfishing', category: 'cardio' },
  800: { name: 'Indoor Climb', category: 'cardio' },
  801: { name: 'Bouldering', category: 'cardio' },
  802: { name: 'Outdoor Climb', category: 'cardio' },
  900: { name: 'Walk', category: 'cardio' },
  901: { name: 'Jump Rope', category: 'cardio' },
  902: { name: 'Stair Climbing', category: 'cardio' },
  903: { name: 'Elliptical', category: 'cardio' },
  904: { name: 'Yoga', category: 'cardio' },
  905: { name: 'Pilates', category: 'cardio' },
  906: { name: 'Boxing', category: 'cardio' },
  1000: { name: 'Badminton', category: 'cardio' },
  1001: { name: 'Ping Pong', category: 'cardio' },
  1002: { name: 'Basketball', category: 'cardio' },
  1003: { name: 'Soccer', category: 'cardio' },
  1004: { name: 'Pickleball', category: 'cardio' },
  1005: { name: 'Tennis', category: 'cardio' },
  1006: { name: 'Padel', category: 'cardio' },
  1100: { name: 'Frisbee', category: 'cardio' },
  1101: { name: 'Skateboard', category: 'cardio' },
  1200: { name: 'Hybrid Fitness', category: 'cardio' },
  9999: { name: 'Custom', category: 'cardio' },
  10000: { name: 'Triathlon', category: 'cardio' },
  10001: { name: 'Free Combine', category: 'cardio' },
  10002: { name: 'Climb Ski', category: 'cardio' },
  10003: { name: 'Multi-Pitch Climb', category: 'cardio' },
  25301: { name: 'Track Route', category: 'cardio' },
};
