import React, { useRef } from 'react';
import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import SegmentedControl, { type Segment } from '../SegmentedControl';
import DateRangeSheet, { type DateRangeSheetRef } from '../DateRangeSheet';
import { getAppLocale } from '../../localization';
import { formatShortDate, getTodayDate } from '../../utils/dateUtils';
import {
  COMPARE_SPANS,
  type CompareMode,
  type CompareSpan,
} from '../../utils/compareQuestion';
import { clampCustomRange, type CustomRange } from '../../utils/trendRange';

interface CompareSpanControlProps {
  mode: CompareMode;
  span: CompareSpan;
  custom: CustomRange | null;
  onSpanChange: (span: CompareSpan) => void;
  onCustomChange: (range: CustomRange) => void;
}

/**
 * Orders a picked range and keeps it from ending after today. Day mode also
 * takes the shared 180-day cut; week mode leaves length to `compareWindow`,
 * whose cap is the longer 366 days.
 */
function boundRange(mode: CompareMode, from: string, to: string): CustomRange {
  if (mode === 'day') return clampCustomRange(from, to);
  const today = getTodayDate();
  const [startDate, rawEnd] = from <= to ? [from, to] : [to, from];
  const endDate = rawEnd > today ? today : rawEnd;
  return { startDate: startDate > endDate ? endDate : startDate, endDate };
}

const CompareSpanControl: React.FC<CompareSpanControlProps> = ({
  mode,
  span,
  custom,
  onSpanChange,
  onCustomChange,
}) => {
  const { t } = useTranslation();
  const rangeSheetRef = useRef<DateRangeSheetRef>(null);

  const labels: Record<CompareSpan, string> = {
    '30d': t('compareReport.span.30d', { defaultValue: '30 days' }),
    '60d': t('compareReport.span.60d', { defaultValue: '60 days' }),
    '90d': t('compareReport.span.90d', { defaultValue: '90 days' }),
    '6m': t('compareReport.span.6m', { defaultValue: '6 months' }),
    '1y': t('compareReport.span.1y', { defaultValue: '1 year' }),
    custom: t('ranges.custom', { defaultValue: 'Custom' }),
  };
  const segments: Segment<CompareSpan>[] = COMPARE_SPANS[mode].map((key) => ({
    key,
    label: labels[key],
  }));

  return (
    <View>
      <SegmentedControl<CompareSpan>
        segments={segments}
        activeKey={span}
        onSelect={(key) => {
          if (key === 'custom') rangeSheetRef.current?.present();
          else onSpanChange(key);
        }}
      />
      {span === 'custom' && custom ? (
        <Text
          testID="compare-custom-range-label"
          className="text-text-secondary text-xs text-center mt-1"
        >
          {`${formatShortDate(custom.startDate, getAppLocale())} – ${formatShortDate(custom.endDate, getAppLocale())}`}
        </Text>
      ) : null}
      <DateRangeSheet
        ref={rangeSheetRef}
        title={t('ranges.customTitle', { defaultValue: 'Pick a date range' })}
        confirmLabel={t('ranges.customConfirm', {
          defaultValue: 'Show this range',
        })}
        onConfirm={(from, to) => {
          onCustomChange(boundRange(mode, from, to));
          onSpanChange('custom');
        }}
      />
    </View>
  );
};

export default CompareSpanControl;
