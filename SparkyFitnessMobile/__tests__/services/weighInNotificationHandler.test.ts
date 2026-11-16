import * as Notifications from 'expo-notifications';

import { initWeighInNotificationResponses } from '../../src/services/weighInNotificationHandler';
import { addNotificationResponseListener } from '../../src/services/notifications';
import { navigationRef } from '../../src/components/ActiveWorkoutBar';

jest.mock('../../src/services/notifications', () => ({
  addNotificationResponseListener: jest.fn(),
}));

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  navigationRef: { isReady: jest.fn(() => true), navigate: jest.fn() },
}));

jest.mock('../../src/hooks/useQuickActions', () => ({
  whenNavigationReady: (run: () => void) => run(),
}));

jest.mock('../../src/utils/dateUtils', () => ({
  getTodayDate: () => '2026-11-16',
}));

const mockAddListener = addNotificationResponseListener as jest.Mock;
const mockNavigate = navigationRef.navigate as unknown as jest.Mock;
const mockGetLast = Notifications.getLastNotificationResponse as jest.Mock;

function response(kind: string, actionIdentifier: string, id = 'weigh_in_0') {
  return {
    actionIdentifier,
    notification: {
      date: 1000,
      request: { identifier: id, content: { data: { kind } } },
    },
  };
}

describe('initWeighInNotificationResponses', () => {
  let listener: (r: ReturnType<typeof response>) => boolean;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetLast.mockReturnValue(null);
    mockAddListener.mockImplementation((cb) => {
      listener = cb;
      return { remove: jest.fn() };
    });
  });

  it('opens the measurements step on today with the weight focused', () => {
    initWeighInNotificationResponses();
    listener(response('weigh-in', Notifications.DEFAULT_ACTION_IDENTIFIER));
    expect(mockNavigate).toHaveBeenCalledWith('MeasurementsAdd', {
      date: '2026-11-16',
      focusWeight: true,
    });
  });

  it('ignores other kinds and repeated deliveries', () => {
    initWeighInNotificationResponses();
    listener(response('mood-checkin', Notifications.DEFAULT_ACTION_IDENTIFIER));
    expect(mockNavigate).not.toHaveBeenCalled();
    listener(response('weigh-in', Notifications.DEFAULT_ACTION_IDENTIFIER));
    listener(response('weigh-in', Notifications.DEFAULT_ACTION_IDENTIFIER));
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });

  it('handles the tap that launched the app', () => {
    mockGetLast.mockReturnValue(
      response('weigh-in', Notifications.DEFAULT_ACTION_IDENTIFIER)
    );
    initWeighInNotificationResponses();
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(Notifications.clearLastNotificationResponse).toHaveBeenCalled();
  });
});
