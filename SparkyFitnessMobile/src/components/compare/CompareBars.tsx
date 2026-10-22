import React from 'react';
import { Text, View } from 'react-native';
import type { CompareResponse } from '@workspace/shared';
import { useTranslation } from 'react-i18next';

import { compareDisplayValue } from '../../constants/compareMetrics';
import { formatLocalizedNumber } from '../../localization';
import { metricNoun, metricPhrase } from '../../utils/compareCopy';
import type { CompareQuestion } from '../../utils/compareQuestion';

interface CompareBarsProps {
  response: CompareResponse;
  question: CompareQuestion;
}

function oneDecimal(value: number): string {
  return formatLocalizedNumber(value, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

const CompareBars: React.FC<CompareBarsProps> = ({ response, question }) => {
  const { t } = useTranslation();
  const binary = response.result.binary;
  if (!binary) return null;

  const outcome = binary.yesKey === question.a ? question.b : question.a;
  const yesMean = compareDisplayValue(outcome, binary.yesMean);
  const noMean = compareDisplayValue(outcome, binary.noMean);
  const largest = Math.max(Math.abs(yesMean), Math.abs(noMean));
  const widthPercent = (value: number) =>
    largest > 0 ? Math.round((Math.abs(value) / largest) * 100) : 0;

  const rows = [
    {
      id: 'yes',
      label: t('compareReport.bars.yesDays', {
        defaultValue: 'Days you {{yes}}',
        yes: metricPhrase(binary.yesKey, t),
      }),
      mean: yesMean,
      count: binary.yesCount,
    },
    {
      id: 'no',
      label: t('compareReport.bars.noDays', {
        defaultValue: 'Days without {{yesNoun}}',
        yesNoun: metricNoun(binary.yesKey, t),
      }),
      mean: noMean,
      count: binary.noCount,
    },
  ];

  return (
    <View className="bg-surface rounded-xl p-4 my-2 shadow-sm">
      {rows.map((row) => (
        <View key={row.id} className="mb-3">
          <Text className="text-text-secondary text-sm mb-1">{row.label}</Text>
          <View className="h-3 rounded-full bg-progress-track overflow-hidden">
            <View
              testID={`compare-bar-${row.id}`}
              className="h-3 rounded-full bg-accent-primary"
              style={{ width: `${widthPercent(row.mean)}%` }}
            />
          </View>
          <Text className="text-text-primary text-sm font-semibold mt-1">
            {t('compareReport.bars.meanAndDays', {
              defaultValue: '{{mean}} · {{count}} days',
              mean: oneDecimal(row.mean),
              count: row.count,
            })}
          </Text>
        </View>
      ))}
      <Text className="text-text-muted text-xs">
        {t('compareReport.bars.diff', {
          defaultValue: '{{diff}} vs. your usual',
          diff: oneDecimal(compareDisplayValue(outcome, binary.diff)),
        })}
      </Text>
    </View>
  );
};

export default CompareBars;
