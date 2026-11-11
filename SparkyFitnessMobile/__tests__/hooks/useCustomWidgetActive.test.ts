jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: { extra: { iosAppGroup: 'group.test.sparkyfitness' } },
  },
}));

const mockGet = jest.fn();
jest.mock('@bacons/apple-targets', () => ({
  ExtensionStorage: class {
    get(key: string) {
      return mockGet(key);
    }
  },
}));

import { act, renderHook } from '@testing-library/react-native';
import { AppState, Platform } from 'react-native';

import {
  CUSTOM_WIDGET_ACTIVE_KEY,
  CUSTOM_WIDGET_ACTIVE_WINDOW_SECONDS,
  readCustomWidgetActive,
  useCustomWidgetActive,
} from '../../src/hooks/useCustomWidgetActive';

const NOW = 1_800_000_000;

const setPlatform = (os: string) =>
  Object.defineProperty(Platform, 'OS', { get: () => os, configurable: true });

describe('custom widget activity stamp', () => {
  beforeEach(() => {
    mockGet.mockReset();
    setPlatform('ios');
  });

  it('is active when the widget refreshed recently', () => {
    mockGet.mockReturnValue(String(NOW - 60));
    expect(readCustomWidgetActive(NOW)).toBe(true);
    expect(mockGet).toHaveBeenCalledWith(CUSTOM_WIDGET_ACTIVE_KEY);
  });

  it('is not active once the stamp is older than the window', () => {
    mockGet.mockReturnValue(
      String(NOW - CUSTOM_WIDGET_ACTIVE_WINDOW_SECONDS - 1)
    );
    expect(readCustomWidgetActive(NOW)).toBe(false);
  });

  it.each([[undefined], [null], ['abc'], ['0']])(
    'is not active with no usable stamp (%s)',
    (value) => {
      mockGet.mockReturnValue(value);
      expect(readCustomWidgetActive(NOW)).toBe(false);
    }
  );

  it('is not active when the storage throws', () => {
    mockGet.mockImplementation(() => {
      throw new Error('no storage');
    });
    expect(readCustomWidgetActive(NOW)).toBe(false);
  });

  it('is never active off iOS', () => {
    setPlatform('android');
    mockGet.mockReturnValue(String(NOW));
    expect(readCustomWidgetActive(NOW)).toBe(false);
  });

  it('reads again when the app returns to the foreground', () => {
    let handler: ((state: string) => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((
      _type: string,
      listener: (state: string) => void
    ) => {
      handler = listener;
      return { remove: jest.fn() };
    }) as never);
    mockGet.mockReturnValue(undefined);

    const { result } = renderHook(() => useCustomWidgetActive());
    expect(result.current).toBe(false);

    mockGet.mockReturnValue(String(Math.floor(Date.now() / 1000)));
    act(() => handler?.('active'));
    expect(result.current).toBe(true);
  });
});
