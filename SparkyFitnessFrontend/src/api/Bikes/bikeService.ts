import { api } from '@/api/api';
import type {
  AssignBikeResponse,
  BikeDetailResponse,
  BikeListResponse,
  BikeStatus,
  CreateBikeBody,
  UpdateBikeBody,
} from '@workspace/shared';

export const fetchBikes = async (
  status?: BikeStatus
): Promise<BikeListResponse> => {
  return api.get('/v2/bikes', { params: status ? { status } : undefined });
};

export const createBike = async (
  data: CreateBikeBody
): Promise<BikeDetailResponse> => {
  return api.post('/v2/bikes', { body: data });
};

export const updateBike = async (
  id: string,
  data: UpdateBikeBody
): Promise<BikeDetailResponse> => {
  return api.put(`/v2/bikes/${id}`, { body: data });
};

export const deleteBike = async (id: string): Promise<{ success: boolean }> => {
  return api.delete(`/v2/bikes/${id}`);
};

export const assignBikeToEntry = async (
  exerciseEntryId: string,
  bikeId: string | null
): Promise<AssignBikeResponse> => {
  return api.put(`/v2/bikes/assignments/${exerciseEntryId}`, {
    body: { bike_id: bikeId },
  });
};
