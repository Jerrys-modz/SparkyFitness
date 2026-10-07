import { act, render } from '@testing-library/react-native';
import PendingPresetUpdatePrompt from '../../src/components/PendingPresetUpdatePrompt';
import { usePendingPresetUpdateStore } from '../../src/stores/pendingPresetUpdateStore';
import type { WorkoutCelebration } from '../../src/utils/workoutCelebration';

let capturedArgs: {
  onSettled?: () => void;
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
const mockOffer = jest.fn(() => Promise.resolve(true));
jest.mock('../../modules/watch-connectivity', () => ({
  __esModule: true,
  default: {
    addListener: jest.fn((_event: string, cb: typeof answerHandler) => {
      answerHandler = cb;
      return { remove: jest.fn() };
    }),
    offerPresetUpdate: (...args: unknown[]) => mockOffer(...(args as [])),
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

describe('PendingPresetUpdatePrompt', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    answerHandler = null;
    capturedArgs = {};
    usePendingPresetUpdateStore.setState({
      pending: { celebration, sessionId: 'sess-1' },
    });
  });

  it('renders nothing and checks nothing when nothing is pending', () => {
    usePendingPresetUpdateStore.setState({ pending: null });
    render(<PendingPresetUpdatePrompt />);
    expect(capturedArgs.onSettled).toBeUndefined();
  });

  it('asks the watch once the preset turns out to need updating', () => {
    render(<PendingPresetUpdatePrompt />);
    capturedArgs.onNeedsUpdate?.({
      presetName: 'Push',
      update: jest.fn(async () => {}),
    });
    expect(mockOffer).toHaveBeenCalledWith('sess-1', 'Push');
  });

  it('applies the update and settles when the watch says yes', async () => {
    const update = jest.fn(async () => {});
    render(<PendingPresetUpdatePrompt />);
    capturedArgs.onNeedsUpdate?.({ presetName: 'Push', update });
    await act(async () => {
      answerHandler?.({ sessionId: 'sess-1', update: true });
    });
    expect(update).toHaveBeenCalledTimes(1);
    expect(usePendingPresetUpdateStore.getState().pending).toBeNull();
  });

  it('settles without updating when the watch says keep', async () => {
    const update = jest.fn(async () => {});
    render(<PendingPresetUpdatePrompt />);
    capturedArgs.onNeedsUpdate?.({ presetName: 'Push', update });
    await act(async () => {
      answerHandler?.({ sessionId: 'sess-1', update: false });
    });
    expect(update).not.toHaveBeenCalled();
    expect(usePendingPresetUpdateStore.getState().pending).toBeNull();
  });

  it('ignores an answer for another workout', async () => {
    const update = jest.fn(async () => {});
    render(<PendingPresetUpdatePrompt />);
    capturedArgs.onNeedsUpdate?.({ presetName: 'Push', update });
    await act(async () => {
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
