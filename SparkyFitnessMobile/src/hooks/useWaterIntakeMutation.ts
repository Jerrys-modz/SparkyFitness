import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useState, useEffect, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Toast from 'react-native-toast-message';
import {
  fetchWaterContainers,
  changeWaterIntake,
} from '../services/api/measurementsApi';
import {
  NeedsConnectionError,
  QUEUED_WRITE,
  QueueFullError,
  isKnownOffline,
  isQueuedWrite,
  submitOrQueue,
  type QueuedWrite,
} from '../services/offlineQueue/queueRunner';
import { getServingVolume } from '../utils/unitConversions';
import type { DailySummaryRawData } from './useDailySummary';
import type {
  WaterContainer,
  WaterIntakeResponse,
} from '../types/measurements';
import {
  caffeineActiveQueryKey,
  dailySummaryQueryKey,
  waterContainersQueryKey,
  waterIntakeLogQueryKey,
} from './queryKeys';
import { navigationRef as rootNavigationRef } from '../components/ActiveWorkoutBar';

/**
 * Stand-in used when the user has no standard container of their own, matching
 * the web client's fallback. 2000 ml over 8 servings is 250 ml a press, the
 * same figure the server uses when it cannot resolve a container id.
 */
export const DEFAULT_WATER_CONTAINER_ID = -1;
const DEFAULT_WATER_CONTAINER = {
  id: DEFAULT_WATER_CONTAINER_ID,
  name: 'Default Container',
  volume: 2000,
  unit: 'ml',
  servings_per_container: 8,
  is_primary: true,
  hydration_factor: 1,
} as WaterContainer;

const SELECTED_CONTAINER_KEY = '@SparkyFitness/selected-water-container';

interface UseWaterIntakeMutationOptions {
  date: string;
  enabled?: boolean;
}

type WaterWriteResult = WaterIntakeResponse | QueuedWrite;

/**
 * Logs drinks for a container. A single "+" press can wait in the offline
 * queue; anything else (a "-", several at once) acts on what the server holds
 * and needs the server.
 */
async function writeWaterChange(params: {
  date: string;
  changeDrinks: number;
  container: Pick<
    WaterContainer,
    'id' | 'volume' | 'servings_per_container' | 'linked_food_id'
  >;
}): Promise<WaterWriteResult> {
  const { date, changeDrinks, container } = params;
  if (changeDrinks !== 1) {
    if (isKnownOffline()) throw new NeedsConnectionError();
    return changeWaterIntake({
      entryDate: date,
      changeDrinks,
      containerId: container.id,
    });
  }
  const outcome = await submitOrQueue({
    send: (clientId, timeoutMs) =>
      changeWaterIntake({
        entryDate: date,
        changeDrinks,
        containerId: container.id,
        clientId,
        timeoutMs,
      }),
    queueAs: () => ({
      kind: 'water',
      entryDate: date,
      payload: { containerId: container.id },
      previewMl: getServingVolume(container),
    }),
  });
  return outcome.status === 'sent' ? outcome.result : QUEUED_WRITE;
}

function showWaterError(
  t: TFunction,
  error: unknown,
  fallback: { text1: string; text2?: string }
) {
  if (error instanceof NeedsConnectionError) {
    Toast.show({
      type: 'error',
      text1: t('offlineQueue.errors.needsConnection', {
        defaultValue: 'This needs a connection',
      }),
      text2: t('offlineQueue.errors.needsConnectionWater', {
        defaultValue: 'Removing a drink needs your server to be reachable.',
      }),
    });
    return;
  }
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
  Toast.show({ type: 'error', ...fallback });
}

