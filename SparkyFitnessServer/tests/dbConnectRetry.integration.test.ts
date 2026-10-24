/**
 * Database connection loss against a real PostgreSQL.
 *
 * The server's pools reach PostgreSQL through an in-process TCP proxy, so a
 * test can cut every connection and refuse new ones (what a restart or a
 * primary switchover looks like from the client) without touching the shared
 * database server. Request-path acquires must ride that out within their
 * bound, and statements must not be replayed.
 */
import net, { type AddressInfo } from 'node:net';
import pg, { type PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const target = {
  host: process.env.SPARKY_FITNESS_DB_HOST,
  port: Number(process.env.SPARKY_FITNESS_DB_PORT) || 5432,
  database: process.env.SPARKY_FITNESS_DB_NAME,
  user: process.env.SPARKY_FITNESS_DB_USER,
  password: process.env.SPARKY_FITNESS_DB_PASSWORD,
};

async function isDbReachable(): Promise<boolean> {
  if (!target.host || process.env.SKIP_DB_CONNECT_RETRY_TEST === '1') {
    return false;
  }
  const probe = new pg.Client({ ...target, connectionTimeoutMillis: 2000 });
  try {
    await probe.connect();
    return true;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => {});
  }
}

/** Forwards TCP to PostgreSQL until stopped; stopping drops every connection. */
function createProxy() {
  const sockets = new Set<net.Socket>();
  const upstreamPorts = new Set<number>();
  let server: net.Server | undefined;
  let port = 0;

  function handle(downstream: net.Socket) {
    const upstream = net.connect(target.port, target.host);
    sockets.add(downstream);
    sockets.add(upstream);
    upstream.on('connect', () => upstreamPorts.add(upstream.localPort!));
    const close = () => {
      downstream.destroy();
      upstream.destroy();
      sockets.delete(downstream);
      sockets.delete(upstream);
    };
    for (const socket of [downstream, upstream]) {
      socket.on('error', close);
      socket.on('close', close);
    }
    downstream.pipe(upstream);
    upstream.pipe(downstream);
  }

  return {
    get port() {
      return port;
    },
    upstreamPorts,
    async start() {
      server = net.createServer(handle);
      await new Promise<void>((resolve) =>
        server!.listen(port, '127.0.0.1', resolve)
      );
      port = (server.address() as AddressInfo).port;
    },
    async stop() {
      const stopping = server;
      server = undefined;
      for (const socket of sockets) socket.destroy();
      sockets.clear();
      upstreamPorts.clear();
      await new Promise<void>((resolve) =>
        stopping ? stopping.close(() => resolve()) : resolve()
      );
    },
  };
}

const reachable = await isDbReachable();

