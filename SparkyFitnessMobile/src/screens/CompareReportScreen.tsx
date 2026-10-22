import React, { useContext, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { NavigationContext } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { useCSSVariable } from 'uniwind';

import { useScreenHeader } from '../hooks/useScreenHeader';
import { useCompare } from '../hooks/useCompare';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import ReportScreenLayout from '../components/reports/ReportScreenLayout';
import CompareSentence from '../components/compare/CompareSentence';
import CompareSpanControl from '../components/compare/CompareSpanControl';
import CompareStartState from '../components/compare/CompareStartState';
import CompareAnswerCard from '../components/compare/CompareAnswerCard';
import CompareChart from '../components/compare/CompareChart';
import CompareChecksCard from '../components/compare/CompareChecksCard';
import { getTodayDate } from '../utils/dateUtils';
import {
  DEFAULT_COMPARE_SPAN,
  compareWindow,
  isAskable,
  timingOf,
  type CompareMode,
  type CompareQuestion,
  type CompareSpan,
} from '../utils/compareQuestion';
import type { CustomRange } from '../utils/trendRange';
import type { RootStackScreenProps } from '../types/navigation';

type CompareReportScreenProps = RootStackScreenProps<'CompareReport'>;

const questionKey = (q: CompareQuestion) => `${q.a}|${q.b}|${q.choice}`;

const CompareReportScreen: React.FC<CompareReportScreenProps> = () => {
  const { t } = useTranslation();
  const accent = useCSSVariable('--color-accent-primary') as string;
  const header = useScreenHeader({
    title: t('compareReport.title', { defaultValue: 'Compare' }),
    left: { kind: 'back' },
  });

  const [question, setQuestion] = useState<Partial<CompareQuestion>>({});
  // Each mode remembers its own span, so flipping day/week/day keeps the pick.
  const [spans, setSpans] =
    useState<Record<CompareMode, CompareSpan>>(DEFAULT_COMPARE_SPAN);
  const [customs, setCustoms] = useState<
    Record<CompareMode, CustomRange | null>
  >({ day: null, week: null });
  const [today, setToday] = useState(getTodayDate);
  const navigation = useContext(NavigationContext);
  useEffect(() => {
    if (!navigation) return;
    return navigation.addListener('focus', () => {
      const now = getTodayDate();
      setToday((current) => (current === now ? current : now));
    });
  }, [navigation]);

  const mode: CompareMode = question.choice
    ? timingOf(question.choice).mode
    : 'day';
  const span = spans[mode];
  const window = compareWindow(span, mode, today, customs[mode]);

  const recent = useAppPreferencesStore((s) => s.compareRecentQuestions);
  const addRecent = useAppPreferencesStore((s) => s.addCompareRecentQuestion);

  const { data, isLoading, isError, serverTooOld, refetch } = useCompare(
    question,
    window
  );

  const askable = isAskable(question);
  const lastRecorded = useRef<string | null>(null);
  useEffect(() => {
    if (!data || !isAskable(question)) return;
    const key = questionKey(question);
    if (lastRecorded.current === key) return;
    lastRecorded.current = key;
    addRecent(question);
  }, [data, question, addRecent]);

  const notice = (text: string, action?: React.ReactNode) => (
    <View className="bg-surface rounded-xl p-4 my-2 shadow-sm items-center">
      <Text className="text-text-secondary text-sm text-center">{text}</Text>
      {action}
    </View>
  );

  const renderAnswer = (q: CompareQuestion) => {
    if (serverTooOld) {
      return notice(
        t('compareReport.screen.tooOld', {
          defaultValue:
            'Compare needs a newer SparkyFitness server. Update your server to use it.',
        })
      );
    }
    // A failed background refresh keeps the answer already on screen.
    if (isError && !data) {
      return notice(
        t('compareReport.screen.loadFailed', {
          defaultValue: "Couldn't load this comparison.",
        }),
        <TouchableOpacity
          onPress={refetch}
          accessibilityRole="button"
          className="mt-3 px-4 py-2 rounded-lg bg-raised"
        >
          <Text className="text-accent-primary text-sm font-semibold">
            {t('compareReport.screen.retry', { defaultValue: 'Retry' })}
          </Text>
        </TouchableOpacity>
      );
    }
    if (isLoading || !data) {
      return (
        <View className="py-8 items-center" testID="compare-loading">
          <ActivityIndicator color={accent} />
        </View>
      );
    }
    return (
      <>
        <CompareAnswerCard response={data} question={q} span={span} />
        <CompareChart response={data} question={q} />
        <CompareChecksCard result={data.result} question={q} mode={mode} />
      </>
    );
  };

  return (
    <ReportScreenLayout header={header}>
      <CompareSentence question={question} onChange={setQuestion} />
      <View className="mt-3">
        <CompareSpanControl
          mode={mode}
          span={span}
          custom={customs[mode]}
          onSpanChange={(next) =>
            setSpans((current) => ({ ...current, [mode]: next }))
          }
          onCustomChange={(range) =>
            setCustoms((current) => ({ ...current, [mode]: range }))
          }
        />
      </View>
      {askable ? (
        renderAnswer(question)
      ) : (
        <View className="mt-4">
          <CompareStartState recent={recent} onPick={setQuestion} />
        </View>
      )}
    </ReportScreenLayout>
  );
};

export default CompareReportScreen;
