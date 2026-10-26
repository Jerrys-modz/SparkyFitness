import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  runOutsideAbortScope,
  runWithAbortSignal,
  runWithActivityListener,
} from '../utils/abortScope.js';

const { pools } = vi.hoisted(() => ({
  pools: [] as Array<{
    options: { user?: string };
    connect: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock('pg', () => {
  class Pool {
    options: Record<string, unknown>;
    connect = vi.fn();
    on = vi.fn();
    constructor(options: Record<string, unknown>) {
      this.options = options;
      pools.push(this as never);
    }
  }
  const types = {
    setTypeParser: vi.fn(),
    builtins: { NUMERIC: 1700, DATE: 1082 },
  };
  return { default: { Pool, types } };
});
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

process.env.SPARKY_FITNESS_DB_USER = 'owner_user';
process.env.SPARKY_FITNESS_APP_DB_USER = 'app_user';
const { getClient, getSystemClient } = await import('../db/poolManager.js');
const [ownerPool, appPool] = pools;

function fakeClient() {
  return { query: vi.fn().mockResolvedValue({ rows: [] }), release: vi.fn() };
}

beforeEach(() => {
  ownerPool!.connect.mockReset();
  appPool!.connect.mockReset();
});

describe('connections inside stopped work', () => {
  it('refuses to acquire once the work was stopped', async () => {
    const controller = new AbortController();
    controller.abort(new Error('stopped'));

    await runWithAbortSignal(controller.signal, async () => {
      await expect(getClient('user-1')).rejects.toThrow('stopped');
      await expect(getSystemClient()).rejects.toThrow('stopped');
    });

    expect(appPool!.connect).not.toHaveBeenCalled();
    expect(ownerPool!.connect).not.toHaveBeenCalled();
  });

  it('releases a connection whose acquire outlasted the stop', async () => {
    const controller = new AbortController();
    const client = fakeClient();
    ownerPool!.connect.mockImplementationOnce(async () => {
      controller.abort(new Error('stopped'));
      return client;
    });

    await runWithAbortSignal(controller.signal, async () => {
      await expect(getSystemClient()).rejects.toThrow('stopped');
    });

    expect(client.release).toHaveBeenCalledOnce();
  });

  it('reports activity only for connections handed out', async () => {
    const onActivity = vi.fn();
    const controller = new AbortController();
    ownerPool!.connect.mockResolvedValue(fakeClient());
    appPool!.connect.mockResolvedValue(fakeClient());

    await runWithActivityListener(onActivity, () =>
      runWithAbortSignal(controller.signal, async () => {
        await getClient('user-1');
        await getSystemClient();
        expect(onActivity).toHaveBeenCalledTimes(2);
        controller.abort(new Error('stopped'));
        await expect(getSystemClient()).rejects.toThrow('stopped');
      })
    );

    expect(onActivity).toHaveBeenCalledTimes(2);
  });

  it('lets cleanup outside the scope connect without counting it as progress', async () => {
    const onActivity = vi.fn();
    const controller = new AbortController();
    controller.abort(new Error('stopped'));
    const client = fakeClient();
    ownerPool!.connect.mockResolvedValueOnce(client);

    await runWithActivityListener(onActivity, () =>
      runWithAbortSignal(controller.signal, () =>
        runOutsideAbortScope(async () => {
          await expect(getSystemClient()).resolves.toBe(client);
        })
      )
    );

    expect(onActivity).not.toHaveBeenCalled();
  });
});
