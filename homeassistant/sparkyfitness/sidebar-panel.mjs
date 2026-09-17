#!/usr/bin/env node
// Registers (or removes) a storage-mode Lovelace dashboard so SparkyFitness
// shows up in the Home Assistant sidebar as a "Show in sidebar" toggle
// (SPARKY_SHOW_IN_SIDEBAR), instead of requiring the user to hand-edit
// configuration.yaml with a panel_iframe entry.
//
// This talks to Home Assistant Core's websocket API through the Supervisor
// proxy (requires `homeassistant_api: true` in config.yaml, which injects
// SUPERVISOR_TOKEN). It is best-effort: run.sh never fails add-on startup
// because of this script, it only logs a warning.

const SHOW = process.env.SPARKY_SHOW_IN_SIDEBAR === 'true';
const FRONTEND_URL = process.env.SPARKY_FITNESS_FRONTEND_URL;
const TOKEN = process.env.SUPERVISOR_TOKEN;
// Home Assistant's dashboard url_path validator requires at least one
// hyphen (it rejects single-word paths to avoid clashing with built-in
// panels), so a plain "sparkyfitness" is refused with invalid_format.
const URL_PATH = 'sparky-fitness';
const WS_URL = 'ws://supervisor/core/websocket';
const CONNECT_ATTEMPTS = 10;
const CONNECT_RETRY_MS = 3000;

function log(message) {
  console.log(`[sidebar-panel] ${message}`);
}

function waitForMessage(ws, predicate, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.removeEventListener('message', onMessage);
      reject(new Error('timed out waiting for a response'));
    }, timeoutMs);

    function onMessage(event) {
      const message = JSON.parse(event.data);
      if (predicate(message)) {
        clearTimeout(timer);
        ws.removeEventListener('message', onMessage);
        resolve(message);
      }
    }

    ws.addEventListener('message', onMessage);
  });
}

async function connectOnce() {
  const ws = new WebSocket(WS_URL);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve(), { once: true });
    ws.addEventListener(
      'error',
      () => reject(new Error('could not reach the Home Assistant Core websocket API')),
      { once: true },
    );
  });
  await waitForMessage(ws, (message) => message.type === 'auth_required');
  ws.send(JSON.stringify({ type: 'auth', access_token: TOKEN }));
  const authResult = await waitForMessage(
    ws,
    (message) => message.type === 'auth_ok' || message.type === 'auth_invalid',
  );
  if (authResult.type !== 'auth_ok') {
    throw new Error('Home Assistant rejected the Supervisor token');
  }
  return ws;
}

async function connect() {
  for (let attempt = 1; attempt <= CONNECT_ATTEMPTS; attempt += 1) {
    try {
      return await connectOnce();
    } catch (err) {
      if (attempt === CONNECT_ATTEMPTS) throw err;
      log(`Home Assistant API not ready yet (${err.message}); retrying...`);
      await new Promise((resolve) => setTimeout(resolve, CONNECT_RETRY_MS));
    }
  }
  throw new Error('unreachable');
}

let nextId = 1;

async function call(ws, payload) {
  const id = nextId;
  nextId += 1;
  ws.send(JSON.stringify({ id, ...payload }));
  const result = await waitForMessage(ws, (message) => message.id === id);
  if (!result.success) {
    throw new Error(`${payload.type} failed: ${JSON.stringify(result.error)}`);
  }
  return result.result;
}

async function main() {
  if (!TOKEN) {
    log('SUPERVISOR_TOKEN is not set (homeassistant_api permission missing); skipping.');
    return;
  }

  const ws = await connect();
  try {
    const dashboards = await call(ws, { type: 'lovelace/dashboards/list' });
    const existing = dashboards.find((dashboard) => dashboard.url_path === URL_PATH);

    if (!SHOW) {
      if (existing) {
        await call(ws, { type: 'lovelace/dashboards/delete', dashboard_id: existing.id });
        log('Removed the sidebar dashboard (Show in sidebar is off).');
      } else {
        log('Show in sidebar is off; nothing to do.');
      }
      return;
    }

    if (!FRONTEND_URL) {
      log('frontend_url is not set; skipping sidebar registration.');
      return;
    }

    if (!existing) {
      await call(ws, {
        type: 'lovelace/dashboards/create',
        url_path: URL_PATH,
        title: 'SparkyFitness',
        icon: 'mdi:dumbbell',
        show_in_sidebar: true,
        require_admin: false,
        mode: 'storage',
      });
      log('Created the sidebar dashboard.');
    } else if (!existing.show_in_sidebar) {
      await call(ws, {
        type: 'lovelace/dashboards/update',
        dashboard_id: existing.id,
        show_in_sidebar: true,
      });
      log('Re-enabled sidebar visibility on the existing dashboard.');
    }

    await call(ws, {
      type: 'lovelace/config/save',
      url_path: URL_PATH,
      config: {
        views: [
          {
            title: 'SparkyFitness',
            panel: true,
            cards: [{ type: 'iframe', url: FRONTEND_URL, aspect_ratio: '100%' }],
          },
        ],
      },
    });
    log(`Sidebar dashboard points at ${FRONTEND_URL}.`);
  } finally {
    ws.close();
  }
}

main().catch((err) => {
  log(`WARNING: could not manage the sidebar panel: ${err.message}`);
});
