import { renderHook } from '@testing-library/react-native';

import { useWidgetExtras } from '../../src/hooks/useWidgetExtras';
import { useWidgetLayoutStore } from '../../src/stores/widgetLayoutStore';

const mockUseCurrentFast = jest.fn();
jest.mock('../../src/hooks/useFasting', () => ({
  useCurrentFast: (options: unknown) => mockUseCurrentFast(options),
}));

const layoutWith = (metric: 'steps' | 'fasting_elapsed') => ({
  id: 'w1',
  name: 'W',
  family: 'small' as const,
  style: 'ring' as const,
  metrics: [{ metric }],
  accent: 'blue' as const,
  showTitle: true,
  standByFriendly: false,
  version: 1 as const,
  updatedAt: 1,
});

const checkIn = (overrides = {}) => ({
  entry_date: '2026-11-09',
  steps: 6420,
  weight: 80.5,
  ...overrides,
});

describe('useWidgetExtras', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseCurrentFast.mockReturnValue({ data: undefined });
    useWidgetLayoutStore.setState({ layouts: [] });
  });

  it('passes steps and weight from the day check-in', () => {
    const { result } = renderHook(() =>
      useWidgetExtras({
        measurements: checkIn(),
        date: '2026-11-09',
        enabled: true,
      })
    );
    expect(result.current).toEqual({
      steps: 6420,
      weightKg: 80.5,
      fastStartedAt: undefined,
    });
  });

  it('ignores a check-in from another day', () => {
    const { result } = renderHook(() =>
      useWidgetExtras({
        measurements: checkIn({ entry_date: '2026-11-08' }),
        date: '2026-11-09',
        enabled: true,
      })
    );
    expect(result.current.steps).toBeUndefined();
    expect(result.current.weightKg).toBeUndefined();
  });

  it('treats zero and missing figures as absent, never as a real zero', () => {
    const { result } = renderHook(() =>
      useWidgetExtras({
        measurements: checkIn({ steps: 0, weight: null }),
        date: '2026-11-09',
        enabled: true,
      })
    );
    expect(result.current.steps).toBeUndefined();
    expect(result.current.weightKg).toBeUndefined();
  });

  it('does not fetch the fast unless a layout shows the fasting timer', () => {
    useWidgetLayoutStore.setState({ layouts: [layoutWith('steps')] });
    renderHook(() =>
      useWidgetExtras({
        measurements: undefined,
        date: undefined,
        enabled: true,
      })
    );
    expect(mockUseCurrentFast).toHaveBeenLastCalledWith({ enabled: false });
  });

  it('fetches the fast and returns its start for a fasting layout', () => {
    useWidgetLayoutStore.setState({ layouts: [layoutWith('fasting_elapsed')] });
    mockUseCurrentFast.mockReturnValue({
      data: {
        start_time: '2026-11-09T04:00:00.000Z',
        target_end_time: null,
        is_eating_window: false,
      },
    });
    const { result } = renderHook(() =>
      useWidgetExtras({
        measurements: undefined,
        date: undefined,
        enabled: true,
      })
    );
    expect(mockUseCurrentFast).toHaveBeenLastCalledWith({ enabled: true });
    expect(result.current.fastStartedAt).toBe(
      new Date('2026-11-09T04:00:00.000Z').getTime()
    );
  });

  it('does not count an eating window as a fast', () => {
    useWidgetLayoutStore.setState({ layouts: [layoutWith('fasting_elapsed')] });
    mockUseCurrentFast.mockReturnValue({
      data: {
        start_time: '2026-11-09T04:00:00.000Z',
        target_end_time: null,
        is_eating_window: true,
      },
    });
    const { result } = renderHook(() =>
      useWidgetExtras({
        measurements: undefined,
        date: undefined,
        enabled: true,
      })
    );
    expect(result.current.fastStartedAt).toBeUndefined();
  });

  it('stays off while the server is not connected', () => {
    useWidgetLayoutStore.setState({ layouts: [layoutWith('fasting_elapsed')] });
    renderHook(() =>
      useWidgetExtras({
        measurements: undefined,
        date: undefined,
        enabled: false,
      })
    );
    expect(mockUseCurrentFast).toHaveBeenLastCalledWith({ enabled: false });
  });
});
