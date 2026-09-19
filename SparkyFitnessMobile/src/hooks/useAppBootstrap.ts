import { useEffect, useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';

import { initializeAppLanguage } from '../localization';
import { getActiveServerConfig } from '../services/storage';
import { addLog } from '../services/LogService';
import { SCREENSHOT_SEED_ENABLED } from '../services/screenshotSeed';

export type BootstrapRoute = 'Tabs' | 'Onboarding' | 'WorkoutDetail';

export interface AppBootstrapResult {
  initialRoute: BootstrapRoute | null;
  linkingEnabled: boolean;
  setLinkingEnabled: (value: boolean) => void;
}

export function useAppBootstrap(): AppBootstrapResult {
  const [initialRoute, setInitialRoute] = useState<BootstrapRoute | null>(null);
  const [linkingEnabled, setLinkingEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const determine = async (): Promise<void> => {
      // Language initialization and route selection are independent failure
      // domains: a broken locale must never change the route, and a missing
      // server config must never block language startup.
      try {
        await initializeAppLanguage();
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        addLog(`[App] Failed to initialize app language: ${message}`, 'ERROR');
      }

      if (cancelled) return;

      // CI screenshot build: land straight on the workout detail screen with
      // the seeded session (see `screenshotSeed.ts`), skipping the
      // server-config check that would otherwise send a runner with no
      // account to Onboarding. Linking stays off — the deep-link gate exists
      // so a widget link cannot bypass first-run onboarding, and this route
      // is not onboarding-complete.
      if (SCREENSHOT_SEED_ENABLED) {
        setInitialRoute('WorkoutDetail');
        setLinkingEnabled(false);
      } else {
        try {
          const config = await getActiveServerConfig();
          if (cancelled) return;

          const route: BootstrapRoute = config ? 'Tabs' : 'Onboarding';
          setInitialRoute(route);
          setLinkingEnabled(route === 'Tabs');
        } catch (error) {
          if (cancelled) return;
          const message =
            error instanceof Error ? error.message : String(error);
          addLog(
            `[App] Failed to load active server config on startup: ${message}`,
            'ERROR'
          );
          setInitialRoute('Onboarding');
        }
      }

      // Splash hiding is the last step and never rejects `determine`: a failure
      // is logged and must not change the route.
      if (cancelled) return;
      try {
        await SplashScreen.hideAsync();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        addLog(`[App] Failed to hide splash screen: ${message}`, 'ERROR');
      }
    };

    // determine() handles every expected failure internally, so the floating
    // promise cannot reject.
    void determine();

    return () => {
      cancelled = true;
    };
  }, []);

  return { initialRoute, linkingEnabled, setLinkingEnabled };
}
