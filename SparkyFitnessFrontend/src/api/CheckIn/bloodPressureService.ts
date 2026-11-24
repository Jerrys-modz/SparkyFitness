import { apiCall } from '@/api/api';
import type {
  BloodPressureCreate,
  BloodPressureUpdate,
  VitalsEntries,
} from '@workspace/shared';

interface VitalsResponse {
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
  const res = await apiCall<VitalsResponse>('/generic-health/vitals', {
    method: 'GET',
    params: { startDate, endDate },
  });
  return res.data;
};

export const createBloodPressure = async (
  body: BloodPressureCreate
): Promise<VitalsEntries> => {
  const res = await apiCall<VitalsEntryResponse>(
    '/generic-health/vitals/blood-pressure',
    { method: 'POST', body }
  );
  return res.data;
};

export const updateBloodPressure = async (
  id: string,
  body: BloodPressureUpdate
): Promise<VitalsEntries> => {
  const res = await apiCall<VitalsEntryResponse>(
    `/generic-health/vitals/blood-pressure/${id}`,
    { method: 'PUT', body }
  );
  return res.data;
};

export const deleteBloodPressure = async (id: string): Promise<void> => {
  await apiCall(`/generic-health/vitals/blood-pressure/${id}`, {
    method: 'DELETE',
  });
};
