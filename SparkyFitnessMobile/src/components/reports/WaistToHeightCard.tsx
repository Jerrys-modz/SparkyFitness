import React from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  WAIST_TO_HEIGHT_BANDS,
  type WaistToHeightBand,
} from '@workspace/shared';

import { useWaistToHeight } from '../../hooks/useWeightProgress';
import { formatLocalizedNumber, getAppLocale } from '../../localization';
import { formatShortDate } from '../../utils/dateUtils';
import { lengthFromCm } from '../../utils/unitConversions';

/** Points the small trend shows, newest last. */
const TREND_POINTS = 12;

const BAND_CLASS: Record<WaistToHeightBand, { bg: string; text: string }> = {
  lower: { bg: 'bg-bg-success', text: 'text-text-success' },
  increased: { bg: 'bg-bg-warning', text: 'text-text-warning' },
  high: { bg: 'bg-bg-danger', text: 'text-text-danger' },
};

export const waistBandLabel = (band: WaistToHeightBand, t: TFunction) =>
  band === 'lower'
    ? t('waistToHeight.bandLower', { defaultValue: 'Lower risk' })
    : band === 'increased'
      ? t('waistToHeight.bandIncreased', { defaultValue: 'Increased risk' })
      : t('waistToHeight.bandHigh', { defaultValue: 'High risk' });

const ratioText = (ratio: number) =>
  formatLocalizedNumber(ratio, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/** Waist-to-height ratio from the latest waist and height, with reference bands. */
const WaistToHeightCard: React.FC<{ lengthUnit: 'cm' | 'inches' }> = ({
  lengthUnit,
}) => {
  const { t } = useTranslation();
  const { series, isLoading } = useWaistToHeight();
  const latest = series[series.length - 1];
  if (isLoading || !latest) return null;

  const length = (cm: number) =>
    `${formatLocalizedNumber(lengthFromCm(cm, lengthUnit), {
      maximumFractionDigits: 1,
    })} ${lengthUnit === 'cm' ? 'cm' : 'in'}`;
  const trend = series.slice(-TREND_POINTS);
  const min = Math.min(0.4, ...trend.map((p) => p.ratio));
  const max = Math.max(0.65, ...trend.map((p) => p.ratio));
  const heightOf = (ratio: number) => 8 + ((ratio - min) / (max - min)) * 56;

  return (
    <View
      className="bg-surface rounded-xl p-4 my-2 shadow-sm"
      testID="waist-to-height-card"
    >
      <Text className="text-text-primary text-lg font-semibold mb-1">
        {t('waistToHeight.title', { defaultValue: 'Waist-to-height ratio' })}
      </Text>
      <View className="flex-row items-center">
        <Text
          className="text-text-primary text-3xl font-semibold mr-3"
          testID="waist-to-height-ratio"
        >
          {ratioText(latest.ratio)}
        </Text>
        <View
          className={`rounded-full px-2 py-0.5 ${BAND_CLASS[latest.band].bg}`}
        >
          <Text className={`text-xs ${BAND_CLASS[latest.band].text}`}>
            {waistBandLabel(latest.band, t)}
          </Text>
        </View>
      </View>
      <Text className="text-text-muted text-xs mt-1">
        {t('waistToHeight.from', {
          defaultValue: 'Waist {{waist}} on {{date}}, height {{height}}',
          waist: length(latest.waist),
          height: length(latest.height),
          date: formatShortDate(latest.date, getAppLocale()),
        })}
      </Text>
      <View className="flex-row flex-wrap mt-2 -m-0.5">
        {WAIST_TO_HEIGHT_BANDS.map((b) => (
          <View
            key={b.band}
            className={`rounded-md px-2 py-1 m-0.5 ${BAND_CLASS[b.band].bg}`}
          >
            <Text className={`text-xs ${BAND_CLASS[b.band].text}`}>
              {b.band === 'lower'
                ? `< ${ratioText(b.max)}`
                : b.band === 'increased'
                  ? `${ratioText(b.min)}-${ratioText(b.max - 0.01)}`
                  : `≥ ${ratioText(b.min)}`}
              {': '}
              {waistBandLabel(b.band, t)}
            </Text>
          </View>
        ))}
      </View>
      {trend.length > 1 ? (
        <View
          className="flex-row items-end mt-3 h-16"
          testID="waist-to-height-trend"
          accessible
          accessibilityLabel={t('waistToHeight.trendLabel', {
            defaultValue: 'Ratio from {{first}} to {{last}}',
            first: ratioText(trend[0]!.ratio),
            last: ratioText(latest.ratio),
          })}
        >
          {trend.map((p) => (
            <View
              key={p.date}
              className={`flex-1 mx-0.5 rounded-t ${BAND_CLASS[p.band].bg}`}
              style={{ height: heightOf(p.ratio) }}
            />
          ))}
        </View>
      ) : null}
      <Text className="text-text-muted text-xs mt-2">
        {t('waistToHeight.note', {
          defaultValue:
            'Screening bands for adults (keep your waist under half your height). Not a diagnosis; they may not fit children, pregnancy or very muscular builds.',
        })}
      </Text>
    </View>
  );
};

export default WaistToHeightCard;
