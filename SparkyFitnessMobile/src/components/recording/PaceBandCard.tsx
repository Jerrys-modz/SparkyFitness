import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { PACE_BAND_MIN_WIDTH_SECONDS } from '@workspace/shared';
import Icon from '../Icon';
import { formatClock } from '../../utils/gpsRecording';
import RecordingSwitchRow from './RecordingSwitchRow';

/** A pace band in seconds per display unit (km or mile). */
export interface PaceBandChoice {
  fastest: number;
  slowest: number;
}

/** How far one tap moves an edge, in seconds. */
const STEP_SECONDS = 5;
/** Shown paces are kept inside this many seconds per unit. */
const FLOOR_SECONDS = 150;
const CEILING_SECONDS = 1200;

interface Props {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  band: PaceBandChoice;
  onBandChange: (band: PaceBandChoice) => void;
  unit: 'km' | 'miles';
}

/**
 * Before Start: a pace to stay between. The phone buzzes, and speaks with
 * voice cues on, once the pace has been outside it for a few seconds.
 */
const PaceBandCard: React.FC<Props> = ({
  enabled,
  onEnabledChange,
  band,
  onBandChange,
  unit,
}) => {
  const { t } = useTranslation();
  const unitLabel = unit === 'miles' ? '/mi' : '/km';

  const move = (edge: 'fastest' | 'slowest', delta: number) => {
    const next = { ...band, [edge]: band[edge] + delta };
    if (
      next.fastest < FLOOR_SECONDS ||
      next.slowest > CEILING_SECONDS ||
      next.slowest - next.fastest < PACE_BAND_MIN_WIDTH_SECONDS * 1.61
    ) {
      return;
    }
    onBandChange(next);
  };

  const row = (edge: 'fastest' | 'slowest', label: string) => (
    <View className="flex-row items-center justify-between mt-3">
      <Text className="text-text-secondary text-sm">{label}</Text>
      <View className="flex-row items-center">
        <TouchableOpacity
          testID={`pace-${edge}-down`}
          accessibilityRole="button"
          accessibilityLabel={t('recordActivity.paceBand.faster', {
            defaultValue: '{{edge}} 5 seconds faster',
            edge: label,
          })}
          className="w-9 h-9 items-center justify-center rounded-full bg-raised"
          onPress={() => move(edge, -STEP_SECONDS)}
        >
          <Icon name="remove" size={18} />
        </TouchableOpacity>
        <Text
          testID={`pace-${edge}-value`}
          className="text-text-primary text-base font-semibold w-24 text-center"
        >
          {formatClock(band[edge])}
          {unitLabel}
        </Text>
        <TouchableOpacity
          testID={`pace-${edge}-up`}
          accessibilityRole="button"
          accessibilityLabel={t('recordActivity.paceBand.slower', {
            defaultValue: '{{edge}} 5 seconds slower',
            edge: label,
          })}
          className="w-9 h-9 items-center justify-center rounded-full bg-raised"
          onPress={() => move(edge, STEP_SECONDS)}
        >
          <Icon name="add" size={18} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View>
      <RecordingSwitchRow
        testID="pace-alert-switch"
        title={t('recordActivity.paceBand.title', {
          defaultValue: 'Pace alert',
        })}
        description={t('recordActivity.paceBand.description', {
          defaultValue:
            'Buzzes, and speaks with voice cues on, when you stay outside your pace range.',
        })}
        value={enabled}
        onValueChange={onEnabledChange}
      />
      {enabled ? (
        <View className="bg-surface rounded-xl p-4 mt-2">
          {row(
            'fastest',
            t('recordActivity.paceBand.fastest', { defaultValue: 'Fastest' })
          )}
          {row(
            'slowest',
            t('recordActivity.paceBand.slowest', { defaultValue: 'Slowest' })
          )}
        </View>
      ) : null}
    </View>
  );
};

export default PaceBandCard;
