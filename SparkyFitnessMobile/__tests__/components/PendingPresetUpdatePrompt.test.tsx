import { AppState } from 'react-native';
import { act, render } from '@testing-library/react-native';
import PendingPresetUpdatePrompt from '../../src/components/PendingPresetUpdatePrompt';
import { usePendingPresetUpdateStore } from '../../src/stores/pendingPresetUpdateStore';
import { notifyPresetUpdateAvailable } from '../../src/services/notifications';
import type { WorkoutCelebration } from '../../src/utils/workoutCelebration';

let capturedArgs: {
  onSettled?: () => void;
  onNeedsUpdate?: (name: string) => void;
} = {};
jest.mock('../../src/hooks/useWorkoutCompletePresetSync', () => ({
  useWorkoutCompletePresetSync: (a: typeof capturedArgs) => {
    capturedArgs = a;
  },
}));
jest.mock('../../src/services/notifications', () => ({
  notifyPresetUpdateAvailable: jest.fn(),
}));

const celebration = {
  session: { exercises: [] },
  completedSetIds: {},
  plannedSetValues: {},
  sourcePresetId: 5,
  sourceServerConfigId: 'srv',
  finishedAt: 1,
} as unknown as WorkoutCelebration;

function setAppState(state: string) {
  Object.defineProperty(AppState, 'currentState', {
    value: state,
    configurable: true,
  });
}

describe('PendingPresetUpdatePrompt', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    usePendingPresetUpdateStore.setState({ pending: celebration });
  });

  it('renders nothing and checks nothing when nothing is pending', () => {
    usePendingPresetUpdateStore.setState({ pending: null });
    capturedArgs = {};
    render(<PendingPresetUpdatePrompt />);
    expect(capturedArgs.onSettled).toBeUndefined();
  });

  it('sends a notification when the app is not in front', () => {
    setAppState('background');
    render(<PendingPresetUpdatePrompt />);
    capturedArgs.onNeedsUpdate?.('Push');
    expect(notifyPresetUpdateAvailable).toHaveBeenCalledWith('Push');
  });

  it('leaves it to the in-app prompt when the app is in front', () => {
    setAppState('active');
    render(<PendingPresetUpdatePrompt />);
    capturedArgs.onNeedsUpdate?.('Push');
    expect(notifyPresetUpdateAvailable).not.toHaveBeenCalled();
  });

  it('clears the pending workout once settled', () => {
    render(<PendingPresetUpdatePrompt />);
    act(() => capturedArgs.onSettled?.());
    expect(usePendingPresetUpdateStore.getState().pending).toBeNull();
  });
});
