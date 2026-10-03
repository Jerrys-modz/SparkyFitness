import { useEffect } from 'react';
import { AppState } from 'react-native';
import VisualIntelligenceModule from '../../modules/visual-intelligence';
import { takeVisualIntelligencePhoto } from '../services/visualIntelligence';
import { getTodayDate } from '../utils/dateUtils';

/** The part of the root navigation ref this hook uses. */
export interface PhotoFlowNavigator {
  isReady: () => boolean;
  navigate: (
    screen: 'FoodPhotoFlow',
    params: {
      screen: 'Improve';
      params: { date: string; photo: { uri: string } };
    }
  ) => void;
}

// The root navigator is not ready until the app has finished starting, which
// on a cold start comes after the photo is already waiting.
const RETRY_MS = 300;
const GIVE_UP_MS = 15_000;

/**
 * Opens the meal photo estimate screen with the photo a Visual Intelligence
 * result handed to the app. Checked when the app mounts and each time it comes
 * to the foreground, which is when tapping the result opens it.
 */
export function useVisualIntelligenceHandoff(
  navigator: PhotoFlowNavigator
): void {
  useEffect(() => {
    if (VisualIntelligenceModule == null) return;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const open = (photo: { uri: string }, waitedMs = 0) => {
      if (navigator.isReady()) {
        navigator.navigate('FoodPhotoFlow', {
          screen: 'Improve',
          params: { date: getTodayDate(), photo },
        });
        return;
      }
      if (waitedMs >= GIVE_UP_MS) return;
      retry = setTimeout(() => open(photo, waitedMs + RETRY_MS), RETRY_MS);
    };

    const check = () => {
      const photo = takeVisualIntelligencePhoto();
      if (photo) open(photo);
    };

    check();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => {
      subscription.remove();
      if (retry) clearTimeout(retry);
    };
  }, [navigator]);
}
