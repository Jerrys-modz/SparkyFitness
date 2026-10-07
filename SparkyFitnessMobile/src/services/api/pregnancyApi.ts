import { apiFetch } from './apiClient';
import type {
  ContractionStats,
  SharedContraction,
  SharedKickSession,
} from '@workspace/shared';
import type {
  SharedPregnancy,
  PregnancyOverview,
  PregnancyChecklistItem,
  HealthAppointment,
} from '../../types/womensHealth';

export const getCurrent = async (): Promise<SharedPregnancy | null> => {
  return apiFetch<SharedPregnancy | null>({
    endpoint: '/api/v2/pregnancy/current',
    serviceName: 'Pregnancy API',
    operation: 'get current pregnancy',
  });
};

export const getOverview = async (
  date?: string
): Promise<PregnancyOverview> => {
  const queryParams = date ? `?date=${encodeURIComponent(date)}` : '';
  return apiFetch<PregnancyOverview>({
    endpoint: `/api/v2/pregnancy/overview${queryParams}`,
    serviceName: 'Pregnancy API',
    operation: 'get overview',
  });
};

export const createPregnancy = async (
  body: Partial<SharedPregnancy>
): Promise<SharedPregnancy> => {
  return apiFetch<SharedPregnancy>({
    endpoint: '/api/v2/pregnancy',
    serviceName: 'Pregnancy API',
    operation: 'create pregnancy',
    method: 'POST',
    body,
  });
};

export const updatePregnancy = async (
  id: string,
  body: Partial<SharedPregnancy>
): Promise<SharedPregnancy> => {
  return apiFetch<SharedPregnancy>({
    endpoint: `/api/v2/pregnancy/${encodeURIComponent(id)}`,
    serviceName: 'Pregnancy API',
    operation: 'update pregnancy',
    method: 'PUT',
    body,
  });
};

export const deletePregnancy = async (id: string): Promise<void> => {
  return apiFetch<void>({
    endpoint: `/api/v2/pregnancy/${encodeURIComponent(id)}`,
    serviceName: 'Pregnancy API',
    operation: 'delete pregnancy',
    method: 'DELETE',
  });
};

// --- Checklist ---

export const getChecklist = async (
  pregnancyId: string
): Promise<PregnancyChecklistItem[]> => {
  return apiFetch<PregnancyChecklistItem[]>({
    endpoint: `/api/v2/pregnancy/checklist?pregnancy_id=${encodeURIComponent(pregnancyId)}`,
    serviceName: 'Pregnancy API',
    operation: 'get checklist',
  });
};

export interface UpsertChecklistItemBody {
  id?: string;
  pregnancy_id?: string;
  template_key?: string | null;
  custom_title?: string | null;
  week?: number;
  completed?: boolean;
  dismissed?: boolean;
}

export const upsertChecklistItem = async (
  body: UpsertChecklistItemBody
): Promise<PregnancyChecklistItem> => {
  return apiFetch<PregnancyChecklistItem>({
    endpoint: '/api/v2/pregnancy/checklist',
    serviceName: 'Pregnancy API',
    operation: 'upsert checklist item',
    method: 'PUT',
    body,
  });
};

// --- Kick counter ---

export const startKickSession = async (
  pregnancyId: string
): Promise<SharedKickSession> => {
  return apiFetch<SharedKickSession>({
    endpoint: '/api/v2/pregnancy/kicks/start',
    serviceName: 'Pregnancy API',
    operation: 'start kick session',
    method: 'POST',
    body: { pregnancy_id: pregnancyId },
  });
};

export interface UpdateKickSessionBody {
  kick_count?: number;
  kick_times?: string[];
  ended?: boolean;
}

export const updateKickSession = async (
  id: string,
  body: UpdateKickSessionBody
): Promise<SharedKickSession> => {
  return apiFetch<SharedKickSession>({
    endpoint: `/api/v2/pregnancy/kicks/${encodeURIComponent(id)}`,
    serviceName: 'Pregnancy API',
    operation: 'update kick session',
    method: 'PUT',
    body,
  });
};

// --- Contraction timer ---

interface ContractionAnalysis {
  contractions: SharedContraction[];
  stats: ContractionStats;
}

export const getContractions = async (): Promise<ContractionAnalysis> => {
  return apiFetch<ContractionAnalysis>({
    endpoint: '/api/v2/pregnancy/contractions',
    serviceName: 'Pregnancy API',
    operation: 'get contractions',
  });
};

export const createContraction = async (
  pregnancyId: string,
  startedAt: string
): Promise<SharedContraction> => {
  return apiFetch<SharedContraction>({
    endpoint: '/api/v2/pregnancy/contractions',
    serviceName: 'Pregnancy API',
    operation: 'create contraction',
    method: 'POST',
    body: { pregnancy_id: pregnancyId, started_at: startedAt },
  });
};

export const updateContraction = async (
  id: string,
  body: { ended_at?: string | null; intensity?: number | null }
): Promise<SharedContraction> => {
  return apiFetch<SharedContraction>({
    endpoint: `/api/v2/pregnancy/contractions/${encodeURIComponent(id)}`,
    serviceName: 'Pregnancy API',
    operation: 'update contraction',
    method: 'PUT',
    body,
  });
};

// --- Appointments ---

export interface CreateAppointmentBody {
  scheduled_at: string;
  appointment_type: string;
  title?: string | null;
  location?: string | null;
  notes?: string | null;
}

export const listAppointments = async (): Promise<HealthAppointment[]> => {
  return apiFetch<HealthAppointment[]>({
    endpoint: '/api/v2/pregnancy/appointments',
    serviceName: 'Pregnancy API',
    operation: 'list appointments',
  });
};

export const createAppointment = async (
  body: CreateAppointmentBody
): Promise<HealthAppointment> => {
  return apiFetch<HealthAppointment>({
    endpoint: '/api/v2/pregnancy/appointments',
    serviceName: 'Pregnancy API',
    operation: 'create appointment',
    method: 'POST',
    body,
  });
};

export const deleteAppointment = async (id: string): Promise<void> => {
  return apiFetch<void>({
    endpoint: `/api/v2/pregnancy/appointments/${encodeURIComponent(id)}`,
    serviceName: 'Pregnancy API',
    operation: 'delete appointment',
    method: 'DELETE',
  });
};
