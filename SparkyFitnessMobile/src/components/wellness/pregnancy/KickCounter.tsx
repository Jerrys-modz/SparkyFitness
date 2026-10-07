import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import type { SharedKickSession } from '@workspace/shared';
import { useKickSessionMutations } from '../../../hooks/usePregnancyTools';
import { getApiErrorMessage } from '../../../services/api/errors';
import { fireImpactHaptic, fireSuccessHaptic } from '../../../services/haptics';
import { formatElapsedClock } from '../../../utils/fasting';
import { getAppLocale } from '../../../localization';
import Button from '../../ui/Button';

/** Movements to reach before a session ends automatically. */
const KICK_GOAL = 10;

interface KickCounterProps {
  pregnancyId: string;
  recentSessions?: SharedKickSession[];
}

const KickCounter: React.FC<KickCounterProps> = ({
  pregnancyId,
  recentSessions = [],
}) => {
  const { t } = useTranslation();
  const { startKickSessionAsync, isStarting, updateKickSessionAsync } =
    useKickSessionMutations();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [startMs, setStartMs] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const times = useRef<string[]>([]);

  useEffect(() => {
    if (startMs == null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startMs]);

  const reportError = (error: unknown) => {
    Toast.show({
      type: 'error',
      text1: t('kickCounter.error', {
        defaultValue: 'Could not save kick session',
      }),
      text2: getApiErrorMessage(error) ?? undefined,
    });
  };

  const reset = () => {
    setSessionId(null);
    setStartMs(null);
    setCount(0);
    times.current = [];
  };

  const start = async () => {
    try {
      const session = await startKickSessionAsync(pregnancyId);
      if (!session.id) return;
      times.current = [];
      setCount(0);
      setSessionId(session.id);
      setNow(Date.now());
      setStartMs(Date.now());
    } catch (error) {
      reportError(error);
    }
  };

  const tap = async () => {
    if (!sessionId || count >= KICK_GOAL) return;
    const next = count + 1;
    const reached = next >= KICK_GOAL;
    fireImpactHaptic();
    setCount(next);
    times.current = [...times.current, new Date().toISOString()];
    try {
      await updateKickSessionAsync({
        id: sessionId,
        body: {
          kick_count: next,
          kick_times: times.current,
          ended: reached,
        },
      });
      if (reached) {
        fireSuccessHaptic();
        reset();
      }
    } catch (error) {
      reportError(error);
    }
  };

  const stop = async () => {
    if (!sessionId) return;
    try {
      await updateKickSessionAsync({ id: sessionId, body: { ended: true } });
      reset();
    } catch (error) {
      reportError(error);
    }
  };

  const active = startMs != null;

  return (
    <View className="bg-surface rounded-xl p-4 shadow-sm gap-3 items-center">
      <Text className="text-base font-bold text-text-secondary self-start">
        {t('kickCounter.title', { defaultValue: 'Kick Counter' })}
      </Text>
      <Text className="text-text-secondary text-sm self-start">
        {t('kickCounter.goal', {
          defaultValue: 'Aim for {{count}} movements',
          count: KICK_GOAL,
        })}
      </Text>

      {active ? (
        <>
          <TouchableOpacity
            onPress={tap}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('kickCounter.tap', {
              defaultValue: 'Tap to count a kick',
            })}
            className="w-40 h-40 rounded-full bg-raised items-center justify-center"
          >
            <Text className="text-text-primary text-5xl font-bold">
              {count}
            </Text>
            <Text className="text-text-secondary text-xs">/ {KICK_GOAL}</Text>
          </TouchableOpacity>
          <Text className="text-text-secondary text-sm">
            {formatElapsedClock(now - (startMs ?? now))}
          </Text>
          <Button variant="outline" onPress={stop}>
            {t('kickCounter.stop', { defaultValue: 'End session' })}
          </Button>
        </>
      ) : (
        <>
          <Button variant="primary" onPress={start} loading={isStarting}>
            {t('kickCounter.start', { defaultValue: 'Start counting' })}
          </Button>
          {recentSessions.length > 0 && (
            <View className="self-stretch gap-1.5 mt-2">
              <Text className="text-text-secondary text-xs font-semibold">
                {t('kickCounter.recent', { defaultValue: 'Recent sessions' })}
              </Text>
              {recentSessions.slice(0, 3).map((session) => (
                <View
                  key={session.id ?? session.started_at}
                  className="flex-row items-center justify-between bg-raised rounded-lg px-3 py-2"
                >
                  <Text className="text-text-primary text-sm">
                    {t('kickCounter.movements', {
                      defaultValue: '{{count}} movements',
                      count: session.kick_count,
                    })}
                  </Text>
                  <Text className="text-text-secondary text-xs">
                    {new Date(session.started_at).toLocaleDateString(
                      getAppLocale(),
                      { month: 'short', day: 'numeric' }
                    )}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </View>
  );
};

export default KickCounter;