describe.runIf(reachable)('database connection loss (real PostgreSQL)', () => {
  const proxy = createProxy();
  const savedEnv = {
    host: process.env.SPARKY_FITNESS_DB_HOST,
    port: process.env.SPARKY_FITNESS_DB_PORT,
  };
  let admin: pg.Client;
  let poolManager: typeof import('../db/poolManager.js');
  let authModule: typeof import('../auth.js');

  beforeAll(async () => {
    await proxy.start();
    // Pools read these at module load.
    process.env.SPARKY_FITNESS_DB_HOST = '127.0.0.1';
    process.env.SPARKY_FITNESS_DB_PORT = String(proxy.port);
    poolManager = await import('../db/poolManager.js');
    (await import('../db/connectRetry.js')).enableRequestConnectRetry();
    authModule = await import('../auth.js');

    admin = new pg.Client(target);
    await admin.connect();
  });

  afterAll(async () => {
    await admin?.end();
    await poolManager?.endPool();
    process.env.SPARKY_FITNESS_DB_HOST = savedEnv.host;
    process.env.SPARKY_FITNESS_DB_PORT = savedEnv.port;
    await proxy.stop();
  });

  /** Terminates every backend this process reached through the proxy. */
  async function terminateProxiedBackends(): Promise<number> {
    const { rows } = await admin.query<{ terminated: number }>(
      `SELECT count(*) FILTER (WHERE pg_terminate_backend(pid))::int AS terminated
       FROM pg_stat_activity
       WHERE client_port = ANY($1::int[])`,
      [[...proxy.upstreamPorts]]
    );
    return rows[0]!.terminated;
  }

  async function borrowAndRelease(count: number) {
    const clients = await Promise.all(
      Array.from({ length: count }, (_, index) =>
        index % 2
          ? poolManager.getSystemClient()
          : poolManager.getClient(crypto.randomUUID())
      )
    );
    for (const client of clients) client.release();
  }

  it('serves new requests after its pooled backends are terminated', async () => {
    await borrowAndRelease(6);
    expect(await terminateProxiedBackends()).toBeGreaterThan(0);

    const userIds = Array.from({ length: 12 }, () => crypto.randomUUID());
    const results = await Promise.all(
      userIds.map(async (userId) => {
        const client: PoolClient = await poolManager.getClient(userId);
        try {
          const { rows } = await client.query<{ user_id: string }>(
            "SELECT current_setting('app.user_id') AS user_id"
          );
          return rows[0]!.user_id;
        } finally {
          client.release();
        }
      })
    );
    expect(results).toEqual(userIds);
  });

  it('does not replay a statement whose connection died', async () => {
    const client = await poolManager.getClient(crypto.randomUUID());
    const marker = `replay-${crypto.randomUUID()}`;
    try {
      const running = client.query(`SELECT pg_sleep(5), '${marker}'`);
      // Attach the expectation before terminating: the FATAL can arrive while
      // waitFor is still polling, which Node would report as unhandled.
      const rejected = expect(running).rejects.toThrow();
      await vi.waitFor(
        async () => {
          expect(await terminateProxiedBackends()).toBeGreaterThan(0);
        },
        { timeout: 2000, interval: 50 }
      );
      await rejected;
    } finally {
      client.release(true);
    }
    const { rows } = await admin.query(
      'SELECT 1 FROM pg_stat_activity WHERE query LIKE $1 AND pid <> pg_backend_pid()',
      [`%${marker}%`]
    );
    expect(rows).toHaveLength(0);
  });

  it('rides out a database outage shorter than the retry bound', async () => {
    await borrowAndRelease(4);
    await proxy.stop();

    const started = Date.now();
    const pending = Promise.all([
      poolManager.getClient(crypto.randomUUID()),
      poolManager.getSystemClient(),
      // Better Auth acquires through its own pool's connect().
      authModule.auth.$context.then((ctx) =>
        ctx.adapter.findOne({
          model: 'session',
          where: [{ field: 'token', value: crypto.randomUUID() }],
        })
      ),
    ]);
    setTimeout(() => void proxy.start(), 3000);

    const [appClient, systemClient, session] = await pending;
    const elapsed = Date.now() - started;
    appClient.release();
    systemClient.release();
    expect(session).toBeNull();
    expect(elapsed).toBeGreaterThanOrEqual(2900);
    expect(elapsed).toBeLessThan(10_000);
  }, 20_000);

  it('gives up after the retry bound when the database stays away', async () => {
    await proxy.stop();
    // A client returned to the pool a moment before its connection dropped
    // is handed out until the pool sees the close; only getClient()
    // detects that case, through its context query.
    await vi.waitFor(() =>
      expect(poolManager.getRawOwnerPool().idleCount).toBe(0)
    );
    try {
      const started = Date.now();
      await expect(poolManager.getSystemClient()).rejects.toMatchObject({
        code: 'ECONNREFUSED',
      });
      const elapsed = Date.now() - started;
      expect(elapsed).toBeGreaterThanOrEqual(9_000);
      expect(elapsed).toBeLessThan(12_000);
    } finally {
      await proxy.start();
    }
  }, 20_000);
});
