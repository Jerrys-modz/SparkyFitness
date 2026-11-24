import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  instantHourMinute,
  instantToDay,
  type BloodPressureCreate,
  type BloodPressureUpdate,
  type TimedBloodPressureReading,
} from '@workspace/shared';
import {
  createBloodPressure,
  deleteBloodPressure,
  fetchVitals,
  updateBloodPressure,
} from '../services/api/bloodPressureApi';
import {
  bloodPressureRangeQueryKey,
  bloodPressureRootQueryKey,
} from './queryKeys';
import { getDeviceTimezone } from '../utils/dateUtils';

export interface BloodPressureReading extends TimedBloodPressureReading {
  id: string;
  at: number;
  pulse: number | null;
  arm: string | null;
  bodyPosition: string | null;
  note: string | null;
  /** Only readings logged by hand can be edited; synced ones are rewritten by the sync. */
  manual: boolean;
}

/** The blood pressure readings of a range, oldest first, in the device's timezone. */
export function useBloodPressureRange(startDate: string, endDate: string) {
  const query = useQuery({
    queryKey: bloodPressureRangeQueryKey(startDate, endDate),
    queryFn: () => fetchVitals(startDate, endDate),
  });
  const readings = useMemo<BloodPressureReading[]>(() => {
    const timezone = getDeviceTimezone();
    const rows: BloodPressureReading[] = [];
    for (const row of query.data ?? []) {
      if (row.systolic_mmhg == null || row.diastolic_mmhg == null) continue;
      const at = new Date(row.timestamp).getTime();
      rows.push({
        id: row.id,
        at,
        date: instantToDay(at, timezone),
        hour: instantHourMinute(at, timezone).hour,
        systolic: Number(row.systolic_mmhg),
        diastolic: Number(row.diastolic_mmhg),
        pulse: row.pulse_bpm == null ? null : Number(row.pulse_bpm),
        arm: row.arm ?? null,
        bodyPosition: row.body_position ?? null,
        note: row.note ?? null,
        manual: row.source_provider === 'manual',
      });
    }
    return rows.sort((a, b) => a.at - b.at);
  }, [query.data]);
  return { ...query, readings };
}

const useInvalidateBloodPressure = () => {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: bloodPressureRootQueryKey });
};

export function useCreateBloodPressure() {
  const invalidate = useInvalidateBloodPressure();
  return useMutation({
    mutationFn: (body: BloodPressureCreate) => createBloodPressure(body),
    onSuccess: invalidate,
  });
}

export function useUpdateBloodPressure() {
  const invalidate = useInvalidateBloodPressure();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: BloodPressureUpdate }) =>
      updateBloodPressure(id, body),
    onSuccess: invalidate,
  });
}

export function useDeleteBloodPressure() {
  const invalidate = useInvalidateBloodPressure();
  return useMutation({
    mutationFn: (id: string) => deleteBloodPressure(id),
    onSuccess: invalidate,
  });
}
