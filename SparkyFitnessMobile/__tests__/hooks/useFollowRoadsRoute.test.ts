import { act, renderHook } from '@testing-library/react-native';
import type { GeneratedRoutePreview, RoutePoint } from '@workspace/shared';
import {
  FOLLOW_ROADS_DEBOUNCE_MS,
  useFollowRoadsRoute,
} from '../../src/hooks/useFollowRoadsRoute';
import { generateRoutePreview } from '../../src/services/routeService';
import { ApiError } from '../../src/services/api/errors';

jest.mock('../../src/services/routeService', () => ({
  generateRoutePreview: jest.fn(),
}));

const mockGenerate = generateRoutePreview as jest.MockedFunction<
  typeof generateRoutePreview
>;

const pt = (i: number): RoutePoint => ({ lat: 40 + i * 0.001, lon: -100 });
const preview = (distanceM: number): GeneratedRoutePreview => ({
  name: 'Generated',
  activity: 'run',
  source: 'generated',
  points: [pt(0), pt(5)],
  cues: [{ index: 0, kind: 'left' }],
  distanceM,
  elevationGainM: null,
});

const flush = () => act(async () => undefined);
const advance = (ms: number) =>
  act(async () => {
    jest.advanceTimersByTime(ms);
  });

describe('useFollowRoadsRoute', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockGenerate.mockReset();
  });
  afterEach(() => jest.useRealTimers());

  it('does nothing when off or with fewer than two taps', async () => {
    const { result, rerender } = renderHook(
      ({ enabled, points }: { enabled: boolean; points: RoutePoint[] }) =>
        useFollowRoadsRoute(enabled, points),
      { initialProps: { enabled: false, points: [pt(0), pt(1)] } }
    );
    await advance(FOLLOW_ROADS_DEBOUNCE_MS * 2);
    expect(mockGenerate).not.toHaveBeenCalled();
    rerender({ enabled: true, points: [pt(0)] });
    await advance(FOLLOW_ROADS_DEBOUNCE_MS * 2);
    expect(mockGenerate).not.toHaveBeenCalled();
    expect(result.current.preview).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it('debounces bursts of taps into one waypoints request', async () => {
    mockGenerate.mockResolvedValue(preview(1000));
    const { result, rerender } = renderHook(
      ({ points }: { points: RoutePoint[] }) =>
        useFollowRoadsRoute(true, points),
      { initialProps: { points: [pt(0), pt(1)] } }
    );
    await advance(FOLLOW_ROADS_DEBOUNCE_MS - 100);
    rerender({ points: [pt(0), pt(1), pt(2)] });
    await advance(FOLLOW_ROADS_DEBOUNCE_MS - 100);
    rerender({ points: [pt(0), pt(1), pt(2), pt(3)] });
    expect(result.current.isLoading).toBe(true);
    expect(mockGenerate).not.toHaveBeenCalled();

    await advance(FOLLOW_ROADS_DEBOUNCE_MS);
    await flush();
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(mockGenerate.mock.calls[0][0]).toMatchObject({
      mode: 'waypoints',
      start: pt(0),
      waypoints: [pt(1), pt(2), pt(3)],
    });
    expect(result.current.preview?.distanceM).toBe(1000);
    expect(result.current.isCurrent).toBe(true);
    expect(result.current.isLoading).toBe(false);
  });

  it('keeps the last good line when the next request fails', async () => {
    mockGenerate.mockResolvedValueOnce(preview(1000));
    const { result, rerender } = renderHook(
      ({ points }: { points: RoutePoint[] }) =>
        useFollowRoadsRoute(true, points),
      { initialProps: { points: [pt(0), pt(1)] } }
    );
    await advance(FOLLOW_ROADS_DEBOUNCE_MS);
    await flush();
    expect(result.current.preview?.distanceM).toBe(1000);

    mockGenerate.mockRejectedValueOnce(new ApiError('nope', 422, '{}'));
    rerender({ points: [pt(0), pt(1), pt(2)] });
    await advance(FOLLOW_ROADS_DEBOUNCE_MS);
    await flush();
    expect(result.current.preview?.distanceM).toBe(1000);
    expect(result.current.isCurrent).toBe(false);
    expect(result.current.errorKind).toBe('noRoute');
    expect(result.current.isLoading).toBe(false);
  });

  it('ignores an older response that arrives after newer taps', async () => {
    let resolveFirst: (value: GeneratedRoutePreview) => void = () => undefined;
    mockGenerate.mockImplementationOnce(
      () => new Promise((resolve) => (resolveFirst = resolve))
    );
    mockGenerate.mockResolvedValueOnce(preview(2000));
    const { result, rerender } = renderHook(
      ({ points }: { points: RoutePoint[] }) =>
        useFollowRoadsRoute(true, points),
      { initialProps: { points: [pt(0), pt(1)] } }
    );
    await advance(FOLLOW_ROADS_DEBOUNCE_MS);
    rerender({ points: [pt(0), pt(1), pt(2)] });
    await advance(FOLLOW_ROADS_DEBOUNCE_MS);
    await flush();
    expect(result.current.preview?.distanceM).toBe(2000);

    await act(async () => resolveFirst(preview(1000)));
    expect(result.current.preview?.distanceM).toBe(2000);
  });

  it('pauses after a rate limit until retry', async () => {
    mockGenerate.mockRejectedValueOnce(new ApiError('slow down', 429, '{}'));
    const { result, rerender } = renderHook(
      ({ points }: { points: RoutePoint[] }) =>
        useFollowRoadsRoute(true, points),
      { initialProps: { points: [pt(0), pt(1)] } }
    );
    await advance(FOLLOW_ROADS_DEBOUNCE_MS);
    await flush();
    expect(result.current.errorKind).toBe('rateLimited');

    rerender({ points: [pt(0), pt(1), pt(2)] });
    await advance(FOLLOW_ROADS_DEBOUNCE_MS * 2);
    expect(mockGenerate).toHaveBeenCalledTimes(1);

    mockGenerate.mockResolvedValueOnce(preview(3000));
    act(() => result.current.retry());
    await flush();
    expect(mockGenerate).toHaveBeenCalledTimes(2);
    expect(result.current.preview?.distanceM).toBe(3000);
    expect(result.current.error).toBeNull();
  });

  it('drops the preview when switched off', async () => {
    mockGenerate.mockResolvedValue(preview(1000));
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useFollowRoadsRoute(enabled, [pt(0), pt(1)]),
      { initialProps: { enabled: true } }
    );
    await advance(FOLLOW_ROADS_DEBOUNCE_MS);
    await flush();
    expect(result.current.preview).not.toBeNull();
    rerender({ enabled: false });
    expect(result.current.preview).toBeNull();
  });
});
