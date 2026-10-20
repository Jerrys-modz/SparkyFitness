import * as Notifications from 'expo-notifications';

import { initMoodCheckinNotificationResponses } from '../../src/services/moodCheckinNotificationHandler';
import { addNotificationResponseListener } from '../../src/services/notifications';
import { navigationRef } from '../../src/components/ActiveWorkoutBar';

jest.mock('../../src/services/notifications', () => ({
  addNotificationResponseListener: jest.fn(),
}));

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  navigationRef: { isReady: jest.fn(() => true), navigate: jest.fn() },
}));

jest.mock('../../src/hooks/useQuickActions', () => {
  const { navigationRef: ref } = jest.requireMock(
    '../../src/components/ActiveWorkoutBar'
  );
  return {
    whenNavigationReady: (run: () => void) => {
      if (ref.isReady()) run();
    },
  };
});

const mockAddListener = addNotificationResponseListener as jest.Mock;
const mockNavigate = navigationRef.navigate as unknown as jest.Mock;
const mockGetLast = Notifications.getLastNotificationResponse as jest.Mock;
const mockClearLast = Notifications.clearLastNotificationResponse as jest.Mock;

function response(actionIdentifier: string, kind?: string) {
  return {
    actionIdentifier,
    notification: { request: { content: { data: kind ? { kind } : {} } } },
  };
}

describe('initMoodCheckinNotificationResponses', () => {
  let remove: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    remove = jest.fn();
    mockAddListener.mockReturnValue({ remove });
    mockGetLast.mockReturnValue(null);
  });

  function listener(): (r: unknown) => void {
    initMoodCheckinNotificationResponses();
    return mockAddListener.mock.calls[0][0];
  }

  it('opens MoodLog when a mood check-in reminder is tapped', () => {
    listener()(
      response(Notifications.DEFAULT_ACTION_IDENTIFIER, 'mood-checkin')
    );
    expect(mockNavigate).toHaveBeenCalledWith('MoodLog');
  });

  it('ignores other notification kinds', () => {
    listener()(response(Notifications.DEFAULT_ACTION_IDENTIFIER, 'water'));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('ignores non-default actions', () => {
    listener()(response('SOME_ACTION', 'mood-checkin'));
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('handles and clears the response that launched the app', () => {
    mockGetLast.mockReturnValue(
      response(Notifications.DEFAULT_ACTION_IDENTIFIER, 'mood-checkin')
    );
    initMoodCheckinNotificationResponses();
    expect(mockNavigate).toHaveBeenCalledWith('MoodLog');
    expect(mockClearLast).toHaveBeenCalled();
  });

  it('returns an unsubscribe function', () => {
    initMoodCheckinNotificationResponses()();
    expect(remove).toHaveBeenCalled();
  });
});
