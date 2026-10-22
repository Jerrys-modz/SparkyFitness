import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildFollowRoadsRequest,
  followRoadsKey,
  type GeneratedRoutePreview,
  type RouteGenerateErrorKind,
  type RoutePoint,
} from '@workspace/shared';
import { generateRoutePreview } from '../services/routeService';
import { classifyRouteGenerateError } from '../utils/routeGenerateError';

/** Wait for the taps to settle: the server allows 10 requests per 10 minutes. */
export const FOLLOW_ROADS_DEBOUNCE_MS = 800;

export interface FollowRoadsState {
  /** The last route the engine returned; kept on screen while a new one loads or fails. */
  preview: GeneratedRoutePreview | null;
  /** True when `preview` was routed from the taps as they are now. */
  isCurrent: boolean;
  isLoading: boolean;
  error: unknown;
  errorKind: RouteGenerateErrorKind | null;
  /** Asks again now, also after a rate limit paused automatic requests. */
  retry: () => void;
}

interface Settled {
  route: GeneratedRoutePreview;
  key: string;
}

/**
 * Snaps ordered taps to roads through the generate endpoint (waypoints mode).
 * Requests are debounced, only the latest one is used, and the last good
 * preview stays when a request fails. A rate-limit answer pauses automatic
 * requests until `retry` so later taps do not keep hitting the limit.
 */
export function useFollowRoadsRoute(
  enabled: boolean,
  points: readonly RoutePoint[]
): FollowRoadsState {
  const [settled, setSettled] = useState<Settled | null>(null);
  // The taps a request last finished for, whether it worked or not.
  const [finishedKey, setFinishedKey] = useState<string | null>(null);
  const [failure, setFailure] = useState<{
    error: unknown;
    kind: RouteGenerateErrorKind;
  } | null>(null);
  const sequence = useRef(0);
  const paused = useRef(false);

  const key = useMemo(() => followRoadsKey(points), [points]);
  const request = useMemo(() => buildFollowRoadsRequest(points), [points]);
  const active = enabled && request !== null;

  // Nothing to show once following is off or there are fewer than two taps.
  // Reset during render (not in an effect) so no stale line flashes.
  const [wasActive, setWasActive] = useState(false);
  if (active !== wasActive) {
    setWasActive(active);
    if (!active) {
      setSettled(null);
      setFinishedKey(null);
      setFailure(null);
    }
  }

  const run = useCallback(() => {
    if (!request) return;
    const mine = ++sequence.current;
    generateRoutePreview(request)
      .then((route) => {
        if (mine !== sequence.current) return;
        paused.current = false;
        setSettled({ route, key });
        setFinishedKey(key);
        setFailure(null);
      })
      .catch((error: unknown) => {
        if (mine !== sequence.current) return;
        const kind = classifyRouteGenerateError(error);
        if (kind === 'rateLimited') paused.current = true;
        setFinishedKey(key);
        setFailure({ error, kind });
      });
  }, [request, key]);

  useEffect(() => {
    // Newer taps (or switching off) make any request still in flight stale.
    sequence.current++;
    if (!active) {
      paused.current = false;
      return;
    }
    if (paused.current) return;
    const timer = setTimeout(run, FOLLOW_ROADS_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [active, run]);

  const retry = useCallback(() => {
    paused.current = false;
    setFailure(null);
    setFinishedKey(null);
    run();
  }, [run]);

  return {
    preview: active ? (settled?.route ?? null) : null,
    isCurrent: active && settled?.key === key,
    isLoading: active && finishedKey !== key && failure?.kind !== 'rateLimited',
    error: failure?.error ?? null,
    errorKind: failure?.kind ?? null,
    retry,
  };
}
