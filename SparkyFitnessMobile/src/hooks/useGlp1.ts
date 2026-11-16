import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  listPens,
  createPen,
  updatePen,
  deletePen,
  listInjections,
  logInjection,
  deleteInjection,
  updateInjection,
  listTitration,
  createTitrationStep,
  updateTitrationStep,
  deleteTitrationStep,
  getSerumCurve,
  getSiteSuggestion,
} from '../services/api/medicationsApi';
import {
  glp1PensQueryKey,
  glp1InjectionsQueryKey,
  glp1TitrationQueryKey,
  glp1SerumCurveQueryKey,
  glp1SiteSuggestionQueryKey,
} from './queryKeys';
import { invalidateMedicationEntryCaches } from './invalidateMedicationEntryCaches';
import { useRefetchOnFocus } from './useRefetchOnFocus';
import type {
  LogInjectionInput,
  UpdateInjectionInput,
  MedicationPen,
  TitrationStep,
  UpdateTitrationStepInput,
} from '@workspace/shared';

export function useMedicationPens(medicationId: string) {
  const query = useQuery({
    queryKey: glp1PensQueryKey(medicationId),
    queryFn: () => listPens(medicationId),
    enabled: !!medicationId,
  });
  useRefetchOnFocus(query.refetch, !!medicationId);
  return query;
}

export function useInjections(medicationId: string) {
  const query = useQuery({
    queryKey: glp1InjectionsQueryKey(medicationId),
    queryFn: () => listInjections(medicationId),
    enabled: !!medicationId,
  });
  useRefetchOnFocus(query.refetch, !!medicationId);
  return query;
}

export function useTitrationSteps(medicationId: string) {
  const query = useQuery({
    queryKey: glp1TitrationQueryKey(medicationId),
    queryFn: () => listTitration(medicationId),
    enabled: !!medicationId,
  });
  useRefetchOnFocus(query.refetch, !!medicationId);
  return query;
}

export function useSerumCurve(medicationId: string) {
  return useQuery({
    queryKey: glp1SerumCurveQueryKey(medicationId),
    queryFn: () => getSerumCurve(medicationId),
    enabled: !!medicationId,
  });
}

export function useSiteSuggestion(medicationId: string) {
  return useQuery({
    queryKey: glp1SiteSuggestionQueryKey(medicationId),
    queryFn: () => getSiteSuggestion(medicationId),
    enabled: !!medicationId,
  });
}

export function useLogInjection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: LogInjectionInput) => logInjection(body),
    onSuccess: () => invalidateMedicationEntryCaches(queryClient),
  });
}

export function useUpdateInjection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateInjectionInput }) =>
      updateInjection(id, body),
    onSuccess: () => invalidateMedicationEntryCaches(queryClient),
  });
}

export function useDeleteInjection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteInjection(id),
    // Deleting credits the dose back to its pen, so the pens refresh as well;
    // they sit under the medications root with everything else.
    onSuccess: () => invalidateMedicationEntryCaches(queryClient),
  });
}

export function useCreatePen() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      medicationId,
      body,
    }: {
      medicationId: string;
      body: Parameters<typeof createPen>[1];
    }) => createPen(medicationId, body),
    onSuccess: () => invalidateMedicationEntryCaches(queryClient),
  });
}

export function useUpdatePen() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: Partial<Omit<MedicationPen, 'id' | 'medication_id'>>;
    }) => updatePen(id, body),
    onSuccess: () => invalidateMedicationEntryCaches(queryClient),
  });
}

export function useDeletePen() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deletePen(id),
    onSuccess: () => invalidateMedicationEntryCaches(queryClient),
  });
}

export function useCreateTitrationStep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      medicationId,
      body,
    }: {
      medicationId: string;
      body: UpdateTitrationStepInput & { dose_mg: number };
    }) => createTitrationStep(medicationId, body),
    onSuccess: () => invalidateMedicationEntryCaches(queryClient),
  });
}

export function useUpdateTitrationStep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: UpdateTitrationStepInput;
    }) => updateTitrationStep(id, body),
    onSuccess: () => invalidateMedicationEntryCaches(queryClient),
  });
}

export function useDeleteTitrationStep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (step: Pick<TitrationStep, 'id'>) =>
      deleteTitrationStep(step.id),
    onSuccess: () => invalidateMedicationEntryCaches(queryClient),
  });
}
