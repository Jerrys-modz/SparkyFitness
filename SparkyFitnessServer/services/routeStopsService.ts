import { createHash } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import axios, { isAxiosError } from 'axios';
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
import type { ProviderEndpoint } from './providerEndpoint.js';

/** How far either side of the route a stop may be and still count. */
export const STOPS_CORRIDOR_M = 150;
/** Vertices of the route sent to Overpass; the corridor is a polyline query. */
const QUERY_MAX_POINTS = 60;
/** Longer routes are not looked up: the query would be too costly for a shared service. */
export const STOPS_MAX_ROUTE_M = 120_000;
/**
 * The most points of the route placed against the stops. Finding the nearest
 * point of the route for every stop is points x stops, so a very long track is
 * thinned first (a saved route never has more, a request body takes no more).
 */
const MAX_LOCATE_POINTS = 2000;
/** Elements asked for, and read from an answer, at most. */
const MAX_ELEMENTS = 300;
/** A server that ignores `out ... 300` still cannot make us read more than this. */
const MAX_ELEMENTS_READ = 1000;
const MAX_NAME_LENGTH = 80;
const MAX_STOPS = 150;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;
const QUERY_TIMEOUT_S = 12;

/** A route's stops barely change; the policy asks for caching, so keep them for days. */
export const STOPS_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** A failure is remembered briefly so a broken endpoint is not hammered. */
export const STOPS_FAILURE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;

/**
 * After the server answers 429 (too many requests) or 406 (blocked), nothing
 * more is sent to it for this long, as the Overpass usage guidance asks.
 */
export const STOPS_BACKOFF_MS = 30_000;
/** Lookups waiting for their turn at one endpoint; more than this read as busy. */
export const STOPS_MAX_QUEUED = 5;

/** All queries from this server to one endpoint share a budget, whoever asks. */
export const overpassRateLimiter = createUserRateLimiter(20, 60_000);

const USER_AGENT = `SparkyFitness/${pkg.version} (route stops; https://github.com/CodeWithCJ/SparkyFitness)`;

const NO_DATA: RouteStopsResponse = {
  status: 'no_data',
  stops: [],
  truncated: false,
};

const BUSY: RouteStopsResponse = {
  status: 'busy',
  stops: [],
  truncated: false,
};

// Overpass asks clients not to run requests in parallel, so lookups to one
// endpoint run one at a time, in the order they came.
const queues = new Map<string, { tail: Promise<unknown>; waiting: number }>();
const backoffUntil = new Map<string, number>();

/** True while the endpoint has asked us to slow down. */
export function isStopsEndpointBusy(url: string): boolean {
  const until = backoffUntil.get(url);
  if (until === undefined) return false;
  if (until > Date.now()) return true;
  backoffUntil.delete(url);
  return false;
}

/** Runs `task` after every earlier one for `url`; null when too many are waiting. */
function runInTurn<T>(url: string, task: () => Promise<T>): Promise<T> | null {
  const queue = queues.get(url) ?? { tail: Promise.resolve(), waiting: 0 };
  if (queue.waiting >= STOPS_MAX_QUEUED) return null;
  queue.waiting++;
  const result = queue.tail.then(task, task);
  queue.tail = result
    .catch(() => undefined)
    .finally(() => {
      queue.waiting--;
      if (queue.waiting === 0) queues.delete(url);
    });
  queues.set(url, queue);
  return result;
}

