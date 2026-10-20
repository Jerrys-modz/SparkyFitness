import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildFollowRoadsRequest,
  followRoadsKey,
  type GeneratedRoutePreview,
  type RouteGenerateErrorKind,
  type RouteStyle,
} from '@workspace/shared';
import { generateRoutePreview } from '../services/routeService';
import { classifyRouteGenerateError } from '../utils/routeGenerateError';
import {
  assembleLine,
  planSegments,
  segmentPoints,
  type EditorLine,
  type EditorSegment,
  type EditorState,
} from '../utils/routeEditor';

/** Wait for the edits to settle: the server allows 10 requests per 10 minutes. */
export const FOLLOW_ROADS_DEBOUNCE_MS = 800;
/** Routed pieces kept for undo/redo and for toggling back; oldest go first. */
const CACHE_LIMIT = 200;

type SnapSegment = Extract<EditorSegment, { kind: 'snap' }>;

export interface FollowRoadsState {
  /** The whole line as drawn now: routed pieces where available, straight or kept pieces elsewhere. */
  line: EditorLine;
  /** True when no snapped piece is still waiting for (or failed to get) its routed line. */
  isCurrent: boolean;
  isLoading: boolean;
  error: unknown;
  errorKind: RouteGenerateErrorKind | null;
  /** Asks again now, also after a rate limit paused automatic requests. */
  retry: () => void;
}

interface Failure {
  error: unknown;
  kind: RouteGenerateErrorKind;
}

/**
 * Snaps the snapped stretches of an edited route to roads through the generate
 * endpoint (waypoints mode). Consecutive snapped stretches are routed together
 * as one piece, so moving a point only re-routes the pieces beside it, and each
 * piece's answer is cached by its waypoints (undo, redo and toggling back cost
 * no request). Requests are debounced, a failed piece shows straight until
 * `retry`, and a rate-limit answer pauses automatic requests so later edits do
 * not keep hitting the limit. A changed `style` counts as a changed request.
 */
export function useFollowRoadsRoute(
  enabled: boolean,
  state: EditorState,
  style?: RouteStyle
): FollowRoadsState {
  const [cache, setCache] = useState<
    ReadonlyMap<string, GeneratedRoutePreview>
  >(() => new Map());
  const [failures, setFailures] = useState<ReadonlyMap<string, Failure>>(
    () => new Map()
  );
  const [paused, setPaused] = useState(false);
  const inFlight = useRef(new Set<string>());

  const segments = useMemo(
    () => planSegments(state, enabled),
    [state, enabled]
  );
  const pieces = useMemo(
    () =>
      segments
        .filter((s): s is SnapSegment => s.kind === 'snap')
        .map((segment) => {
          const points = segmentPoints(state, segment);
          return {
            segment,
            key: followRoadsKey(points, 'run', style),
            request: buildFollowRoadsRequest(points, 'run', style),
          };
        }),
    [segments, state, style]
  );
  const keyOf = useMemo(() => {
    const keys = new Map<SnapSegment, string>();
    pieces.forEach((piece) => keys.set(piece.segment, piece.key));
    return keys;
  }, [pieces]);

  const line = useMemo(
    () =>
      assembleLine(state, segments, (segment) => {
        const key = keyOf.get(segment);
        return key ? (cache.get(key) ?? null) : null;
      }),
    [state, segments, keyOf, cache]
  );

  const missing = pieces.filter(
    (piece) => !cache.has(piece.key) && !failures.has(piece.key)
  );
  const missingKey = missing.map((piece) => piece.key).join('|');

  const run = useCallback(() => {
    for (const piece of pieces) {
      if (
        !piece.request ||
        cache.has(piece.key) ||
        failures.has(piece.key) ||
        inFlight.current.has(piece.key)
      ) {
        continue;
      }
      const { key, request } = piece;
      inFlight.current.add(key);
      generateRoutePreview(request)
        .then((route) => {
          setCache((current) => {
            const next = new Map(current).set(key, route);
            if (next.size > CACHE_LIMIT) {
              const oldest = next.keys().next().value;
              if (oldest !== undefined) next.delete(oldest);
            }
            return next;
          });
        })
        .catch((error: unknown) => {
          const kind = classifyRouteGenerateError(error);
          if (kind === 'rateLimited') setPaused(true);
          setFailures((current) => new Map(current).set(key, { error, kind }));
        })
        .finally(() => inFlight.current.delete(key));
    }
  }, [pieces, cache, failures]);

  useEffect(() => {
    if (!enabled || missingKey === '' || paused) return;
    const timer = setTimeout(run, FOLLOW_ROADS_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [enabled, missingKey, paused, run]);

  const retry = useCallback(() => {
    setPaused(false);
    setFailures(new Map());
  }, []);

  // The failure of any piece in the current line; others may have routed fine.
  const failure = pieces
    .map((piece) => failures.get(piece.key))
    .find((f): f is Failure => f !== undefined);

  return {
    line,
    isCurrent: enabled ? pieces.every((piece) => cache.has(piece.key)) : true,
    isLoading: enabled && missing.length > 0 && !paused,
    error: failure?.error ?? null,
    errorKind: failure?.kind ?? null,
    retry,
  };
}
