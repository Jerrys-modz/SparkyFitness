import type {
  BloodPressureCreate,
  BloodPressureUpdate,
  VitalsEntries,
} from '@workspace/shared';
import { apiFetch } from './apiClient';

const SERVICE = 'Blood Pressure API';

interface VitalsListResponse {
  data: VitalsEntries[];
}

interface VitalsEntryResponse {
  data: VitalsEntries;
}

/** Every vitals row in the range; blood pressure rows are the ones with both values. */
export const fetchVitals = async (
  startDate: string,
  endDate: string
): Promise<VitalsEntries[]> => {
  const res = await apiFetch<VitalsListResponse>({
    endpoint: `/api/generic-health/vitals?startDate=${encodeURIComponent(
      startDate
    )}&endDate=${encodeURIComponent(endDate)}`,
    serviceName: SERVICE,
    operation: 'fetch blood pressure',
  });
  return res.data;
};

export const createBloodPressure = async (
  body: BloodPressureCreate
): Promise<VitalsEntries> => {
  const res = await apiFetch<VitalsEntryResponse>({
    endpoint: '/api/generic-health/vitals/blood-pressure',
    serviceName: SERVICE,
    operation: 'create blood pressure',
    method: 'POST',
    body,
  });
  return res.data;
};

export const updateBloodPressure = async (
  id: string,
  body: BloodPressureUpdate
): Promise<VitalsEntries> => {
  const res = await apiFetch<VitalsEntryResponse>({
    endpoint: `/api/generic-health/vitals/blood-pressure/${encodeURIComponent(id)}`,
    serviceName: SERVICE,
    operation: 'update blood pressure',
    method: 'PUT',
    body,
  });
  return res.data;
};

export const deleteBloodPressure = async (id: string): Promise<void> => {
  await apiFetch<unknown>({
    endpoint: `/api/generic-health/vitals/blood-pressure/${encodeURIComponent(id)}`,
    serviceName: SERVICE,
    operation: 'delete blood pressure',
    method: 'DELETE',
  });
};
