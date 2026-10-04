import React from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import CaffeineDetailCard from '../components/CaffeineDetailCard';
import { useCaffeineKinetics } from '../hooks/useCaffeineKinetics';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useTranslation } from 'react-i18next';
import type { RootStackScreenProps } from '../types/navigation';

type CaffeineDetailScreenProps = RootStackScreenProps<'CaffeineDetail'>;

/**
 * The dashboard's Active Caffeine card, opened up: the full curve with the
 * bedtime, cutoff and sleep-impact detail, and the recent doses behind it.
 */
const CaffeineDetailScreen: React.FC<CaffeineDetailScreenProps> = ({
  route,
}) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();
  const { kinetics, nowMs, isLoading } = useCaffeineKinetics(route.params.date);

  const header = useScreenHeader({
    title: t('screens.caffeine', { defaultValue: 'Caffeine' }),
    left: { kind: 'back' },
  });

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
        contentInsetAdjustmentBehavior={
          usesNativeHeader ? 'automatic' : 'never'
        }
      >
        <CaffeineDetailCard
          kinetics={kinetics}
          nowMs={nowMs}
          isLoading={isLoading}
        />
      </ScrollView>
    </View>
  );
};

export default CaffeineDetailScreen;
