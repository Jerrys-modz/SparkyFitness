import * as Notifications from 'expo-notifications';
import Toast from 'react-native-toast-message';
import { initFuelingNotificationResponses } from '../../src/services/fuelingNotificationHandler';
import { logFuelingPortion } from '../../src/services/fuelingLog';
import { addNotificationResponseListener } from '../../src/services/notifications';

jest.mock('../../src/services/fuelingLog', () => ({
  logFuelingPortion: jest.fn(),
}));

jest.mock('../../src/services/notifications', () => ({
  addNotificationResponseListener: jest.fn(),
  FUELING_LOG_ACTION: 'fueling-log',
  FUELING_REMINDER_KIND: 'fueling',
}));

jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: { show: jest.fn() },
}));

const mockLog = logFuelingPortion as jest.MockedFunction<
  typeof logFuelingPortion
>;
const mockAddListener = addNotificationResponseListener as jest.Mock;
const mockLast = Notifications.getLastNotificationResponse as jest.Mock;

let listener: (response: any) => void;
let counter = 0;

const response = (overrides: Record<string, unknown> = {}, data = {}) => ({
  actionIdentifier: 'fueling-log',
  notification: {
    date: 1000,
    request: {
      identifier: `n-${++counter}`,
      content: {
        data: {
          kind: 'fueling',
          portionGrams: '25',
          productName: 'Energy gel',
          ...data,
        },
      },
    },
  },
  ...overrides,
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  jest.clearAllMocks();
  mockLog.mockResolvedValue(undefined);
  mockLast.mockReturnValue(null);
  mockAddListener.mockImplementation((fn) => {
    listener = fn;
    return { remove: jest.fn() };
  });
  initFuelingNotificationResponses();
});

describe('initFuelingNotificationResponses', () => {
  it('logs the portion when Log it is pressed', async () => {
    listener(response());
    await flush();

    expect(mockLog).toHaveBeenCalledWith({
      productName: 'Energy gel',
      portionGrams: 25,
    });
    expect((Toast.show as jest.Mock).mock.calls[0][0]).toMatchObject({
      type: 'success',
      text1: 'Logged 25 g of carbs.',
    });
  });

  it('only opens the app on a plain tap', () => {
    listener(
      response({ actionIdentifier: Notifications.DEFAULT_ACTION_IDENTIFIER })
    );
    expect(mockLog).not.toHaveBeenCalled();
  });

  it('ignores other kinds of notification', () => {
    listener(response({}, { kind: 'mood-checkin' }));
    expect(mockLog).not.toHaveBeenCalled();
  });

  it('does not log twice for the same delivery', async () => {
    const r = response();
    listener(r);
    listener(r);
    await flush();
    expect(mockLog).toHaveBeenCalledTimes(1);
  });

  it('says so and allows another try when the log fails', async () => {
    mockLog.mockRejectedValueOnce(new Error('offline'));
    const r = response();
    listener(r);
    await flush();
    expect((Toast.show as jest.Mock).mock.calls[0][0]).toMatchObject({
      type: 'error',
    });

    listener(r);
    await flush();
    expect(mockLog).toHaveBeenCalledTimes(2);
  });

  it('ignores a reminder whose data is unusable', () => {
    listener(response({}, { portionGrams: 'abc' }));
    expect(mockLog).not.toHaveBeenCalled();
  });

  it('finishes the press that launched the app', async () => {
    mockLast.mockReturnValue(response());
    initFuelingNotificationResponses();
    await flush();
    expect(mockLog).toHaveBeenCalledTimes(1);
    expect(Notifications.clearLastNotificationResponse).toHaveBeenCalled();
  });
});
