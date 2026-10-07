import { act, render } from '@testing-library/react-native';
import PendingPresetUpdatePrompt from '../../src/components/PendingPresetUpdatePrompt';
import { usePendingPresetUpdateStore } from '../../src/stores/pendingPresetUpdateStore';
import type { WorkoutCelebration } from '../../src/utils/workoutCelebration';

let capturedArgs: {
  onSettled?: () => void;
  skipPrompt?: boolean;
  onNeedsUpdate?: (offer: {
    presetName: string;
    update: () => Promise<void>;
  }) => void;
} = {};
jest.mock('../../src/hooks/useWorkoutCompletePresetSync', () => ({
  useWorkoutCompletePresetSync: (a: typeof capturedArgs) => {
    capturedArgs = a;
  },
}));

let answerHandler:
  ((p: { sessionId: string; update: boolean }) => void) | null = null;
jest.mock('../../modules/watch-connectivity', () => ({
  __esModule: true,
  default: {
    addListener: jest.fn((_event: string, cb: typeof answerHandler) => {
      answerHandler = cb;
      return { remove: jest.fn() };
    }),
  },
}));

const celebration = {
  session: { exercises: [] },
  completedSetIds: {},
  plannedSetValues: {},
  sourcePresetId: 5,
  sourceServerConfigId: 'srv',
  finishedAt: 1,
} as unknown as WorkoutCelebration;

const offer = (update = jest.fn(async () => {})) => ({
  presetName: 'Push',
  update,
});

describe('PendingPresetUpdatePrompt', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    answerHandler = null;
    capturedArgs = {};
    usePendingPresetUpdateStore.setState({
      pending: { celebration, sessionId: 'sess-1' },
      answers: {},
    });
  });

  it('renders nothing and checks nothing when nothing is pending', () => {
    usePendingPresetUpdateStore.setState({ pending: null });
    render(<PendingPresetUpdatePrompt />);
    expect(capturedArgs.onSettled).toBeUndefined();
  });

  it('keeps the phone prompt on while the watch has not answered', () => {
    render(<PendingPresetUpdatePrompt />);
    expect(capturedArgs.skipPrompt).toBe(false);
  });

  it('updates the preset when the watch said yes before the workout arrived', async () => {
    const update = jest.fn(async () => {});
    usePendingPresetUpdateStore.getState().setAnswer('sess-1', true);
    render(<PendingPresetUpdatePrompt />);
    expect(capturedArgs.skipPrompt).toBe(true);
    await act(async () => {
      capturedArgs.onNeedsUpdate?.(offer(update));
    });
    expect(update).toHaveBeenCalledTimes(1);
    expect(usePendingPresetUpdateStore.getState().pending).toBeNull();
    expect(usePendingPresetUpdateStore.getState().answers).toEqual({});
  });

  it('settles without updating when the watch said keep', async () => {
    const update = jest.fn(async () => {});
    usePendingPresetUpdateStore.getState().setAnswer('sess-1', false);
    render(<PendingPresetUpdatePrompt />);
    await act(async () => {
      capturedArgs.onNeedsUpdate?.(offer(update));
    });
    expect(update).not.toHaveBeenCalled();
    expect(usePendingPresetUpdateStore.getState().pending).toBeNull();
  });

  it('applies an answer that arrives after the workout does', async () => {
    const update = jest.fn(async () => {});
    render(<PendingPresetUpdatePrompt />);
    await act(async () => {
      capturedArgs.onNeedsUpdate?.(offer(update));
    });
    expect(update).not.toHaveBeenCalled();
    await act(async () => {
      answerHandler?.({ sessionId: 'sess-1', update: true });
    });
    expect(update).toHaveBeenCalledTimes(1);
    expect(usePendingPresetUpdateStore.getState().pending).toBeNull();
  });

  it('ignores an answer for another workout', async () => {
    const update = jest.fn(async () => {});
    render(<PendingPresetUpdatePrompt />);
    await act(async () => {
      capturedArgs.onNeedsUpdate?.(offer(update));
      answerHandler?.({ sessionId: 'other', update: true });
    });
    expect(update).not.toHaveBeenCalled();
    expect(usePendingPresetUpdateStore.getState().pending).not.toBeNull();
  });

  it('clears the pending workout once settled in the app', () => {
    render(<PendingPresetUpdatePrompt />);
    act(() => capturedArgs.onSettled?.());
    expect(usePendingPresetUpdateStore.getState().pending).toBeNull();
  });
});
