import { createHash } from 'node:crypto';
import axios from 'axios';
import { z } from 'zod';
import {
  locateStopsAlongRoute,
  routeDistanceMeters,
  simplifyRoute,
  type RoutePoint,
  type RouteStopCandidate,
  type RouteStopsResponse,
} from '@workspace/shared';
import { log } from '../config/logging.js';
import pkg from '../package.json' with { type: 'json' };
import { createUserRateLimiter } from '../utils/userRateLimiter.js';
import { getOverpassUrl } from './routeStopsConfig.js';

/** How far either side of the route a stop may be and still count. */
export const STOPS_CORRIDOR_M = 150;
/** Vertices of the route sent to Overpass; the corridor is a polyline query. */
const QUERY_MAX_POINTS = 60;
/** Longer routes are not looked up: the query would be too costly for a shared service. */
export const STOPS_MAX_ROUTE_M = 120_000;
/** Elements asked for, and stops returned, at most. */
const MAX_ELEMENTS = 300;
const MAX_STOPS = 150;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;
const QUERY_TIMEOUT_S = 12;

/** A route's stops barely change; the policy asks for caching, so keep them for days. */
export const STOPS_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** A failure is remembered briefly so a broken endpoint is not hammered. */
export const STOPS_FAILURE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;

/** All queries from this server share one budget, whoever asks. */
export const overpassRateLimiter = createUserRateLimiter(20, 60_000);

const USER_AGENT = `${pkg.name}/${pkg.version} (route stops; https://github.com/CodeWithCJ/SparkyFitness)`;

const NO_DATA: RouteStopsResponse = {
  status: 'no_data',
  stops: [],
  truncated: false,
};

const responseSchema = z.object({
  remark: z.string().optional(),
  elements: z.array(
    z.object({
      lat: z.number().optional(),
      lon: z.number().optional(),
      center: z.object({ lat: z.number(), lon: z.number() }).optional(),
      tags: z.record(z.string(), z.string()).optional(),
    })
  ),
});

/** The Overpass QL for everything of interest within the corridor. */
export function buildStopsQuery(
  points: readonly Pick<RoutePoint, 'lat' | 'lon'>[]
): string {
  const line = simplifyRoute(points as RoutePoint[], QUERY_MAX_POINTS, 10)
    .points.map((p) => `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`)
    .join(',');
  return (
    `[out:json][timeout:${QUERY_TIMEOUT_S}];` +
    `nwr(around:${STOPS_CORRIDOR_M},${line})` +
    '[~"^(amenity|tourism)$"~"^(drinking_water|toilets|cafe|viewpoint)$"];' +
    `out tags center ${MAX_ELEMENTS};`
  );
}

function classify(
  tags: Record<string, string>
): RouteStopCandidate['kind'] | null {
  // Private or closed facilities are no use to someone passing by.
  if (tags.access === 'private' || tags.access === 'no') return null;
  if (tags.amenity === 'drinking_water') {
    return tags.drinking_water === 'no' ? null : 'water';
  }
  if (tags.amenity === 'toilets') return 'toilets';
  if (tags.amenity === 'cafe') return 'cafe';
  if (tags.tourism === 'viewpoint') return 'viewpoint';
  return null;
}

/** Reads an Overpass answer into candidates; null when it is not one we understand. */
export function parseStopsResponse(
  data: unknown
): { candidates: RouteStopCandidate[]; capped: boolean } | null {
  const parsed = responseSchema.safeParse(data);
  // A remark means the server gave up part-way (timeout, out of memory).
  if (!parsed.success || parsed.data.remark) return null;
  const candidates: RouteStopCandidate[] = [];
  for (const element of parsed.data.elements) {
    const lat = element.lat ?? element.center?.lat;
    const lon = element.lon ?? element.center?.lon;
    const kind = classify(element.tags ?? {});
    if (lat === undefined || lon === undefined || !kind) continue;
    const name = element.tags?.name?.trim().slice(0, 80);
    candidates.push({ kind, name: name || null, lat, lon });
  }
  return {
    candidates,
    capped: parsed.data.elements.length >= MAX_ELEMENTS,
  };
}

interface CacheEntry {
  value: RouteStopsResponse;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<RouteStopsResponse>>();

export function clearRouteStopsCache(): void {
  cache.clear();
  inFlight.clear();
}

function remember(key: string, value: RouteStopsResponse, ttlMs: number): void {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

async function queryOverpass(
  url: string,
  query: string,
  points: readonly Pick<RoutePoint, 'lat' | 'lon'>[]
): Promise<{ value: RouteStopsResponse; ttlMs: number }> {
  // The policy limits what one client may ask; stay well inside it.
  if (overpassRateLimiter.hit('overpass') > 0) {
    log('warn', 'Overpass budget used up; skipping a stops lookup');
    return { value: NO_DATA, ttlMs: 0 };
  }
  try {
    const response = await axios.post(
      url,
      new URLSearchParams({ data: query }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          'User-Agent': USER_AGENT,
        },
        timeout: REQUEST_TIMEOUT_MS,
        maxContentLength: MAX_RESPONSE_BYTES,
        maxRedirects: 0,
      }
    );
    const read = parseStopsResponse(response.data);
    if (!read) return { value: NO_DATA, ttlMs: STOPS_FAILURE_TTL_MS };
    const located = locateStopsAlongRoute(
      points,
      read.candidates,
      STOPS_CORRIDOR_M
    );
    return {
      value: {
        status: 'ok',
        stops: located.slice(0, MAX_STOPS),
        truncated: read.capped || located.length > MAX_STOPS,
      },
      ttlMs: STOPS_CACHE_TTL_MS,
    };
  } catch {
    // Not logged with the error: its config holds the request.
    log('warn', 'Overpass lookup failed; showing no stops');
    return { value: NO_DATA, ttlMs: STOPS_FAILURE_TTL_MS };
  }
}

/**
 * The drinking water, toilets, cafes and viewpoints within reach of a route,
 * in route order. Never throws: every failure (unset, too long, rate limited,
 * unreachable, timed out, unreadable) is `no_data`. Answers are cached for
 * days by corridor, and concurrent identical lookups share one query.
 */
export async function getStopsAlongRoute(
  points: readonly Pick<RoutePoint, 'lat' | 'lon'>[]
): Promise<RouteStopsResponse> {
  const url = getOverpassUrl();
  if (!url || points.length < 2) return NO_DATA;
  if (routeDistanceMeters(points as RoutePoint[]) > STOPS_MAX_ROUTE_M) {
    return NO_DATA;
  }

  const query = buildStopsQuery(points);
  const key = createHash('sha256').update(`${url}\n${query}`).digest('hex');

  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  const pending = inFlight.get(key);
  if (pending) return pending;

  const lookup = queryOverpass(url, query, points)
    .then(({ value, ttlMs }) => {
      if (ttlMs > 0) remember(key, value, ttlMs);
      return value;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, lookup);
  return lookup;
}
