import { readFileSync } from 'node:fs';
import express from 'express';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'supertest'
import request from 'supertest';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { passkeyLoginGuard } from '../middleware/passkeyLoginGuard.js';
import globalSettingsRepository from '../models/globalSettingsRepository.js';

vi.mock('../auth.js', () => {
  const auth = { api: { getSession: vi.fn() }, options: {} };
  return {
    default: { auth },
    auth,
    cleanupSessions: vi.fn(),
    syncTrustedProviders: vi.fn(),
  };
});
vi.mock('../utils/bearerAuthBridge.js', () => ({
  bridgeBearerAuthHeader: vi.fn().mockResolvedValue({ apiKeyToken: null }),
}));
vi.mock('../models/globalSettingsRepository.js', () => ({
  default: {
    getGlobalSettings: vi.fn().mockResolvedValue({
      enable_email_password_login: true,
      is_oidc_active: false,
    }),
  },
}));
vi.mock('../models/oidcProviderRepository.js', () => ({
  default: { getOidcProviders: vi.fn().mockResolvedValue([]) },
}));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('passkey login guard', () => {
  const app = express();
  app.use(passkeyLoginGuard);
  app.use((_req, res) => {
    res.sendStatus(204);
  });

  it.each([
    ['get', '/api/auth/passkey/generate-authenticate-options'],
    ['post', '/api/auth/passkey/verify-authentication'],
    ['get', '/api/auth/passkey/generate-register-options'],
    ['post', '/api/auth/passkey/verify-registration'],
    ['post', '/api/auth/passkey/verify-authentication/'],
  ] as const)(
    'blocks %s %s when passkey login is disabled',
    async (method, path) => {
      vi.stubEnv('SPARKY_FITNESS_DISABLE_PASSKEY_LOGIN', 'true');
      const response = await request(app)[method](path);
      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        message: 'Passkey login is not enabled',
        code: 'PASSKEY_LOGIN_DISABLED',
      });
    }
  );

  it.each([
    ['get', '/api/auth/passkey/list-user-passkeys'],
    ['post', '/api/auth/passkey/delete-passkey'],
    ['post', '/api/auth/passkey/update-passkey'],
    ['post', '/api/auth/sign-in/email'],
  ] as const)(
    'leaves %s %s available while passkey login is disabled',
    async (method, path) => {
      vi.stubEnv('SPARKY_FITNESS_DISABLE_PASSKEY_LOGIN', 'true');
      expect((await request(app)[method](path)).status).toBe(204);
    }
  );

  it.each([undefined, 'false', ''])(
    'allows passkey sign-in when the setting is %j',
    async (value) => {
      vi.stubEnv('SPARKY_FITNESS_DISABLE_PASSKEY_LOGIN', value);
      expect(
        (await request(app).post('/api/auth/passkey/verify-authentication'))
          .status
      ).toBe(204);
    }
  );
});

describe('login settings', () => {
  const app = express();
  beforeAll(async () => {
    const { default: router } =
      await import('../routes/auth/authCoreRoutes.js');
    app.use('/api/auth', router);
  });

  it.each([
    [undefined, true],
    ['true', false],
  ])(
    'reports passkey.enabled when the setting is %j',
    async (value, enabled) => {
      vi.stubEnv('SPARKY_FITNESS_DISABLE_PASSKEY_LOGIN', value);
      const response = await request(app).get('/api/auth/settings');
      expect(response.status).toBe(200);
      expect(response.body.passkey).toEqual({ enabled });
    }
  );

  it('still reports passkey.enabled when the saved settings cannot be read', async () => {
    vi.stubEnv('SPARKY_FITNESS_DISABLE_PASSKEY_LOGIN', 'true');
    vi.mocked(globalSettingsRepository.getGlobalSettings).mockRejectedValueOnce(
      new Error('database away')
    );
    const response = await request(app).get('/api/auth/settings');
    expect(response.body.passkey).toEqual({ enabled: false });
  });
});

// The server boots on import, so check its middleware order without starting it.
it('mounts the passkey guard before forwarding requests to Better Auth', () => {
  const source = readFileSync(
    new URL('../SparkyFitnessServer.ts', import.meta.url),
    'utf8'
  );
  const guardAt = source.indexOf('app.use(passkeyLoginGuard)');
  const forwardingAt = source.indexOf(
    'return betterAuthHandlerInstance(req, res)'
  );
  expect(guardAt).toBeGreaterThan(-1);
  expect(guardAt).toBeLessThan(forwardingAt);
});
