import { vi, beforeEach, describe, expect, it } from 'vitest';
import externalProviderRepository from '../models/externalProviderRepository.js';

const { post, isAxiosError } = vi.hoisted(() => ({
  post: vi.fn(),
  isAxiosError: (e: unknown) =>
    typeof e === 'object' && e !== null && 'isAxiosError' in e,
}));
vi.mock('axios', () => ({
  default: { create: () => ({ post }), isAxiosError },
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../security/encryption.js', () => ({
  ENCRYPTION_KEY: 'test-key',
  encrypt: vi.fn(),
  decrypt: vi.fn(),
}));
vi.mock('../models/externalProviderRepository.js', () => ({
  default: {
    getExternalDataProviderByUserIdAndProviderName: vi.fn(),
    replaceGarminTokensIfUnchanged: vi.fn(),
    updateExternalDataProvider: vi.fn(),
    createExternalDataProvider: vi.fn(),
  },
}));

const { default: service, GarminCourseError } =
  await import('../integrations/garminconnect/garminConnectService.js');

const route = {
  name: 'Loop',
  activity: 'run' as const,
  points: [
    { lat: 40, lon: -74 },
    { lat: 40.01, lon: -74 },
  ],
  cues: [{ index: 1, kind: 'left' as const }],
};

function axiosFailure(status?: number) {
  return { isAxiosError: true, message: 'x', response: status && { status } };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(
    externalProviderRepository.getExternalDataProviderByUserIdAndProviderName
  ).mockResolvedValue({ id: 'p1', garth_dump: 'tokens' } as never);
});

describe('sendRouteToGarmin', () => {
  it('posts the route and the stored tokens to the service', async () => {
    post.mockResolvedValue({ data: { format: 'gpx', course_id: 5 } });
    const out = await service.sendRouteToGarmin('u1', route);
    expect(out).toEqual({ status: 'sent', format: 'gpx', courseId: 5 });
    expect(post).toHaveBeenCalledWith(
      expect.stringContaining('/data/upload_course'),
      expect.objectContaining({ user_id: 'u1', tokens: 'tokens', ...route })
    );
  });

  it('fails as not_linked without a Garmin provider', async () => {
    vi.mocked(
      externalProviderRepository.getExternalDataProviderByUserIdAndProviderName
    ).mockResolvedValue(null as never);
    await expect(service.sendRouteToGarmin('u1', route)).rejects.toMatchObject({
      failure: 'not_linked',
    });
    expect(post).not.toHaveBeenCalled();
  });

  it.each([
    [401, 'auth'],
    [429, 'rate_limited'],
    [502, 'rejected'],
    [422, 'rejected'],
    [500, 'unavailable'],
    [undefined, 'unavailable'],
  ])('maps a service status of %s to %s', async (status, failure) => {
    post.mockRejectedValue(axiosFailure(status));
    const err = await service.sendRouteToGarmin('u1', route).catch((e) => e);
    expect(err).toBeInstanceOf(GarminCourseError);
    expect(err.failure).toBe(failure);
  });
});
