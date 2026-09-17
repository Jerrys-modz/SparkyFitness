import { randomUUID } from 'node:crypto';
import pg from 'pg';
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { endPool, getSystemClient } from '../db/poolManager.js';
import oidcProviderRepository from '../models/oidcProviderRepository.js';

vi.mock('../auth.js', () => ({
  syncTrustedProviders: vi.fn().mockResolvedValue(undefined),
}));

/** Runs only against a reachable test database with the provider schema applied. */
async function dbReachable(): Promise<boolean> {
  if (process.env.SKIP_RLS_MATRIX === '1') return false;
  if (!process.env.SPARKY_FITNESS_DB_HOST) return false;
  if (!/(^|[_-])test([_-]|$)/i.test(process.env.SPARKY_FITNESS_DB_NAME ?? ''))
    return false;
  const probe = new pg.Client({
    host: process.env.SPARKY_FITNESS_DB_HOST,
    port: Number(process.env.SPARKY_FITNESS_DB_PORT) || 5432,
    database: process.env.SPARKY_FITNESS_DB_NAME,
    user: process.env.SPARKY_FITNESS_DB_USER,
    password: process.env.SPARKY_FITNESS_DB_PASSWORD,
    connectionTimeoutMillis: 2000,
  });
  try {
    await probe.connect();
    await probe.query('SELECT id FROM public.sso_provider LIMIT 0');
    return true;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => {});
  }
}

const RUN = await dbReachable();
const fixtureIds: string[] = [];
const issuer = 'https://oidc.example.test';

/** Seeds a provider and records its row ID for scoped cleanup. */
async function seedProvider(
  providerId: string,
  id = randomUUID()
): Promise<string> {
  fixtureIds.push(id);
  const client = await getSystemClient();
  try {
    await client.query(
      `INSERT INTO sso_provider (id, provider_id, issuer, client_id, client_secret)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, providerId, issuer, 'original-client', 'original-secret']
    );
    return id;
  } finally {
    client.release();
  }
}

describe.runIf(RUN)('OIDC provider identity in PostgreSQL', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    const client = await getSystemClient();
    try {
      await client.query(
        'DELETE FROM sso_provider WHERE id = ANY($1::uuid[])',
        [fixtureIds]
      );
      fixtureIds.length = 0;
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await endPool();
  });

  it.each([false, true])(
    'prefers the exact name (prefixed: %s)',
    async (prefixed) => {
      const name = `test-${randomUUID()}`;
      const exact = prefixed ? `oidc-${name}` : name;
      const alias = prefixed ? name : `oidc-${name}`;
      await seedProvider(alias);
      const id = await seedProvider(exact);

      expect(
        await oidcProviderRepository.getOidcProviderById(exact)
      ).toMatchObject({
        id,
        provider_id: exact,
      });
    }
  );

  it('prefers the row ID over a provider named after that ID', async () => {
    const id = randomUUID();
    await seedProvider(id);
    const name = `test-${randomUUID()}`;
    await seedProvider(name, id);

    expect(await oidcProviderRepository.getOidcProviderById(id)).toMatchObject({
      id,
      provider_id: name,
    });
  });

  it.each(['prefixed alias', 'unprefixed alias', 'row ID'])(
    'updates through %s without changing the provider name',
    async (lookup) => {
      const name = `test-${randomUUID()}`;
      const stored = lookup === 'unprefixed alias' ? `oidc-${name}` : name;
      const id = await seedProvider(stored);
      const key =
        lookup === 'row ID'
          ? id
          : lookup === 'prefixed alias'
            ? `oidc-${name}`
            : name;

      expect(
        await oidcProviderRepository.getOidcProviderById(key)
      ).toMatchObject({
        id,
        provider_id: stored,
      });
      await oidcProviderRepository.updateOidcProvider(key, {
        issuer_url: issuer,
        domain: 'example.test',
        client_id: 'updated-client',
      });

      const client = await getSystemClient();
      try {
        const result = await client.query(
          'SELECT * FROM sso_provider WHERE id = $1',
          [id]
        );
        expect(result.rows[0]).toMatchObject({
          provider_id: stored,
          client_id: 'updated-client',
          client_secret: 'original-secret',
        });
        expect(
          result.rows[0].oidc_config.redirectURI.endsWith(
            `/api/auth/sso/callback/${stored}`
          )
        ).toBe(true);
      } finally {
        client.release();
      }
    }
  );
});
