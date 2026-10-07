import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import {
  useContractionMutations,
  useContractions,
} from '../../../hooks/usePregnancyTools';
import { getApiErrorMessage } from '../../../services/api/errors';
import { fireImpactHaptic } from '../../../services/haptics';
import { usePreferences } from '../../../hooks/usePreferences';
import { formatTimeLabel } from '../../../utils/entryTimeDisplay';
import Button from '../../ui/Button';

interface ContractionTimerProps {
  pregnancyId: string;
}

const RECENT_LIMIT = 6;

function durationSeconds(
  startedAt: string,
  endedAt: string | null | undefined
) {
  if (!endedAt) return null;
  return Math.round(
    (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000
  );
}

/** Minutes between two starts as m:ss. */
function formatInterval(previousStart: string, start: string): string {
  const seconds = Math.round(
    (new Date(start).getTime() - new Date(previousStart).getTime()) / 1000
  );
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function toHourMinute(iso: string): string {
  const date = new Date(iso);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

const ContractionTimer: React.FC<ContractionTimerProps> = ({ pregnancyId }) => {
  const { t } = useTranslation();
  const { preferences } = usePreferences();
  const { contractions, stats } = useContractions();
  const { createContractionAsync, updateContractionAsync } =
    useContractionMutations();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [startMs, setStartMs] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (startMs == null) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [startMs]);

  const reportError = (error: unknown) => {
    Toast.show({
      type: 'error',
      text1: t('contractionTimer.error', {
        defaultValue: 'Could not save contraction',
      }),
      text2: getApiErrorMessage(error) ?? undefined,
    });
  };

  const running = startMs != null;

  const start = async () => {
    fireImpactHaptic();
    const startedAt = new Date().toISOString();
    setNow(Date.now());
    setStartMs(Date.now());
    try {
      const saved = await createContractionAsync({ pregnancyId, startedAt });
      setActiveId(saved.id ?? null);
    } catch (error) {
      setStartMs(null);
      reportError(error);
    }
  };

  const stop = async () => {
    fireImpactHaptic();
    const id = activeId;
    setStartMs(null);
    setActiveId(null);
    if (!id) return;
    try {
      await updateContractionAsync({
        id,
        body: { ended_at: new Date().toISOString() },
      });
    } catch (error) {
      reportError(error);
    }
  };

  // Newest first; the interval for a row is measured from the one before it.
  const recent = contractions.slice(-RECENT_LIMIT - 1).reverse();

  return (
    <View className="bg-surface rounded-xl p-4 shadow-sm gap-3">
      <Text className="text-base font-bold text-text-secondary">
        {t('contractionTimer.title', { defaultValue: 'Contraction Timer' })}
      </Text>

      {stats?.isFiveOneOne && (
        <View className="bg-amber-100 rounded-lg p-3">
          <Text className="text-amber-800 text-sm">
            {t('contractionTimer.fiveOneOne', {
              defaultValue:
                'Your contractions look like a 5-1-1 pattern (about 5 minutes apart, about 1 minute long, for an hour). Consider contacting your provider. This is not medical advice.',
            })}
          </Text>
        </View>
      )}

      <View className="items-center gap-3">
        <Text className="text-text-primary text-4xl font-bold">
          {running
            ? t('contractionTimer.seconds', {
                defaultValue: '{{value}}s',
                value: Math.floor((now - startMs) / 1000),
              })
            : '—'}
        </Text>
        <Button
          variant={running ? 'destructive' : 'primary'}
          onPress={running ? stop : start}
        >
          {running
            ? t('contractionTimer.stop', { defaultValue: 'Stop' })
            : t('contractionTimer.start', {
                defaultValue: 'Start contraction',
              })}
        </Button>
      </View>

      {stats && stats.count > 0 && (
        <View className="flex-row gap-2">
          <View className="flex-1 bg-raised rounded-lg py-2 items-center">
            <Text className="text-text-primary text-sm font-semibold">
              {stats.count}
            </Text>
            <Text className="text-text-secondary text-xs">
              {t('contractionTimer.countLabel', {
                defaultValue: 'in last hour',
              })}
            </Text>
          </View>
          <View className="flex-1 bg-raised rounded-lg py-2 items-center">
            <Text className="text-text-primary text-sm font-semibold">
              {stats.avgIntervalMin != null
                ? t('contractionTimer.minutes', {
                    defaultValue: '{{value}}m',
                    value: stats.avgIntervalMin,
                  })
                : '—'}
            </Text>
            <Text className="text-text-secondary text-xs">
              {t('contractionTimer.apart', { defaultValue: 'apart' })}
            </Text>
          </View>
          <View className="flex-1 bg-raised rounded-lg py-2 items-center">
            <Text className="text-text-primary text-sm font-semibold">
              {stats.avgDurationSec != null
                ? t('contractionTimer.seconds', {
                    defaultValue: '{{value}}s',
                    value: stats.avgDurationSec,
                  })
                : '—'}
            </Text>
            <Text className="text-text-secondary text-xs">
              {t('contractionTimer.long', { defaultValue: 'long' })}
            </Text>
          </View>
        </View>
      )}

      {recent.slice(0, RECENT_LIMIT).map((contraction, index) => {
        const previous = recent[index + 1];
        const seconds = durationSeconds(
          contraction.started_at,
          contraction.ended_at
        );
        return (
          <View
            key={contraction.id ?? contraction.started_at}
            className="flex-row items-center justify-between bg-raised rounded-lg px-3 py-2"
          >
            <Text className="text-text-primary text-sm">
              {formatTimeLabel(
                toHourMinute(contraction.started_at),
                preferences?.time_format
              )}
            </Text>
            <Text className="text-text-secondary text-xs">
              {seconds != null
                ? t('contractionTimer.duration', {
                    defaultValue: 'Duration {{seconds}}s',
                    seconds,
                  })
                : '—'}
              {previous
                ? ` · ${t('contractionTimer.interval', {
                    defaultValue: 'Interval {{value}}',
                    value: formatInterval(
                      previous.started_at,
                      contraction.started_at
                    ),
                  })}`
                : ''}
            </Text>
          </View>
        );
      })}
    </View>
  );
};

export default ContractionTimer;
