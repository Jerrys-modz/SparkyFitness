import { renderHook, waitFor } from '@testing-library/react-native';
import {
  generateRouteOptions,
  generateRoutePreview,
  saveGeneratedRoute,
  useRouteGenerationAvailable,
  useRouteGenerationCapabilities,
  useRouteStops,
} from '../../src/services/routeService';
import {
  createRoute,
  fetchRouteGenerationCapabilities,
  fetchRouteStops,
  generateRoute,
} from '../../src/services/api/routeApi';
import { queryClient } from '../../src/hooks/queryClient';
import {
  createQueryWrapper,
  createTestQueryClient,
} from '../hooks/queryTestUtils';

jest.mock('expo-document-picker', () => ({}));
jest.mock('expo-sharing', () => ({}));
jest.mock('expo-file-system', () => ({ File: jest.fn(), Paths: {} }));
jest.mock('../../src/services/api/routeApi', () => ({
  createRoute: jest.fn(),
  createRouteFromActivity: jest.fn(),
  deleteRoute: jest.fn(),
  fetchRoute: jest.fn(),
  fetchRoutes: jest.fn(),
  fetchRouteGenerationCapabilities: jest.fn(),
  fetchRouteStops: jest.fn(),
  generateRoute: jest.fn(),
  importGpxRoute: jest.fn(),
  updateRoute: jest.fn(),
}));

const mockCapabilities = fetchRouteGenerationCapabilities as jest.Mock;
const mockGenerate = generateRoute as jest.Mock;
const mockStops = fetchRouteStops as jest.Mock;
const mockCreate = createRoute as jest.Mock;

const previewRoute = {
  name: 'Generated 5.0 km run',
  activity: 'run' as const,
  source: 'generated' as const,
  points: [
    { lat: 1, lon: 2 },
    { lat: 1.01, lon: 2 },
  ],
  cues: [{ index: 1, kind: 'left' as const, distanceM: 500 }],
  distanceM: 1100,
  elevationGainM: 12,
};

describe('route generation service', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('useRouteGenerationAvailable', () => {
    const render = () => {
      const client = createTestQueryClient();
      return renderHook(() => useRouteGenerationAvailable(), {
        wrapper: createQueryWrapper(client),
      });
    };

    it('is available when the server says so', async () => {
      mockCapabilities.mockResolvedValue({ available: true });
      const { result } = render();
      expect(result.current.isLoading).toBe(true);
      await waitFor(() => expect(result.current.available).toBe(true));
      expect(result.current.isLoading).toBe(false);
    });

    it('is unavailable when the server has no engine', async () => {
      mockCapabilities.mockResolvedValue({ available: false });
      const { result } = render();
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.available).toBe(false);
    });

    it('hides the feature when the check fails, without retrying', async () => {
      mockCapabilities.mockRejectedValue(new Error('offline'));
      const { result } = render();
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.available).toBe(false);
      expect(mockCapabilities).toHaveBeenCalledTimes(1);
    });
  });

  describe('useRouteGenerationCapabilities', () => {
    const render = () => {
      const client = createTestQueryClient();
      return renderHook(() => useRouteGenerationCapabilities(), {
        wrapper: createQueryWrapper(client),
      });
    };

    it('reads everything the server offers', async () => {
      mockCapabilities.mockResolvedValue({
        available: true,
        maxAlternatives: 3,
        style: {
          surface: true,
          hilliness: false,
          avoidSteps: true,
          avoidBusyRoads: false,
        },
        stops: true,
      });
      const { result } = render();
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.capabilities).toEqual({
        available: true,
        maxAlternatives: 3,
        style: {
          surface: true,
          hilliness: false,
          avoidSteps: true,
          avoidBusyRoads: false,
        },
        stops: true,
        source: null,
        stopsSource: null,
      });
    });

    it('reads an older server’s answer as nothing extra', async () => {
      mockCapabilities.mockResolvedValue({ available: true });
      const { result } = render();
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.capabilities).toMatchObject({
        available: true,
        maxAlternatives: 1,
        stops: false,
        style: { surface: false, hilliness: false },
      });
    });

    it('keeps the same object between renders', async () => {
      mockCapabilities.mockResolvedValue({ available: true });
      const { result, rerender } = render();
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      const first = result.current.capabilities;
      rerender({});
      expect(result.current.capabilities).toBe(first);
    });
  });

  describe('useRouteStops', () => {
    const render = () => {
      const client = createTestQueryClient();
      return renderHook(() => useRouteStops('route-1'), {
        wrapper: createQueryWrapper(client),
      });
    };
    const answer = {
      status: 'ok' as const,
      stops: [
        {
          kind: 'cafe' as const,
          name: null,
          lat: 1,
          lon: 2,
          distanceFromStartM: 100,
          offRouteM: 10,
        },
      ],
      truncated: false,
    };

    it('does not ask when the server has no stops lookup', async () => {
      mockCapabilities.mockResolvedValue({ available: true, stops: false });
      const { result } = render();
      await waitFor(() => expect(mockCapabilities).toHaveBeenCalled());
      expect(result.current.available).toBe(false);
      expect(mockStops).not.toHaveBeenCalled();
    });

    it('loads the stops once the server offers them', async () => {
      mockCapabilities.mockResolvedValue({ available: false, stops: true });
      mockStops.mockResolvedValue(answer);
      const { result } = render();
      await waitFor(() => expect(result.current.stops).toEqual(answer));
      expect(result.current.available).toBe(true);
      expect(result.current.isLoading).toBe(false);
      expect(mockStops).toHaveBeenCalledWith('route-1');
    });

    it('shows no stops, not an error, when the request fails', async () => {
      mockCapabilities.mockResolvedValue({ available: true, stops: true });
      mockStops.mockRejectedValue(new Error('429'));
      const { result } = render();
      await waitFor(() => expect(mockStops).toHaveBeenCalled());
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.stops).toBeNull();
      expect(mockStops).toHaveBeenCalledTimes(1);
    });
  });

  it('returns every option from the generate endpoint', async () => {
    const response = {
      route: previewRoute,
      options: [{ route: previewRoute, label: null, trailShare: null }],
    };
    mockGenerate.mockResolvedValue(response);
    const body = {
      mode: 'loop' as const,
      start: { lat: 1, lon: 2 },
      activity: 'run' as const,
      distanceM: 5000,
      shape: 'loop' as const,
      alternatives: 3,
    };
    await expect(generateRouteOptions(body)).resolves.toBe(response);
    expect(mockGenerate).toHaveBeenCalledWith(body);
  });

  it('returns the preview from the generate endpoint', async () => {
    mockGenerate.mockResolvedValue({ route: previewRoute });
    const body = {
      mode: 'loop' as const,
      start: { lat: 1, lon: 2 },
      activity: 'run' as const,
      distanceM: 5000,
      shape: 'loop' as const,
      alternatives: 1,
    };
    await expect(generateRoutePreview(body)).resolves.toBe(previewRoute);
    expect(mockGenerate).toHaveBeenCalledWith(body);
  });

  it('saves a preview as generated with its cues', async () => {
    mockCreate.mockResolvedValue({ route: { id: 'r1' } });
    const spy = jest
      .spyOn(queryClient, 'invalidateQueries')
      .mockResolvedValue(undefined);
    await saveGeneratedRoute(previewRoute, 'My loop');
    expect(mockCreate).toHaveBeenCalledWith({
      name: 'My loop',
      activity: 'run',
      points: previewRoute.points,
      cues: previewRoute.cues,
      source: 'generated',
    });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
