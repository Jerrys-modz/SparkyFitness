import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useCSSVariable } from 'uniwind';
import {
  runSensorSeries,
  summarizeRunningDynamics,
  type RunSensorPoint,
} from '@workspace/shared';
import { formatLocalizedNumber } from '../../localization';
import RunSeriesChart from './RunSeriesChart';

interface RunningDynamicsCardProps {
  points: readonly RunSensorPoint[];
}

/**
 * Ground contact time, vertical oscillation, stride length and the vertical
 * ratio worked out from them, with a chart of ground contact over the run.
 * Renders nothing when the run carries none of them.
 */
const RunningDynamicsCard: React.FC<RunningDynamicsCardProps> = ({
  points,
}) => {
  const { t } = useTranslation();
  const [accent] = useCSSVariable(['--color-accent-primary']) as [string];
  const summary = useMemo(() => summarizeRunningDynamics(points), [points]);
  const gctSeries = useMemo(() => runSensorSeries(points, 'gct'), [points]);

  if (!summary) return null;

  const rows: { key: string; label: string; value: string }[] = [];
  if (summary.groundContactMs !== null) {
    rows.push({
      key: 'gct',
      label: t('exerciseStatistics.runDynamics.groundContact', {
        defaultValue: 'Ground contact time',
      }),
      value: t('exerciseStatistics.runDynamics.ms', {
        value: formatLocalizedNumber(summary.groundContactMs),
        defaultValue: '{{value}} ms',
      }),
    });
  }
  if (summary.verticalOscillationMm !== null) {
    rows.push({
      key: 'vo',
      label: t('exerciseStatistics.runDynamics.verticalOscillation', {
        defaultValue: 'Vertical oscillation',
      }),
      value: t('exerciseStatistics.runDynamics.mm', {
        value: formatLocalizedNumber(summary.verticalOscillationMm),
        defaultValue: '{{value}} mm',
      }),
    });
  }
  if (summary.strideLengthCm !== null) {
    rows.push({
      key: 'stride',
      label: t('exerciseStatistics.runDynamics.strideLength', {
        defaultValue: 'Stride length',
      }),
      value: t('exerciseStatistics.runDynamics.cm', {
        value: formatLocalizedNumber(summary.strideLengthCm),
        defaultValue: '{{value}} cm',
      }),
    });
  }
  if (summary.verticalRatioPercent !== null) {
    rows.push({
      key: 'ratio',
      label: t('exerciseStatistics.runDynamics.verticalRatio', {
        defaultValue: 'Vertical ratio',
      }),
      value: t('exerciseStatistics.runPower.percent', {
        value: formatLocalizedNumber(summary.verticalRatioPercent, {
          maximumFractionDigits: 1,
        }),
        defaultValue: '{{value}}%',
      }),
    });
  }
  if (summary.groundContactDriftPercent !== null) {
    rows.push({
      key: 'drift',
      label: t('exerciseStatistics.runDynamics.groundContactDrift', {
        defaultValue: 'Ground contact change, start to finish',
      }),
      value: t('exerciseStatistics.runDynamics.signedPercent', {
        value: formatLocalizedNumber(summary.groundContactDriftPercent, {
          maximumFractionDigits: 1,
          signDisplay: 'exceptZero',
        }),
        defaultValue: '{{value}}%',
      }),
    });
  }

  return (
    <View
      className="bg-surface rounded-xl p-4 mb-4 shadow-sm"
      testID="running-dynamics-card"
    >
      <Text className="text-text-primary text-base font-bold mb-3">
        {t('exerciseStatistics.runDynamics.title', {
          defaultValue: 'Running Dynamics',
        })}
      </Text>
      <View className="flex-row flex-wrap mb-2">
        {rows.map((row) => (
          <View
            key={row.key}
            className="w-1/2 py-1.5"
            testID={`run-dynamics-${row.key}`}
          >
            <Text className="text-text-secondary text-xs">{row.label}</Text>
            <Text className="text-text-primary text-base font-semibold">
              {row.value}
            </Text>
          </View>
        ))}
      </View>
      {gctSeries.length >= 2 ? (
        <>
          <Text className="text-text-secondary text-xs mb-1">
            {t('exerciseStatistics.runDynamics.groundContactChart', {
              defaultValue: 'Ground contact time (ms)',
            })}
          </Text>
          <RunSeriesChart
            data={gctSeries}
            color={accent}
            xAxisCaption={t('exerciseStatistics.cardio.minutesAxis', {
              defaultValue: 'Minutes from start',
            })}
          />
        </>
      ) : null}
      <Text className="text-text-muted text-xs mt-3">
        {t('exerciseStatistics.runDynamics.note', {
          defaultValue:
            'A lower vertical ratio means less of each step goes up instead of forward. Ground contact time that climbs through a long run is a sign of tiring.',
        })}
      </Text>
    </View>
  );
};

export default RunningDynamicsCard;
