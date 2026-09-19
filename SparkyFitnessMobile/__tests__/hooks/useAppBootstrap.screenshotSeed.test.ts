import { renderHook, waitFor } from '@testing-library/react-native';

/**
 * The screenshot-seed branch of `useAppBootstrap`, in its own file because the
 * flag is a module constant read at import time (Expo inlines
 * `EXPO_PUBLIC_SCREENSHOT_SEED` at bundle time), so it cannot be toggled
 * per-test inside the main suite.
 *
 * Worth testing despite only ever being true in CI: a wrong branch here boots
 * the shipped app to the wrong screen, and the flag being off is exactly the
 * condition under which nobody would notice it had broken.
 */
jest.mock('../../src/services/screenshotSeed', () => ({
  SCREENSHOT_SEED_ENABLED: true,
  SCREENSHOT_SESSION: { type: 'preset', id: 'screenshot-session' },
}));

jest.mock('../../src/localization', () => ({
  initializeAppLanguage: jest.fn(() => Promise.resolve('en')),
}));

jest.mock('../../src/services/storage', () => ({
  getActiveServerConfig: jest.fn(() => Promise.resolve(null)),
}));

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(() => Promise.resolve()),
  hideAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../src/services/LogService', () => ({
  addLog: jest.fn(() => Promise.resolve()),
}));

import { useAppBootstrap } from '../../src/hooks/useAppBootstrap';
import { getActiveServerConfig } from '../../src/services/storage';

const mockGetActiveServerConfig = getActiveServerConfig as jest.MockedFunction<
  typeof getActiveServerConfig
>;

describe('useAppBootstrap with the screenshot seed enabled', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lands on WorkoutDetail without consulting the server config', async () => {
    const { result } = renderHook(() => useAppBootstrap());

    await waitFor(() =>
      expect(result.current.initialRoute).toBe('WorkoutDetail')
    );
    // A runner has no account, so the usual lookup would route to Onboarding.
    // Short-circuiting before it is what makes the screenshot possible.
    expect(mockGetActiveServerConfig).not.toHaveBeenCalled();
  });

  it('leaves deep linking disabled', async () => {
    const { result } = renderHook(() => useAppBootstrap());

    await waitFor(() =>
      expect(result.current.initialRoute).toBe('WorkoutDetail')
    );
    // The linking gate exists so a widget link cannot bypass first-run
    // onboarding; this route has not completed onboarding either.
    expect(result.current.linkingEnabled).toBe(false);
  });
});
