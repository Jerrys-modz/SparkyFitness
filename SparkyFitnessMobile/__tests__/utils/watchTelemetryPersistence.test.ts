import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  deserializeWatchTelemetry,
  mergeWatchTelemetry,
  serializeWatchTelemetry,
  writeWatchTelemetry,
  type WatchTelemetrySessionState,
} from '../../src/utils/watchTelemetryPersistence';

function create(entryDate: string | null): WatchTelemetrySessionState {
  return {
    samples: new Map(),
    energy: new Map(),
    durations: new Map(),
    durationFromTimeline: false,
    handledBatchClientIds: new Set(),
    entryDate,
    unposted: false,
    endedAt: null,
    attribution: null,
  };
}

function session(
  overrides: Partial<WatchTelemetrySessionState> = {}
): WatchTelemetrySessionState {
  return { ...create('2026-09-25'), ...overrides };
}

describe('watchTelemetryPersistence', () => {
  it('round-trips an unposted session and drops an empty posted one', () => {
    const sessions = new Map<string, WatchTelemetrySessionState>([
      [
        'session-1',
        session({
          samples: new Map([
            [
              'ex-1',
              [
                { t: '2026-09-25T15:00:00.000Z', bpm: 120 },
                { t: '2026-09-25T15:00:10.000Z', bpm: 130 },
              ],
            ],
          ]),
          energy: new Map([['ex-1', 12.5]]),
          handledBatchClientIds: new Set(['batch-1']),
          unposted: true,
          endedAt: 1000,
        }),
      ],
      ['session-empty', session({ entryDate: null })],
    ]);

    const restored = deserializeWatchTelemetry(
      serializeWatchTelemetry(sessions),
      create
    );

    expect([...restored.keys()]).toEqual(['session-1']);
    expect(restored.get('session-1')?.samples.get('ex-1')).toEqual([
      { t: '2026-09-25T15:00:00.000Z', bpm: 120 },
      { t: '2026-09-25T15:00:10.000Z', bpm: 130 },
    ]);
    expect(restored.get('session-1')?.energy.get('ex-1')).toBe(12.5);
    expect(
      restored.get('session-1')?.handledBatchClientIds.has('batch-1')
    ).toBe(true);
    expect(restored.get('session-1')?.unposted).toBe(true);
  });

  it('fills an empty live session from storage and asks for a flush', () => {
    const live = new Map<string, WatchTelemetrySessionState>([
      ['session-1', create('2026-09-25')],
    ]);
    const saved = new Map<string, WatchTelemetrySessionState>([
      [
        'session-1',
        session({
          samples: new Map([
            [
              'ex-1',
              [
                { t: '2026-09-25T15:00:00.000Z', bpm: 120 },
                { t: '2026-09-25T15:00:10.000Z', bpm: 130 },
              ],
            ],
          ]),
          handledBatchClientIds: new Set(['batch-1']),
          unposted: true,
        }),
      ],
    ]);

    expect(mergeWatchTelemetry(live, saved, create)).toBe(true);
    expect(live.get('session-1')?.unposted).toBe(true);
    expect(live.get('session-1')?.samples.get('ex-1')).toHaveLength(2);
  });

  it('does not mark a session unposted again after a flush already cleared it', () => {
    const live = new Map<string, WatchTelemetrySessionState>([
      [
        'session-1',
        session({
          samples: new Map([
            [
              'ex-1',
              [
                { t: '2026-09-25T15:00:00.000Z', bpm: 120 },
                { t: '2026-09-25T15:00:10.000Z', bpm: 130 },
              ],
            ],
          ]),
          unposted: false,
        }),
      ],
    ]);
    const saved = new Map<string, WatchTelemetrySessionState>([
      [
        'session-1',
        session({
          samples: new Map([
            ['ex-1', [{ t: '2026-09-25T15:00:00.000Z', bpm: 120 }]],
          ]),
          unposted: true,
        }),
      ],
    ]);

    expect(mergeWatchTelemetry(live, saved, create)).toBe(false);
    expect(live.get('session-1')?.unposted).toBe(false);
  });

  it('adds a live batch onto the saved energy instead of keeping the larger', () => {
    const live = new Map<string, WatchTelemetrySessionState>([
      [
        'session-1',
        session({
          energy: new Map([['ex-1', 4]]),
          handledBatchClientIds: new Set(['batch-new']),
        }),
      ],
    ]);
    const saved = new Map<string, WatchTelemetrySessionState>([
      [
        'session-1',
        session({
          energy: new Map([['ex-1', 9]]),
          handledBatchClientIds: new Set(['batch-old']),
          unposted: true,
        }),
      ],
    ]);

    mergeWatchTelemetry(live, saved, create);
    expect(live.get('session-1')?.energy.get('ex-1')).toBe(13);
  });

  it('does not add saved energy whose batches the live session already applied', () => {
    const live = new Map<string, WatchTelemetrySessionState>([
      [
        'session-1',
        session({
          energy: new Map([['ex-1', 4]]),
          handledBatchClientIds: new Set(['batch-shared']),
        }),
      ],
    ]);
    const saved = new Map<string, WatchTelemetrySessionState>([
      [
        'session-1',
        session({
          energy: new Map([['ex-1', 9]]),
          handledBatchClientIds: new Set(['batch-old', 'batch-shared']),
        }),
      ],
    ]);

    mergeWatchTelemetry(live, saved, create);
    expect(live.get('session-1')?.energy.get('ex-1')).toBe(9);
  });

  it('lets the later snapshot win when an earlier write is still in flight', async () => {
    const written: string[] = [];
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started: () => void = () => {};
    const firstWriteStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const setItem = jest
      .spyOn(AsyncStorage, 'setItem')
      .mockImplementation(async (_key, value) => {
        written.push(value);
        if (written.length === 1) {
          started();
          await gate;
        }
      });

    const older = new Map<string, WatchTelemetrySessionState>([
      [
        'session-1',
        session({ unposted: true, energy: new Map([['ex-1', 4]]) }),
      ],
    ]);
    const newer = new Map<string, WatchTelemetrySessionState>([
      [
        'session-1',
        session({ unposted: false, energy: new Map([['ex-1', 4]]) }),
      ],
    ]);

    try {
      const first = writeWatchTelemetry(older);
      const second = writeWatchTelemetry(newer);
      await firstWriteStarted;
      release();
      await first;
      await second;

      expect(written).toHaveLength(2);
      expect(JSON.parse(written[1])['session-1'].unposted).toBe(false);
    } finally {
      setItem.mockRestore();
    }
  });
});
