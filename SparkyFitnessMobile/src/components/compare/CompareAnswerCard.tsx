import React from 'react';
import { Text, View } from 'react-native';
import type { CompareResponse } from '@workspace/shared';
import { useTranslation } from 'react-i18next';

import { statsLine, verdictCopy } from '../../utils/compareCopy';
import {
  timingOf,
  type CompareQuestion,
  type CompareSpan,
} from '../../utils/compareQuestion';

interface CompareAnswerCardProps {
  response: CompareResponse;
  question: CompareQuestion;
  span: CompareSpan;
}

const CompareAnswerCard: React.FC<CompareAnswerCardProps> = ({
  response,
  question,
  span,
}) => {
  const { t } = useTranslation();
  const { headline, detail } = verdictCopy(response, question, span, t);
  const { result } = response;
  const yesKey = result.binary?.yesKey;
  const outcome =
    yesKey === undefined
      ? undefined
      : yesKey === question.a
        ? question.b
        : question.a;
  const stats = statsLine(result, timingOf(question.choice).mode, t, outcome);

  return (
    <View className="bg-surface rounded-xl p-4 my-2 shadow-sm">
      <Text className="text-text-primary text-2xl font-bold">{headline}</Text>
      <Text className="text-text-secondary text-base mt-2">{detail}</Text>
      {stats ? (
        <Text className="text-text-muted text-xs mt-3">{stats}</Text>
      ) : null}
    </View>
  );
};

export default CompareAnswerCard;
