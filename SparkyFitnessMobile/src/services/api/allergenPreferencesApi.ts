import { apiFetch } from './apiClient';
import type { AllergenPreference } from '../../types/allergenPreferences';

export const fetchAllergenPreferences = async (): Promise<
  AllergenPreference[]
> => {
  return apiFetch<AllergenPreference[]>({
    endpoint: '/api/allergen-preferences',
    serviceName: 'Allergen Preferences API',
    operation: 'fetch allergen preferences',
  });
};

export const addAllergenPreference = async (
  allergenName: string
): Promise<AllergenPreference> => {
  return apiFetch<AllergenPreference>({
    endpoint: '/api/allergen-preferences',
    method: 'POST',
    body: { allergen_name: allergenName },
    serviceName: 'Allergen Preferences API',
    operation: 'add allergen preference',
  });
};

export const removeAllergenPreference = async (id: string): Promise<void> => {
  return apiFetch<void>({
    endpoint: `/api/allergen-preferences/${id}`,
    method: 'DELETE',
    serviceName: 'Allergen Preferences API',
    operation: 'remove allergen preference',
  });
};
