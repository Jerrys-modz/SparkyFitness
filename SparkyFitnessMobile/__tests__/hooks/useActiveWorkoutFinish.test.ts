import { act, renderHook } from '@testing-library/react-native';

import { useActiveWorkoutFinish } from '../../src/hooks/useActiveWorkoutFinish';
import { useActiveWorkoutStore } from '../../src/stores/activeWorkoutStore';
import { useAppPreferencesStore } from '../../src/stores/appPreferencesStore';
import { useLiveHeartRateStore } from '../../src/stores/liveHeartRateStore';
import { savePhoneWorkoutToHealth } from '../../src/services/phoneWorkoutHealth';

jest.mock('../../src/services/phoneWorkoutHealth', () => ({
  savePhoneWorkoutToHealth: jest.fn().mockResolvedValue(true),
}));

const mockSave = savePhoneWorkoutToHealth as jest.Mock;

function renderFinish() {
  const navigation = { replace: jest.fn() };
  const hook = renderHook(() =>
    useActiveWorkoutFinish({
      navigation,
      session: null,
      completedSetIds: {},
      flush: jest.fn().mockResolvedValue(true),
      durationSheetRef: { current: null },
      safeGoBack: jest.fn(),
    })
  );
  return hook;
}

function seedWorkout(sessionId: string) {
  useActiveWorkoutStore.setState({
    sessionId,
    session: { id: 'p1', name: 'Push', exercises: [] } as never,
    completedSetIds: { '1': 1_700_000_300_000 },
    startedAt: 1_700_000_000_000,
    workoutFormat: 'standard',
  } as never);
}

describe('useActiveWorkoutFinish Apple Health write', () => {
  beforeEach(() => {
    mockSave.mockClear();
    useLiveHeartRateStore.setState({ reading: null });
    useAppPreferencesStore.setState({ saveWorkoutsToHealth: true });
  });

  it('files a phone-only workout when the setting is on', async () => {
    seedWorkout('s1');
    const { result } = renderFinish();
    await act(async () => {
      await result.current.handleFinish();
    });
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 's1', startedAt: 1_700_000_000_000 })
    );
  });

  it('does nothing when the setting is off', async () => {
    useAppPreferencesStore.setState({ saveWorkoutsToHealth: false });
    seedWorkout('s1');
    const { result } = renderFinish();
    await act(async () => {
      await result.current.handleFinish();
    });
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('skips a session the watch recorded', async () => {
    seedWorkout('s1');
    useLiveHeartRateStore.setState({
      reading: { sessionId: 's1', exerciseEntryId: 'e', bpm: 120, at: 1 },
    });
    const { result } = renderFinish();
    await act(async () => {
      await result.current.handleFinish();
    });
    expect(mockSave).not.toHaveBeenCalled();
  });
});
