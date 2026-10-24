import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  inventoryConfigFrom,
  type PlateInventoryConfig,
  type PlateUnit,
  type SavePlateInventoryBody,
} from '@workspace/shared';
import {
  deletePlateInventory,
  fetchPlateInventory,
  savePlateInventory,
} from '../services/api/plateInventoryApi';
import { plateInventoryQueryKey } from './queryKeys';
import { useRefetchOnFocus } from './useRefetchOnFocus';

/**
 * The person's plates and bars. Until something is saved this is the standard
 * set for `fallbackUnit`, so the calculator works with nothing set up.
 */
export function usePlateInventory(fallbackUnit: PlateUnit) {
  const query = useQuery({
    queryKey: plateInventoryQueryKey,
    queryFn: fetchPlateInventory,
  });

  useRefetchOnFocus(query.refetch);

  const stored = query.data?.inventory ?? null;
  const inventory: PlateInventoryConfig = inventoryConfigFrom(
    stored,
    fallbackUnit
  );

  return {
    inventory,
    hasSaved: stored != null,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function usePlateInventoryMutations() {
  const queryClient = useQueryClient();
  const refresh = () => {
    void queryClient.invalidateQueries({
      queryKey: [...plateInventoryQueryKey],
    });
  };

  const saveMutation = useMutation({
    mutationFn: (data: SavePlateInventoryBody) => savePlateInventory(data),
    onSuccess: refresh,
  });
  const resetMutation = useMutation({
    mutationFn: deletePlateInventory,
    onSuccess: refresh,
  });

  return { saveMutation, resetMutation };
}
