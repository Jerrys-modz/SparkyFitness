import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
// @ts-expect-error TS(7016): supertest does not provide type declarations here.
import request from 'supertest';
import oidcSettingsRoutes from '../routes/oidcSettingsRoutes.js';
import oidcProviderRepository from '../models/oidcProviderRepository.js';

vi.mock('../models/oidcProviderRepository.js', () => ({
  default: { updateOidcProvider: vi.fn() },
}));
vi.mock('../middleware/authMiddleware.js', () => ({
  isAdmin: (
    _req: express.Request,
    _res: express.Response,
    next: express.NextFunction
  ) => next(),
}));
vi.mock('../middleware/oidcLogoUpload.js', () => ({
  default: { single: () => vi.fn() },
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

const app = express();
app.use(express.json());
app.use('/admin/oidc-settings', oidcSettingsRoutes);

const provider = {
  issuer_url: 'https://identity.example.test',
  client_id: 'sparky',
};

describe('PUT /admin/oidc-settings/:id', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it.each([
    ['missing issuer URL', { client_id: 'sparky' }],
    ['null issuer URL', { ...provider, issuer_url: null }],
    ['numeric issuer URL', { ...provider, issuer_url: 123 }],
    ['empty issuer URL', { ...provider, issuer_url: '' }],
    ['missing client ID', { issuer_url: provider.issuer_url }],
    ['null client ID', { ...provider, client_id: null }],
    ['numeric client ID', { ...provider, client_id: 123 }],
    ['empty client ID', { ...provider, client_id: '' }],
  ])(
    'returns 400 for %s without updating the provider',
    async (_name, body) => {
      const response = await request(app)
        .put('/admin/oidc-settings/authentik')
        .send(body);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        message: 'Invalid OIDC provider settings.',
      });
      expect(oidcProviderRepository.updateOidcProvider).not.toHaveBeenCalled();
    }
  );

  it('returns 404 when the provider does not exist', async () => {
    vi.mocked(oidcProviderRepository.updateOidcProvider).mockRejectedValue(
      new Error('OIDC provider not found')
    );

    const response = await request(app)
      .put('/admin/oidc-settings/missing')
      .send(provider);

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ message: 'OIDC provider not found' });
  });

  it('retains 500 for unexpected failures', async () => {
    vi.mocked(oidcProviderRepository.updateOidcProvider).mockRejectedValue(
      new Error('Database unavailable')
    );

    const response = await request(app)
      .put('/admin/oidc-settings/authentik')
      .send(provider);

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      message: 'Error updating OIDC provider: Database unavailable',
    });
  });

  it('retains the successful update response and optional settings', async () => {
    const settings = {
      ...provider,
      domain: 'example.test',
      client_secret: 'new-secret',
      admin_group: null,
      is_active: false,
      redirect_uris: ['https://sparky.example.test/callback'],
    };
    vi.mocked(oidcProviderRepository.updateOidcProvider).mockResolvedValue({
      id: 'provider-id',
    });

    const response = await request(app)
      .put('/admin/oidc-settings/authentik')
      .send(settings);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      message: 'OIDC provider updated successfully',
    });
    expect(oidcProviderRepository.updateOidcProvider).toHaveBeenCalledWith(
      'authentik',
      settings
    );
  });
});
