import React from 'react';
import { Text, View } from 'react-native';
import type { CompareResponse } from '@workspace/shared';
import { useTranslation } from 'react-i18next';

import { compareDisplayValue } from '../../constants/compareMetrics';
import { formatLocalizedNumber } from '../../localization';
import { compareValueText, yesNoWording } from '../../utils/compareCopy';
import type { CompareQuestion } from '../../utils/compareQuestion';

interface CompareBarsProps {
  response: CompareResponse;
  question: CompareQuestion;
}

function signedOneDecimal(value: number): string {
  return formatLocalizedNumber(value, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay: 'exceptZero',
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

  const wording = yesNoWording(question, binary.yesKey, t);
  const rows = [
    {
      id: 'yes',
      label: wording.yesLabel,
      mean: yesMean,
      text: compareValueText(outcome, binary.yesMean),
      count: binary.yesCount,
    },
    {
      id: 'no',
      label: wording.noLabel,
      mean: noMean,
      text: compareValueText(outcome, binary.noMean),
      count: binary.noCount,
    },
  ];

  return (
    <View className="bg-surface rounded-xl p-4 my-2 shadow-sm">
      {rows.map((row) => (
        <View key={row.id} className="mb-3">
          <Text className="text-text-secondary text-sm mb-1">{row.label}</Text>
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            className="h-3 rounded-full bg-progress-track overflow-hidden"
          >
            <View
              testID={`compare-bar-${row.id}`}
              className="h-3 rounded-full bg-accent-primary"
              style={{ width: `${widthPercent(row.mean)}%` }}
            />
          </View>
          <Text className="text-text-primary text-sm font-semibold mt-1">
            {wording.nights
              ? t('compareReport.bars.meanAndNights', {
                  defaultValue: '{{mean}} · {{count}} nights',
                  mean: row.text,
                  count: row.count,
                })
              : t('compareReport.bars.meanAndDays', {
                  defaultValue: '{{mean}} · {{count}} days',
                  mean: row.text,
                  count: row.count,
                })}
          </Text>
        </View>
      ))}
      <Text className="text-text-muted text-xs">
        {outcome === 'bedtime'
          ? // A bedtime difference is a span of minutes, not a time of day.
            t('compareReport.bars.diffMinutes', {
              defaultValue: '{{diff}} min vs. your usual',
              diff: formatLocalizedNumber(binary.diff, {
                maximumFractionDigits: 0,
                signDisplay: 'exceptZero',
              }),
            })
          : t('compareReport.bars.diff', {
              defaultValue: '{{diff}} vs. your usual',
              diff: signedOneDecimal(compareDisplayValue(outcome, binary.diff)),
            })}
      </Text>
    </View>
  );
};

export default CompareBars;
