import { useQuery } from '@tanstack/react-query';
import type { CompareResponse } from '@workspace/shared';
import { fetchCompare } from '../services/api/compareApi';
import { ApiError } from '../services/api/errors';
import {
  isAskable,
  timingOf,
  type CompareQuestion,
} from '../utils/compareQuestion';
import { compareQueryKey } from './queryKeys';
import { useRefetchOnFocus } from './useRefetchOnFocus';

export function useCompare(
  question: Partial<CompareQuestion>,
  window: { startDate: string; endDate: string }
): {
  data: CompareResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  /** The server has no compare endpoint (it answered 404). */
  serverTooOld: boolean;
  refetch: () => void;
} {
  const askable = isAskable(question);
  const { mode, timing } = askable
    ? timingOf(question.choice)
    : { mode: 'day' as const, timing: 0 as const };
  const params = {
    a: question.a ?? 'mood',
    b: question.b ?? 'mood',
    mode,
    timing,
    start: window.startDate,
    end: window.endDate,
  } as const;

  const query = useQuery({
    queryKey: compareQueryKey(params),
    queryFn: () => fetchCompare(params),
    enabled: askable,
  });

  // The app's default staleTime is Infinity, so follow new logs on focus.
  const refetch = () => void query.refetch();
  useRefetchOnFocus(refetch, askable);

  const serverTooOld =
    query.error instanceof ApiError && query.error.statusCode === 404;

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError && !serverTooOld,
    serverTooOld,
    refetch,
  };
}
