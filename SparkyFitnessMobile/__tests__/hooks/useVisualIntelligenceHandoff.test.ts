import { renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';

jest.mock('../../modules/visual-intelligence', () => ({
  __esModule: true,
  default: { consumePendingImage: jest.fn() },
}));
jest.mock('../../src/utils/dateUtils', () => ({
  getTodayDate: () => '2026-10-02',
}));

import mockModuleImport from '../../modules/visual-intelligence';
import { useVisualIntelligenceHandoff } from '../../src/hooks/useVisualIntelligenceHandoff';

const mockModule = jest.mocked(mockModuleImport!);

const makeNavigator = (ready = true) => ({
  isReady: jest.fn(() => ready),
  navigate: jest.fn(),
});

describe('useVisualIntelligenceHandoff', () => {
  let appStateHandler: ((state: string) => void) | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    appStateHandler = undefined;
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_type, handler) => {
        appStateHandler = handler as (state: string) => void;
        return { remove: jest.fn() } as never;
      });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('opens the photo estimate screen with the handed-over photo', () => {
    mockModule.consumePendingImage.mockReturnValueOnce('/caches/a.jpg');
    const navigator = makeNavigator();
    renderHook(() => useVisualIntelligenceHandoff(navigator));
    expect(navigator.navigate).toHaveBeenCalledWith('FoodPhotoFlow', {
      screen: 'Improve',
      params: { date: '2026-10-02', photo: { uri: 'file:///caches/a.jpg' } },
    });
  });

  it('does nothing when no photo is waiting', () => {
    mockModule.consumePendingImage.mockReturnValue(null);
    const navigator = makeNavigator();
    renderHook(() => useVisualIntelligenceHandoff(navigator));
    expect(navigator.navigate).not.toHaveBeenCalled();
  });

  it('checks again when the app comes to the foreground', () => {
    mockModule.consumePendingImage.mockReturnValue(null);
    const navigator = makeNavigator();
    renderHook(() => useVisualIntelligenceHandoff(navigator));
    mockModule.consumePendingImage.mockReturnValueOnce('/caches/b.jpg');
    appStateHandler?.('background');
    expect(navigator.navigate).not.toHaveBeenCalled();
    appStateHandler?.('active');
    expect(navigator.navigate).toHaveBeenCalledTimes(1);
  });

  it('waits for the navigator on a cold start', () => {
    mockModule.consumePendingImage.mockReturnValueOnce('/caches/c.jpg');
    let ready = false;
    const navigator = {
      isReady: jest.fn(() => ready),
      navigate: jest.fn(),
    };
    renderHook(() => useVisualIntelligenceHandoff(navigator));
    expect(navigator.navigate).not.toHaveBeenCalled();
    ready = true;
    jest.advanceTimersByTime(400);
    expect(navigator.navigate).toHaveBeenCalledTimes(1);
  });

  it('gives up if the navigator never becomes ready', () => {
    mockModule.consumePendingImage.mockReturnValueOnce('/caches/d.jpg');
    const navigator = makeNavigator(false);
    renderHook(() => useVisualIntelligenceHandoff(navigator));
    jest.advanceTimersByTime(20_000);
    expect(navigator.navigate).not.toHaveBeenCalled();
  });
});
