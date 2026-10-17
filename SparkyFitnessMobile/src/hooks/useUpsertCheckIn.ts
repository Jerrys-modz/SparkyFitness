import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import { upsertCheckIn } from '../services/api/measurementsApi';
import {
  QUEUED_WRITE,
  QueueFullError,
  isQueuedWrite,
  submitOrQueue,
  type QueuedWrite,
} from '../services/offlineQueue/queueRunner';
import {
  latestMeasurementsOnOrBeforeRootQueryKey,
  measurementsQueryKey,
} from './queryKeys';
import { refreshHealthSyncCache } from './refreshHealthSyncCache';
import { addLog } from '../services/LogService';
import type { CheckInMeasurement } from '../types/measurements';

interface UpsertCheckInVars {
  entryDate: string;
  weight?: number | null;
  neck?: number | null;
  waist?: number | null;
  hips?: number | null;
  steps?: number | null;
  height?: number | null;
  bodyFatPercentage?: number | null;
  muscleMassKg?: number | null;
  boneMassKg?: number | null;
  bodyWaterPercentage?: number | null;
  bmr?: number | null;
}

export function useUpsertCheckIn(options?: { showErrorToast?: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      vars: UpsertCheckInVars
    ): Promise<CheckInMeasurement | QueuedWrite> => {
      // An upsert by day is safe to replay, so a check-in can wait in the
      // offline queue; it is applied over whatever the server holds by then.
      const outcome = await submitOrQueue({
        send: (_clientId, timeoutMs) => upsertCheckIn(vars, { timeoutMs }),
        queueAs: () => ({
          kind: 'check_in',
          entryDate: vars.entryDate,
          payload: vars,
        }),
      });
      return outcome.status === 'sent' ? outcome.result : QUEUED_WRITE;
    },
    onSuccess: (data, vars) => {
      // Queued: the measurement overlay shows it and nothing changed on the
      // server yet.
      if (isQueuedWrite(data)) return;
      queryClient.setQueryData<CheckInMeasurement>(
        measurementsQueryKey(vars.entryDate),
        data
      );
      // The saved row may now be the newest value on or before any cached day at
      // or after it, so the whole carry-forward family has to be recomputed.
      // `staleTime` is Infinity app-wide, so a later cached day would otherwise
      // keep serving its pre-save suggestion.
      queryClient.invalidateQueries({
        queryKey: latestMeasurementsOnOrBeforeRootQueryKey,
      });
      refreshHealthSyncCache(queryClient);
    },
    onError: (error) => {
      addLog(`Failed to upsert check-in: ${error}`, 'ERROR');
      if (error instanceof QueueFullError) {
        Toast.show({
          type: 'error',
          text1: t('offlineQueue.errors.queueFull', {
            defaultValue: 'Too many entries are waiting',
          }),
          text2: t('offlineQueue.errors.queueFullMessage', {
            defaultValue: 'Reconnect to sync them before adding more.',
          }),
        });
        return;
      }
      // Standalone callers rely on this toast. Multi-mutation flows pass
      // showErrorToast:false so the orchestrating screen owns the single
      // user-facing error message.
      if (options?.showErrorToast !== false) {
        Toast.show({
          type: 'error',
          text1: t('checkIn.saveFailed', { defaultValue: 'Save failed' }),
          text2: t('checkIn.saveMessage', {
            defaultValue: 'Could not save measurements. Please try again.',
          }),
        });
      }
    },
  });
}
