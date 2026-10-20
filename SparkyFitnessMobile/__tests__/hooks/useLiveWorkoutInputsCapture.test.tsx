import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { PresetSessionResponse } from '@workspace/shared';
import { useLiveWorkoutInputsCapture } from '../../src/hooks/useLiveWorkoutInputsCapture';
import {
  __resetActiveWorkoutStoreForTests,
  useActiveWorkoutStore,
} from '../../src/stores/activeWorkoutStore';
import { fetchExerciseStats } from '../../src/services/api/exerciseApi';
import { getActiveServerConfig } from '../../src/services/storage';

jest.mock('../../src/services/api/exerciseApi', () => ({
  fetchExerciseStats: jest.fn(),
}));
jest.mock('../../src/services/storage', () => ({
  getActiveServerConfig: jest.fn(),
}));
jest.mock('../../src/hooks/useLiveCoachingSignals', () => ({
  useLiveCoachingSignals: jest.fn(),
}));
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: jest.fn(() => ({
    preferences: { default_weight_unit: 'lbs' },
  })),
}));

const mockFetchExerciseStats = fetchExerciseStats as jest.Mock;
const mockGetActiveServerConfig = getActiveServerConfig as jest.Mock;

function makeSession(): PresetSessionResponse {
  return {
    type: 'preset',
    id: 'session-1',
    exercises: [
      {
        id: 'entry-1',
        exercise_id: 'ex-1',
        exercise_snapshot: { id: 'ex-1', name: 'Bench Press' },
        sets: [],
      },
    ],
  } as unknown as PresetSessionResponse;
}

const previousSets = [
  { setNumber: 1, setType: 'normal', weight: 100, reps: 8 },
];

function renderCapture() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useLiveWorkoutInputsCapture(), { wrapper });
}

describe('useLiveWorkoutInputsCapture', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetActiveWorkoutStoreForTests();
    mockGetActiveServerConfig.mockResolvedValue({ id: 'server-1' });
    mockFetchExerciseStats.mockResolvedValue({
      bestSet: { weight: 100, reps: 8 },
      recentSessions: [{ sets: previousSets }],
    });
  });

  it('captures history, PR baseline and weight unit with no workout screen mounted', async () => {
    act(() => {
      useActiveWorkoutStore.setState({
        session: makeSession(),
        sessionId: 'session-1',
        sourcePresetId: 7,
        sourceServerConfigId: 'server-1',
      });
    });
    renderCapture();

    await waitFor(() =>
      expect(useActiveWorkoutStore.getState().previousSessionSets).toEqual({
        'ex-1': previousSets,
      })
    );
    // Scoped to the preset and excluding the in-progress session, like the card.
    expect(mockFetchExerciseStats).toHaveBeenCalledWith('ex-1', 'session-1', 7);
    expect(useActiveWorkoutStore.getState().prBaseline).toEqual({
      'ex-1': { weight: 100, reps: 8 },
    });
    expect(useActiveWorkoutStore.getState().weightUnit).toBe('lbs');
  });

  it('drops the preset scope when it belongs to another server', async () => {
    mockGetActiveServerConfig.mockResolvedValue({ id: 'server-2' });
    act(() => {
      useActiveWorkoutStore.setState({
        session: makeSession(),
        sessionId: 'session-1',
        sourcePresetId: 7,
        sourceServerConfigId: 'server-1',
      });
    });
    renderCapture();

    await waitFor(() =>
      expect(mockFetchExerciseStats).toHaveBeenCalledWith(
        'ex-1',
        'session-1',
        undefined
      )
    );
  });

  it('does not fetch before the preset scope has settled', () => {
    mockGetActiveServerConfig.mockReturnValue(new Promise(() => {}));
    act(() => {
      useActiveWorkoutStore.setState({
        session: makeSession(),
        sessionId: 'session-1',
        sourcePresetId: 7,
        sourceServerConfigId: 'server-1',
      });
    });
    renderCapture();

    expect(mockFetchExerciseStats).not.toHaveBeenCalled();
  });

  it('does nothing without a live workout', () => {
    renderCapture();

    expect(mockFetchExerciseStats).not.toHaveBeenCalled();
    expect(useActiveWorkoutStore.getState().weightUnit).toBe('kg');
  });

  it('fetches a freestyle exercise unscoped without waiting on a server check', async () => {
    act(() => {
      useActiveWorkoutStore.setState({
        session: makeSession(),
        sessionId: 'session-1',
      });
    });
    renderCapture();

    await waitFor(() =>
      expect(mockFetchExerciseStats).toHaveBeenCalledWith(
        'ex-1',
        'session-1',
        undefined
      )
    );
    expect(mockGetActiveServerConfig).not.toHaveBeenCalled();
  });
});
