import { apiFetch } from './apiClient';
import type {
  AssignBikeResponse,
  BikeComponentResponse,
  BikeDetailResponse,
  BikeListResponse,
  BikeStatus,
  CreateBikeBody,
  CreateBikeComponentBody,
  ReplaceBikeComponentBody,
  ReplaceBikeComponentResponse,
  RetireBikeComponentBody,
  UpdateBikeBody,
  UpdateBikeComponentBody,
} from '@workspace/shared';

const SERVICE = 'Bikes API';
const bikePath = (id: string) => `/api/v2/bikes/${encodeURIComponent(id)}`;
const componentPath = (bikeId: string, componentId: string) =>
  `${bikePath(bikeId)}/components/${encodeURIComponent(componentId)}`;

export const fetchBikes = (status?: BikeStatus): Promise<BikeListResponse> =>
  apiFetch<BikeListResponse>({
    endpoint: status ? `/api/v2/bikes?status=${status}` : '/api/v2/bikes',
    serviceName: SERVICE,
    operation: 'fetch bikes',
  });

export const fetchBike = (id: string): Promise<BikeDetailResponse> =>
  apiFetch<BikeDetailResponse>({
    endpoint: bikePath(id),
    serviceName: SERVICE,
    operation: 'fetch bike',
  });

export const createBike = (data: CreateBikeBody): Promise<BikeDetailResponse> =>
  apiFetch<BikeDetailResponse>({
    endpoint: '/api/v2/bikes',
    method: 'POST',
    body: data,
    serviceName: SERVICE,
    operation: 'create bike',
  });

export const updateBike = (
  id: string,
  data: UpdateBikeBody
): Promise<BikeDetailResponse> =>
  apiFetch<BikeDetailResponse>({
    endpoint: bikePath(id),
    method: 'PUT',
    body: data,
    serviceName: SERVICE,
    operation: 'update bike',
  });

export const deleteBike = (id: string): Promise<{ success: boolean }> =>
  apiFetch<{ success: boolean }>({
    endpoint: bikePath(id),
    method: 'DELETE',
    serviceName: SERVICE,
    operation: 'delete bike',
  });

export const createBikeComponent = (
  bikeId: string,
  data: CreateBikeComponentBody
): Promise<BikeComponentResponse> =>
  apiFetch<BikeComponentResponse>({
    endpoint: `${bikePath(bikeId)}/components`,
    method: 'POST',
    body: data,
    serviceName: SERVICE,
    operation: 'add bike component',
  });

export const updateBikeComponent = (
  bikeId: string,
  componentId: string,
  data: UpdateBikeComponentBody
): Promise<BikeComponentResponse> =>
  apiFetch<BikeComponentResponse>({
    endpoint: componentPath(bikeId, componentId),
    method: 'PUT',
    body: data,
    serviceName: SERVICE,
    operation: 'update bike component',
  });

export const retireBikeComponent = (
  bikeId: string,
  componentId: string,
  data: RetireBikeComponentBody
): Promise<BikeComponentResponse> =>
  apiFetch<BikeComponentResponse>({
    endpoint: `${componentPath(bikeId, componentId)}/retire`,
    method: 'POST',
    body: data,
    serviceName: SERVICE,
    operation: 'retire bike component',
  });

export const replaceBikeComponent = (
  bikeId: string,
  componentId: string,
  data: ReplaceBikeComponentBody
): Promise<ReplaceBikeComponentResponse> =>
  apiFetch<ReplaceBikeComponentResponse>({
    endpoint: `${componentPath(bikeId, componentId)}/replace`,
    method: 'POST',
    body: data,
    serviceName: SERVICE,
    operation: 'replace bike component',
  });

export const deleteBikeComponent = (
  bikeId: string,
  componentId: string
): Promise<{ success: boolean }> =>
  apiFetch<{ success: boolean }>({
    endpoint: componentPath(bikeId, componentId),
    method: 'DELETE',
    serviceName: SERVICE,
    operation: 'delete bike component',
  });

/** Links a diary entry to a bike, or clears the link with `null`. */
export const assignBikeToExerciseEntry = (
  exerciseEntryId: string,
  bikeId: string | null
): Promise<AssignBikeResponse> =>
  apiFetch<AssignBikeResponse>({
    endpoint: `/api/v2/bikes/assignments/${encodeURIComponent(exerciseEntryId)}`,
    method: 'PUT',
    body: { bike_id: bikeId },
    serviceName: SERVICE,
    operation: 'assign bike to exercise entry',
  });
