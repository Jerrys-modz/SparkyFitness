import { useQuery } from '@tanstack/react-query';
import { File, Paths } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import {
  serializeGpx,
  type CreateRouteBody,
  type Route,
  type RouteSummary,
  type UpdateRouteBody,
} from '@workspace/shared';
import { queryClient } from '../hooks/queryClient';
import { routeQueryKey, routesQueryKey } from '../hooks/queryKeys';
import {
  createRoute,
  createRouteFromActivity,
  deleteRoute,
  fetchRoute,
  fetchRoutes,
  importGpxRoute,
  updateRoute,
} from './api/routeApi';

/** The person's saved routes, newest first, and whether they have loaded. */
export function useRoutes(): {
  routes: RouteSummary[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => Promise<unknown>;
} {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: routesQueryKey,
    queryFn: async () => (await fetchRoutes()).routes,
    staleTime: 0,
  });
  return { routes: data ?? [], isLoading, isError, refetch };
}

/** One saved route with its points and cues. */
export function useRoute(id: string): {
  route: Route | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => Promise<unknown>;
} {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: routeQueryKey(id),
    queryFn: async () => (await fetchRoute(id)).route,
  });
  return { route: data, isLoading, isError, refetch };
}

const refreshRoutes = () =>
  queryClient.invalidateQueries({ queryKey: routesQueryKey });

export async function saveDrawnRoute(
  input: Omit<CreateRouteBody, 'activity'> & Partial<CreateRouteBody>
): Promise<Route> {
  const { route } = await createRoute(input);
  await refreshRoutes();
  return route;
}

export async function saveActivityAsRoute(
  exerciseEntryId: string,
  name?: string
): Promise<Route> {
  const { route } = await createRouteFromActivity(
    exerciseEntryId,
    name ? { name } : {}
  );
  await refreshRoutes();
  return route;
}

export async function renameRoute(
  id: string,
  patch: UpdateRouteBody
): Promise<Route> {
  const { route } = await updateRoute(id, patch);
  await refreshRoutes();
  return route;
}

export async function removeRoute(id: string): Promise<void> {
  await deleteRoute(id);
  queryClient.removeQueries({ queryKey: routeQueryKey(id) });
  await refreshRoutes();
}

/**
 * Lets the person pick a GPX file and saves its track as a route. Resolves to
 * null when they close the picker without choosing.
 */
export async function pickAndImportGpx(): Promise<Route | null> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: true,
    multiple: false,
  });
  const asset = picked.canceled ? undefined : picked.assets[0];
  if (!asset) return null;
  const gpx = await new File(asset.uri).text();
  const { route } = await importGpxRoute({ gpx });
  await refreshRoutes();
  return route;
}

/** Opens the share sheet with the route as a GPX file. False if dismissed. */
export async function shareRouteGpx(route: Route): Promise<boolean> {
  const safeName =
    route.name.replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 60) || 'route';
  const file = new File(Paths.cache, `${safeName}.gpx`);
  if (file.exists) file.delete();
  file.create();
  file.write(serializeGpx(route.name, route.points));
  try {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/gpx+xml',
      UTI: 'com.topografix.gpx',
      dialogTitle: route.name,
    });
    return true;
  } catch (error: unknown) {
    if (error instanceof Error && error.message?.includes('cancel')) {
      return false;
    }
    throw error;
  }
}
