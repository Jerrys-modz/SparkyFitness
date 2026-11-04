import type {
  BaselineResult,
  ChronotypeData,
  DataSufficiencyData,
  EnergyCurveData,
  MCTQStatsData,
  SleepDebtData,
} from '@workspace/shared';
import { apiFetch } from './apiClient';

/**
 * Sleep science reads for the signed-in account. The server works out every
 * figure in the account's timezone; hours in these payloads are clock hours
 * there (0 to 24), and times are "HH:MM" strings.
 */
const get = <T>(path: string, operation: string): Promise<T> =>
  apiFetch<T>({
    endpoint: `/api/sleep-science/${path}`,
    serviceName: 'Sleep Science API',
    operation,
  });

/** Weighted sleep debt over the last 14 nights; negative is a surplus. */
export const fetchSleepDebt = () =>
  get<SleepDebtData>('sleep-debt', 'fetch sleep debt');

export const fetchChronotype = () =>
  get<ChronotypeData>('chronotype', 'fetch chronotype');

export const fetchEnergyCurve = () =>
  get<EnergyCurveData>('energy-curve', 'fetch energy curve');

/** The stored baseline sleep need, how it was worked out, and social jetlag. */
export const fetchSleepBaselineStats = () =>
  get<MCTQStatsData>('mctq-stats', 'fetch sleep baseline stats');

export const fetchSleepDataSufficiency = () =>
  get<DataSufficiencyData>('data-sufficiency', 'fetch sleep data sufficiency');

/** Recomputes the baseline sleep need from the last 90 days. */
export const recalculateSleepBaseline = () =>
  apiFetch<BaselineResult>({
    endpoint: '/api/sleep-science/calculate-baseline',
    serviceName: 'Sleep Science API',
    operation: 'recalculate sleep baseline',
    method: 'POST',
    body: { windowDays: 90 },
  });
