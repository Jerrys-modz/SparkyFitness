import { renderHook } from '@testing-library/react-native';

import { useRouteStartDistance } from '../../src/hooks/useRouteStartDistance';

const M = 1 / 111_195;
const at = (northM: number) => ({ lat: 51.5 + northM * M, lon: -0.12 });
const route = [at(0), at(300)];

describe('useRouteStartDistance', () => {
  it('is null with no route or no fix', () => {
    expect(
      renderHook(() => useRouteStartDistance(undefined, [at(-500)])).result
        .current
    ).toBeNull();
    expect(
      renderHook(() => useRouteStartDistance(route, [])).result.current
    ).toBeNull();
  });

  it('measures from the newest fix to the first route point', () => {
    const { result, rerender } = renderHook(
      ({ track }) => useRouteStartDistance(route, track),
      { initialProps: { track: [at(-800)] } }
    );
    expect(result.current).toBeCloseTo(800, 0);
    rerender({ track: [at(-800), at(-600)] });
    expect(result.current).toBeCloseTo(600, 0);
  });

  it('stays null after the track has touched the line, even if it drifts away', () => {
    const { result, rerender } = renderHook(
      ({ track }) => useRouteStartDistance(route, track),
      { initialProps: { track: [at(-200)] } }
    );
    expect(result.current).toBeCloseTo(200, 0);
    rerender({ track: [at(-200), at(10)] });
    expect(result.current).toBeNull();
    rerender({ track: [at(-200), at(10), at(-400)] });
    expect(result.current).toBeNull();
  });

  it('starts over when the chosen route changes', () => {
    const other = [at(-1000), at(-900)];
    const track = [at(10), at(-400)];
    const { result, rerender } = renderHook(
      ({ r }) => useRouteStartDistance(r, track),
      { initialProps: { r: route } }
    );
    expect(result.current).toBeNull();
    rerender({ r: other });
    expect(result.current).toBeCloseTo(600, 0);
  });
});
