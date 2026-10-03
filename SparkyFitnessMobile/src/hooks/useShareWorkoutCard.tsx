import { useCallback, useRef, type ReactElement } from 'react';
import { View } from 'react-native';
import Toast from 'react-native-toast-message';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type Svg from 'react-native-svg';
import { useTranslation } from 'react-i18next';

import WorkoutShareCard, {
  SHARE_CARD_HEIGHT,
  SHARE_CARD_WIDTH,
} from '../components/WorkoutShareCard';
import { addLog } from '../services/LogService';
import type { WorkoutShareData } from '../utils/workoutShareCard';

function toPngBase64(svg: Svg): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Rendering the share image timed out')),
      8000
    );
    svg.toDataURL((base64) => {
      clearTimeout(timeout);
      resolve(base64);
    });
  });
}

/**
 * Renders a workout summary image off-screen and opens the system share sheet
 * with it. Render `card` anywhere in the screen; call `share()` from a button.
 */
export function useShareWorkoutCard(data: WorkoutShareData | null): {
  card: ReactElement | null;
  share: () => Promise<void>;
} {
  const { t } = useTranslation();
  const svgRef = useRef<Svg>(null);

  const share = useCallback(async () => {
    const svg = svgRef.current;
    if (!svg) return;
    try {
      const base64 = await toPngBase64(svg);
      const file = new File(Paths.cache, `sparky-workout-${Date.now()}.png`);
      file.create();
      file.write(base64, { encoding: 'base64' });
      await Sharing.shareAsync(file.uri, {
        mimeType: 'image/png',
        UTI: 'public.png',
      });
      file.delete();
    } catch (error) {
      addLog(`Failed to share workout card: ${error}`, 'ERROR');
      Toast.show({
        type: 'error',
        text1: t('workoutShare.failed', {
          defaultValue: 'Could not share workout',
        }),
      });
    }
  }, [t]);

  const card = data ? (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: -SHARE_CARD_WIDTH * 2,
        top: 0,
        width: SHARE_CARD_WIDTH,
        height: SHARE_CARD_HEIGHT,
      }}
    >
      <WorkoutShareCard
        ref={svgRef}
        data={data}
        recordsLabel={t('workoutShare.records', {
          defaultValue: 'NEW RECORDS',
        })}
        footer="SparkyFitness"
      />
    </View>
  ) : null;

  return { card, share };
}