export function useWaterIntakeMutation({
  date,
  enabled = true,
}: UseWaterIntakeMutationOptions) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [selectedContainerId, setSelectedContainerId] = useState<number | null>(
    null
  );

  useEffect(() => {
    AsyncStorage.getItem(SELECTED_CONTAINER_KEY).then((val) => {
      if (val != null) {
        const id = Number(val);
        if (!isNaN(id)) setSelectedContainerId(id);
      }
    });
  }, []);

  const { data: containers, isSuccess: isContainersLoaded } = useQuery({
    queryKey: [...waterContainersQueryKey],
    queryFn: fetchWaterContainers,
    staleTime: Infinity,
    enabled,
  });

  // Quick-add presets are their own chips; they are drinks, not the container
  // the +/- buttons measure plain water with.
  const standardContainers = useMemo(
    () => (containers ?? []).filter((c) => !c.is_quick_add),
    [containers]
  );

  // Resolve the active container the way the web client does: user selection →
  // primary → the first standard container → a synthetic default. Mobile used
  // to give up whenever there were several containers and none was primary,
  // which left the gauge with nothing to press and no way to fix it.
  //
  // The synthetic container is never sent to the server as a real id: the
  // server does not find id -1 and falls back to its own 2000 ml / 8 default,
  // which is the same amount this describes.
  const defaultContainer = useMemo(
    () => ({
      ...DEFAULT_WATER_CONTAINER,
      name: t('waterIntake.defaultContainer', {
        defaultValue: 'Default',
      }),
    }),
    [t]
  );

  // A container is a vessel you press repeatedly; a preset is one drink you
  // log once. Mobile had them in a single selectable row, so tapping Latte
  // only ever selected it and nothing was logged. They are separated here the
  // way web separates them, and the default is offered as a real choice so
  // there is a way back to plain water once a container exists.
  // The default exists so there is something to press before any container is
  // configured. Once real ones exist it is a phantom vessel that appears in no
  // settings list, so it steps aside -- web's carousel behaves the same way.
  const selectableContainers = useMemo(() => {
    if (!isContainersLoaded) return standardContainers;
    return standardContainers.length > 0
      ? standardContainers
      : [defaultContainer];
  }, [standardContainers, defaultContainer, isContainersLoaded]);

  // Resolved against the selectable list, never the raw one. A selection saved
  // while presets were still selectable would otherwise keep a drink as the
  // active vessel -- with no chip left to switch away from it, since presets
  // no longer appear there.
  const activeContainer =
    (selectedContainerId != null
      ? selectableContainers.find((c) => c.id === selectedContainerId)
      : undefined) ??
    standardContainers.find((c) => c.is_primary) ??
    standardContainers[0] ??
    (isContainersLoaded ? defaultContainer : undefined);

  const quickAddPresets = useMemo(
    () => (containers ?? []).filter((c) => c.is_quick_add),
    [containers]
  );

  const selectContainer = (id: number) => {
    setSelectedContainerId(id);
    void AsyncStorage.setItem(SELECTED_CONTAINER_KEY, String(id));
  };

  const mutation = useMutation({
    mutationFn: async (changeDrinks: number): Promise<WaterWriteResult> => {
      if (!activeContainer) {
        throw new Error('No water container configured');
      }
      return writeWaterChange({
        date,
        changeDrinks,
        container: activeContainer,
      });
    },
    onMutate: async (changeDrinks: number) => {
      if (!activeContainer) return undefined;

      // #2115: a linked container's water credit is foodWater(entry) x
      // hydration_factor, not the container volume -- a different number the
      // optimistic patch cannot predict. getServingVolume returns null for
      // those, so skip and let onSuccess/onSettled apply the server's real
      // total instead of flashing the wrong one.
      const perPressMl = getServingVolume(activeContainer);
      if (perPressMl == null) return undefined;

      await queryClient.cancelQueries({ queryKey: dailySummaryQueryKey(date) });

      // Kept so a press that ends up in the offline queue (shown by the
      // overlay instead) or fails can put the cached day back.
      const previous = queryClient.getQueryData<DailySummaryRawData>(
        dailySummaryQueryKey(date)
      );

      queryClient.setQueryData<DailySummaryRawData>(
        dailySummaryQueryKey(date),
        (old) => {
          if (!old) return old;
          return {
            ...old,
            waterIntake: {
              water_ml: Math.max(
                0,
                (old.waterIntake.water_ml || 0) + changeDrinks * perPressMl
              ),
            },
          };
        }
      );
      return { previous };
    },
    onSuccess: (response, _vars, context) => {
      if (isQueuedWrite(response)) {
        if (context?.previous) {
          queryClient.setQueryData(
            dailySummaryQueryKey(date),
            context.previous
          );
        }
        return;
      }
      queryClient.setQueryData<DailySummaryRawData>(
        dailySummaryQueryKey(date),
        (old) => {
          if (!old) return old;
          return {
            ...old,
            waterIntake: { water_ml: response.water_ml },
          };
        }
      );
    },
    onError: (error, _vars, context) => {
      if (
        context?.previous &&
        (error instanceof NeedsConnectionError ||
          error instanceof QueueFullError)
      ) {
        queryClient.setQueryData(dailySummaryQueryKey(date), context.previous);
      }
      showWaterError(t, error, {
        text1: t('waterIntake.updateFailed', { defaultValue: 'Error' }),
        text2: t('waterIntake.updateMessage', {
          defaultValue: 'Failed to update water intake. Please try again.',
        }),
      });
    },
    onSettled: (response, error) => {
      // A queued press changed nothing on the server, and one refused for want
      // of a connection never left the phone: a refetch could only fail.
      if (
        isQueuedWrite(response) ||
        error instanceof NeedsConnectionError ||
        error instanceof QueueFullError
      ) {
        return;
      }
      queryClient.invalidateQueries({ queryKey: dailySummaryQueryKey(date) });
      // The itemized log backs hydration reminders and the watch's log view.
      queryClient.invalidateQueries({ queryKey: waterIntakeLogQueryKey(date) });
      // A linked container logs a drink that can move the day's caffeine curve.
      queryClient.invalidateQueries({ queryKey: caffeineActiveQueryKey(date) });
    },
  });

  // #2115: mobile now owns container CRUD, so this no longer sends the user
  // to configure one on the server -- it takes them straight to the mobile
  // WaterContainers screen instead.
  const noContainerAlert = () => {
    const hasMultiple = containers && containers.length > 1;
    Toast.show({
      type: 'info',
      text1: hasMultiple
        ? t('waterIntake.noPrimary', { defaultValue: 'No Primary Container' })
        : t('waterIntake.noContainers', {
            defaultValue: 'No Water Containers',
          }),
      text2: hasMultiple
        ? t('waterIntake.multipleNoPrimaryMobile', {
            defaultValue:
              'You have multiple water containers but none is marked as primary. Tap to choose one.',
          })
        : t('waterIntake.configureMobile', {
            defaultValue: 'Add a water container to start tracking hydration.',
          }),
      visibilityTime: 4000,
    });
    if (rootNavigationRef.isReady()) {
      rootNavigationRef.navigate('WaterContainers');
    }
  };

  const increment = () => {
    if (!activeContainer) {
      noContainerAlert();
      return;
    }
    mutation.mutate(1);
  };

  // A preset logs the drink it names without becoming the selected vessel:
  // one latte should not turn the +/- buttons into a latte dispenser for the
  // rest of the day. No optimistic patch -- a linked container's credit is
  // foodWater x hydration_factor, which the client cannot predict, so the
  // server's total is what lands.
  const logPreset = useMutation({
    mutationFn: (containerId: number): Promise<WaterWriteResult> => {
      const container = (containers ?? []).find((c) => c.id === containerId);
      if (!container) throw new Error('Unknown drink preset');
      return writeWaterChange({ date, changeDrinks: 1, container });
    },
    onSuccess: (response) => {
      // A queued drink is shown by the offline overlay; nothing to refetch.
      if (isQueuedWrite(response)) return;
      void queryClient.invalidateQueries({
        queryKey: dailySummaryQueryKey(date),
      });
      void queryClient.invalidateQueries({
        queryKey: waterIntakeLogQueryKey(date),
      });
      void queryClient.invalidateQueries({
        queryKey: caffeineActiveQueryKey(date),
      });
    },
    onError: (error) => {
      showWaterError(t, error, {
        text1: t('dashboard.logDrinkFailed', {
          defaultValue: 'Could not log that drink',
        }),
      });
    },
  });

  const decrement = () => {
    if (!activeContainer) {
      noContainerAlert();
      return;
    }
    mutation.mutate(-1);
  };

  return {
    increment,
    logPreset: logPreset.mutate,
    decrement,
    isReady: !!activeContainer,
    isContainersLoaded,
    // A container's unit qualifies its own volume, so it is only meaningful
    // when it has one. The synthetic default has none, and neither does a
    // container linked to a food -- its credit comes from the food, and
    // whatever unit was left in the form when it was created is vestigial.
    // Letting that drive the card put the day's total in oz for a container
    // the user thinks of in ml. Undefined falls back to the display
    // preference.
    unit:
      activeContainer &&
      activeContainer.id !== DEFAULT_WATER_CONTAINER_ID &&
      (!activeContainer.linked_food_id || Number(activeContainer.volume) > 0)
        ? activeContainer.unit
        : undefined,
    servingVolume: activeContainer
      ? getServingVolume(activeContainer)
      : undefined,
    containers: selectableContainers,
    quickAddPresets,
    activeContainer,
    selectContainer,
  };
}
