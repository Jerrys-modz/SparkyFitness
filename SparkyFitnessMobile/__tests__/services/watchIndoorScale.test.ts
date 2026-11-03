import AsyncStorage from '@react-native-async-storage/async-storage';
import { learnWatchIndoorScale } from '../../src/services/watchIndoorScale';
import { addLog } from '../../src/services/LogService';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(() => Promise.resolve()),
  },
}));
jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(),
}));

const mockedGetItem = jest.mocked(AsyncStorage.getItem);

beforeEach(() => {
  jest.clearAllMocks();
  mockedGetItem.mockResolvedValue(null);
});

test('logs the inputs of a correction it learned from', async () => {
  mockedGetItem.mockResolvedValue(
    JSON.stringify({ run: { scale: 1.1, samples: 2 } })
  );
  await learnWatchIndoorScale('run', 1.1, 3300, 2736, 'watch');
  expect(addLog).toHaveBeenCalledWith(
    expect.stringContaining('Indoor run distance factor now'),
    'INFO',
    [
      'source: watch',
      'factor applied on the watch: 1.100',
      'watch showed: 3300 m',
      'watch raw (shown / applied): 3000 m',
      'entered: 2736 m',
      'factor before: 1.100 (2 corrections)',
    ]
  );
});

test('logs a correction that taught nothing, with its source', async () => {
  await learnWatchIndoorScale('run', 1, 3000, 3010, 'phone');
  expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  expect(addLog).toHaveBeenCalledWith(
    expect.stringContaining('taught nothing'),
    'INFO',
    expect.arrayContaining(['source: phone', 'factor before: none'])
  );
});

test('ignores kinds other than walk and run', async () => {
  await learnWatchIndoorScale('ride', 1, 3000, 2000);
  expect(addLog).not.toHaveBeenCalled();
});
