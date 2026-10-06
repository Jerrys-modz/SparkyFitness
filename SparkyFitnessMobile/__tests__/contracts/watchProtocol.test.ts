import fs from 'fs';
import path from 'path';
import {
  PHONE_TO_WATCH_TYPES,
  WATCH_TO_PHONE_EVENTS,
  WatchToPhoneMessageSchema,
} from '@workspace/shared';

/**
 * The Apple Watch (Swift), Wear OS (Kotlin) and the phone bridge cannot import
 * the shared watch protocol, so this test is what keeps the three copies in
 * step. Fixtures in `shared/src/watch/fixtures` are the examples every
 * platform must be able to produce or consume.
 */

const ROOT = path.join(__dirname, '../..');
const FIXTURES = path.join(ROOT, '../shared/src/watch/fixtures');

const read = (...parts: string[]) =>
  fs.readFileSync(path.join(ROOT, ...parts), 'utf8');

function readTree(dir: string, ext: string): string {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .map((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return readTree(full, ext);
      return entry.name.endsWith(ext) ? fs.readFileSync(full, 'utf8') : '';
    })
    .join('\n');
}

/**
 * The text of every function that builds a `type` message, so a key counts
 * only if it is written where that message is built — not merely somewhere
 * in the platform's sources (`clientId` appears everywhere).
 */
function senderBlocks(
  source: string,
  anchor: string,
  fnStart: RegExp
): string[] {
  const starts = [...source.matchAll(fnStart)].map((m) => m.index ?? 0);
  const blocks: string[] = [];
  let at = source.indexOf(anchor);
  while (at !== -1) {
    const begin = Math.max(0, ...starts.filter((i) => i <= at));
    const end = Math.min(
      source.length,
      ...starts.filter((i) => i > at).concat(source.length)
    );
    blocks.push(source.slice(begin, end));
    at = source.indexOf(anchor, at + 1);
  }
  return blocks;
}

const swiftSender = read('targets/watch/Adapters/OutboundPayloads.swift');
const kotlinSender = readTree(
  path.join(ROOT, 'targets/wear/app/src/main'),
  '.kt'
);
const iosModule = read(
  'modules/watch-connectivity/ios/WatchConnectivityModule.swift'
);
const iosWatchRouter = read(
  'targets/watch/Infrastructure/WatchSessionManager.swift'
);
const androidModule = read(
  'modules/watch-connectivity/android/src/main/java/expo/modules/watchconnectivity/WatchConnectivityModule.kt'
);
const bridgeTypes = read('modules/watch-connectivity/index.ts');

// Keys a platform does not send today. Adding one here is a decision to
// diverge; the fix is normally to send it.
const NOT_SENT: Record<'swift' | 'kotlin', Record<string, string[]>> = {
  swift: {
    restChanged: ['clientId'],
    workoutStop: ['clientId'],
    heartRateBatch: ['ownerId'],
  },
  kotlin: {},
};

const fixtures = fs
  .readdirSync(FIXTURES)
  .filter((file) => file.endsWith('.json'))
  .map((file) => ({
    file,
    body: JSON.parse(
      fs.readFileSync(path.join(FIXTURES, file), 'utf8')
    ) as Record<string, unknown>,
  }));

const fullFixtures = fixtures.filter(
  ({ file }) => file.split('.').length === 2
);

describe('watch protocol fixtures', () => {
  it.each(fixtures)('$file parses against the shared schema', ({ body }) => {
    expect(WatchToPhoneMessageSchema.safeParse(body).success).toBe(true);
  });

  it.each(fixtures)('$file rejects an unknown key', ({ body }) => {
    expect(
      WatchToPhoneMessageSchema.safeParse({ ...body, surprise: 1 }).success
    ).toBe(false);
  });

  it('has a full fixture for every message type', () => {
    expect(fullFixtures.map(({ body }) => body.type).sort()).toEqual(
      Object.keys(WATCH_TO_PHONE_EVENTS).sort()
    );
  });
});

describe.each(fullFixtures)('$file across platforms', ({ body }) => {
  const type = body.type as string;
  const keys = Object.keys(body);

  it('is sent by the Apple Watch', () => {
    const blocks = senderBlocks(
      swiftSender,
      type === 'requestContext'
        ? `"type": Kind.contextRequest`
        : `"type": Kind.${type}`,
      /^\s*static (func|let) /gm
    );
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      for (const key of keys.filter((k) => k !== 'type')) {
        if (NOT_SENT.swift[type]?.includes(key)) continue;
        expect(block).toContain(`"${key}"`);
      }
    }
  });

  it('is sent by the Wear OS app', () => {
    const blocks = senderBlocks(
      kotlinSender,
      `.put("type", "${type}")`,
      /^\s*(private |internal )?fun /gm
    );
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      for (const key of keys.filter((k) => k !== 'type')) {
        if (NOT_SENT.kotlin[type]?.includes(key)) continue;
        expect(block).toContain(`"${key}"`);
      }
    }
  });

  it('is routed by the phone bridge on both platforms', () => {
    const event =
      WATCH_TO_PHONE_EVENTS[type as keyof typeof WATCH_TO_PHONE_EVENTS];
    expect(iosModule).toContain(`case "${type}"`);
    expect(bridgeTypes).toContain(`${event}:`);
    // Android routes by Data Layer path; the context request is answered by
    // its listener rather than emitted as an event.
    if (type !== 'requestContext')
      expect(androidModule).toContain(`"${event}"`);
  });
});

describe('phone to watch message types', () => {
  it.each([...PHONE_TO_WATCH_TYPES])(
    '%s is routed by the Apple Watch',
    (type) => {
      expect(iosModule).toContain(`"${type}"`);
      if (type === 'context' || type === 'ack') return;
      expect(iosWatchRouter).toContain(`case "${type}"`);
    }
  );

  it.each(['workoutStart', 'workoutStop', 'setTargets'])(
    '%s is sent to Wear OS',
    (type) => {
      expect(androidModule).toContain(`"${type}"`);
    }
  );
});
