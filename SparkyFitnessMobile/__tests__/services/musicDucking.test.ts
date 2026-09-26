import { AppState } from 'react-native';
import * as Speech from 'expo-speech';
import { setAudioModeAsync, setIsAudioActiveAsync } from 'expo-audio';
import {
  __resetSoundsForTests,
  beginCueDucking,
  endCueDucking,
  playIntervalCue,
  startIntervalAudioSession,
  stopIntervalAudioSession,
} from '../../src/services/sounds';
import { __resetSpeechForTests, speakGuided } from '../../src/services/speech';
import {
  __resetAppPreferencesStoreForTests,
  useAppPreferencesStore,
} from '../../src/stores/appPreferencesStore';

const mockSetAudioMode = setAudioModeAsync as jest.MockedFunction<
  typeof setAudioModeAsync
>;
const mockSetActive = setIsAudioActiveAsync as jest.MockedFunction<
  typeof setIsAudioActiveAsync
>;
const mockSpeak = Speech.speak as jest.MockedFunction<typeof Speech.speak>;

describe('music ducking during cues (#1560)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    __resetAppPreferencesStoreForTests();
    __resetSoundsForTests();
    __resetSpeechForTests();
    mockSetAudioMode.mockClear();
    mockSetActive.mockClear();
    mockSpeak.mockClear();
    Object.defineProperty(AppState, 'currentState', {
      get: () => 'active',
      configurable: true,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('never touches the audio session while the setting is off', async () => {
    await startIntervalAudioSession();
    mockSetAudioMode.mockClear();
    expect(beginCueDucking()).toBe(false);
    playIntervalCue('work');
    jest.advanceTimersByTime(5000);
    await Promise.resolve();
    expect(mockSetAudioMode).not.toHaveBeenCalled();
    expect(mockSetActive).not.toHaveBeenCalled();
  });

  it('ducks for a cue, then restores mixing and releases focus', async () => {
    useAppPreferencesStore.getState().setDuckMusicDuringCues(true);
    await startIntervalAudioSession();
    mockSetAudioMode.mockClear();

    playIntervalCue('work');
    expect(mockSetAudioMode).toHaveBeenLastCalledWith({
      playsInSilentMode: true,
      interruptionMode: 'duckOthers',
    });

    await jest.advanceTimersByTimeAsync(1200 + 600);
    expect(mockSetAudioMode).toHaveBeenLastCalledWith({
      playsInSilentMode: true,
      interruptionMode: 'mixWithOthers',
    });
    expect(mockSetActive).toHaveBeenCalledWith(false);
  });

  it('ducks once for overlapping cues and restores after the last', async () => {
    useAppPreferencesStore.getState().setDuckMusicDuringCues(true);
    expect(beginCueDucking()).toBe(true);
    expect(beginCueDucking()).toBe(true);
    endCueDucking();
    await jest.advanceTimersByTimeAsync(1000);
    expect(
      mockSetAudioMode.mock.calls.filter(
        ([mode]) => mode.interruptionMode === 'duckOthers'
      )
    ).toHaveLength(1);
    expect(mockSetActive).not.toHaveBeenCalled();
    endCueDucking();
    await jest.advanceTimersByTimeAsync(600);
    expect(mockSetActive).toHaveBeenCalledWith(false);
    // An extra release is harmless.
    endCueDucking();
  });

  it('ducks while a guided line is spoken', async () => {
    useAppPreferencesStore.getState().setDuckMusicDuringCues(true);
    useAppPreferencesStore.getState().setGuidedWorkoutEnabled(true);
    speakGuided(['Bench press, set one']);
    const options = mockSpeak.mock.calls[0][1]!;
    options.onStart?.();
    expect(mockSetAudioMode).toHaveBeenLastCalledWith(
      expect.objectContaining({ interruptionMode: 'duckOthers' })
    );
    options.onDone?.();
    await jest.advanceTimersByTimeAsync(600);
    expect(mockSetActive).toHaveBeenCalledWith(false);
  });

  it('stopping the interval session cancels a pending restore', async () => {
    useAppPreferencesStore.getState().setDuckMusicDuringCues(true);
    beginCueDucking();
    endCueDucking();
    await stopIntervalAudioSession();
    await jest.advanceTimersByTimeAsync(1000);
    expect(mockSetActive).not.toHaveBeenCalled();
  });
});