const responseSchema = z.object({
  remark: z.string().optional(),
  // Not capped here: the answer is already limited to MAX_RESPONSE_BYTES, and
  // only the first MAX_ELEMENTS_READ are looked at.
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

/** A display name from map data: no control characters, bounded length. */
function cleanName(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  // Capped before it is scanned, so a huge tag costs no more than a short one.
  let name = '';
  for (const char of raw.slice(0, MAX_NAME_LENGTH * 4)) {
    const code = char.codePointAt(0) ?? 0;
    name += code < 0x20 || code === 0x7f ? ' ' : char;
  }
  return name.trim().slice(0, MAX_NAME_LENGTH);
}

/** Reads an Overpass answer into candidates; null when it is not one we understand. */
export function parseStopsResponse(
  data: unknown
): { candidates: RouteStopCandidate[]; capped: boolean } | null {
  const parsed = responseSchema.safeParse(data);
  // A remark means the server gave up part-way (timeout, out of memory).
  if (!parsed.success || parsed.data.remark) return null;
  const candidates: RouteStopCandidate[] = [];
  for (const element of parsed.data.elements.slice(0, MAX_ELEMENTS_READ)) {
    const lat = element.lat ?? element.center?.lat;
    const lon = element.lon ?? element.center?.lon;
    const kind = classify(element.tags ?? {});
    if (lat === undefined || lon === undefined || !kind) continue;
    const name = cleanName(element.tags?.name);
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
  queues.clear();
  backoffUntil.clear();
}

function remember(key: string, value: RouteStopsResponse, ttlMs: number): void {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

async function queryOverpass(
  endpoint: ProviderEndpoint,
  query: string,
  points: readonly Pick<RoutePoint, 'lat' | 'lon'>[]
): Promise<{ value: RouteStopsResponse; ttlMs: number }> {
  // The policy limits what one client may ask; stay well inside it.
  if (overpassRateLimiter.hit(endpoint.url) > 0) {
    log('warn', 'Overpass budget used up; skipping a stops lookup');
    return { value: BUSY, ttlMs: 0 };
  }
  try {
    const response = await axios.post(
      endpoint.url,
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
        ...(endpoint.lookup
          ? {
              httpAgent: new http.Agent({ lookup: endpoint.lookup }),
              httpsAgent: new https.Agent({ lookup: endpoint.lookup }),
            }
          : {}),
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
  } catch (error) {
    // Not logged with the error: its config holds the request.
    const status = isAxiosError(error) ? error.response?.status : undefined;
    if (status === 429 || status === 406) {
      backoffUntil.set(endpoint.url, Date.now() + STOPS_BACKOFF_MS);
      log('warn', `Overpass asked us to slow down (${status}); pausing`);
      return { value: BUSY, ttlMs: 0 };
    }
    log('warn', 'Overpass lookup failed; showing no stops');
    return { value: NO_DATA, ttlMs: STOPS_FAILURE_TTL_MS };
  }
}

/**
 * The drinking water, toilets, cafes and viewpoints within reach of a route,
 * in route order, looked up from the person's Overpass endpoint. Never throws:
 * every failure (too long, unreachable, timed out, unreadable) is `no_data`.
 * `busy` means the endpoint's budget is used up or it asked us to slow down
 * (429 or 406); it is left alone for 30 s. Lookups to one endpoint never run
 * in parallel. Answers are cached for days, and concurrent identical lookups
 * share one query.
 */
export async function getStopsAlongRoute(
  endpoint: ProviderEndpoint,
  points: readonly Pick<RoutePoint, 'lat' | 'lon'>[]
): Promise<RouteStopsResponse> {
  if (points.length < 2) return NO_DATA;
  if (routeDistanceMeters(points as RoutePoint[]) > STOPS_MAX_ROUTE_M) {
    return NO_DATA;
  }

  const locatePoints =
    points.length > MAX_LOCATE_POINTS
      ? simplifyRoute(points as RoutePoint[], MAX_LOCATE_POINTS, 3).points
      : points;
  const query = buildStopsQuery(locatePoints);
  // The stops are placed along this exact line, so it is part of the key, not
  // just the (coarser) corridor query.
  const key = createHash('sha256')
    .update(endpoint.url)
    .update('\n')
    .update(query)
    .update('\n')
    .update(
      locatePoints
        .map((p) => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`)
        .join(';')
    )
    .digest('hex');

  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  const pending = inFlight.get(key);
  if (pending) return pending;
  if (isStopsEndpointBusy(endpoint.url)) return BUSY;

  const turn = runInTurn(endpoint.url, () => {
    // It may have been told to slow down while this one waited.
    if (isStopsEndpointBusy(endpoint.url)) {
      return Promise.resolve({ value: BUSY, ttlMs: 0 });
    }
    return queryOverpass(endpoint, query, locatePoints);
  });
  if (!turn) return BUSY;
  const lookup = turn
    .then(({ value, ttlMs }) => {
      if (ttlMs > 0) remember(key, value, ttlMs);
      return value;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, lookup);
  return lookup;
}
