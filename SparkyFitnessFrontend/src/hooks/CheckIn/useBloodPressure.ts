import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type {
  BloodPressureCreate,
  BloodPressureUpdate,
} from '@workspace/shared';
import {
  createBloodPressure,
  deleteBloodPressure,
  fetchVitals,
  updateBloodPressure,
} from '@/api/CheckIn/bloodPressureService';
import { bloodPressureKeys } from '@/api/keys/checkin';

export const useBloodPressureRange = (startDate: string, endDate: string) =>
  useQuery({
    queryKey: bloodPressureKeys.range(startDate, endDate),
    queryFn: () => fetchVitals(startDate, endDate),
    enabled: Boolean(startDate && endDate),
  });

// A write changes every range that includes it, so the whole family refreshes.
const useInvalidateBloodPressure = () => {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: bloodPressureKeys.all });
};

export const useCreateBloodPressureMutation = () => {
  const { t } = useTranslation();
  const invalidate = useInvalidateBloodPressure();
  return useMutation({
    mutationFn: (body: BloodPressureCreate) => createBloodPressure(body),
    onSuccess: invalidate,
    meta: {
      errorMessage: t(
        'bloodPressure.errors.save',
        'Could not save the reading.'
      ),
    },
  });
};

export const useUpdateBloodPressureMutation = () => {
  const { t } = useTranslation();
  const invalidate = useInvalidateBloodPressure();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: BloodPressureUpdate }) =>
      updateBloodPressure(id, body),
    onSuccess: invalidate,
    meta: {
      errorMessage: t(
        'bloodPressure.errors.save',
        'Could not save the reading.'
      ),
    },
  });
};

export const useDeleteBloodPressureMutation = () => {
  const { t } = useTranslation();
  const invalidate = useInvalidateBloodPressure();
  return useMutation({
    mutationFn: (id: string) => deleteBloodPressure(id),
    onSuccess: invalidate,
    meta: {
      errorMessage: t(
        'bloodPressure.errors.delete',
        'Could not delete the reading.'
      ),
    },
  });
};
