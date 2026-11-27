import {
  insertRecords,
  deleteRecordsByUuids,
  readRecords,
} from 'react-native-health-connect';
import {
  loadHealthPreference,
  saveHealthPreference,
} from '../../../src/services/healthconnect/preferences';
import {
  vo2ClientRecordId,
  vo2ValueToRecord,
  writeVo2MaxForDate,
} from '../../../src/services/healthconnect/vo2Writeback';
import {
  isOwnWrittenVo2Record,
  transformHealthRecords,
} from '../../../src/services/healthconnect/dataTransformation';
import type { TransformedRecord } from '../../../src/types/healthRecords';

jest.mock('react-native-health-connect', () => ({
  insertRecords: jest.fn().mockResolvedValue([]),
  deleteRecordsByUuids: jest.fn().mockResolvedValue(undefined),
  readRecords: jest.fn().mockResolvedValue({ records: [] }),
  RecordingMethod: { RECORDING_METHOD_MANUAL_ENTRY: 3 },
  Vo2MaxMeasurementMethod: { OTHER: 0 },
}));
jest.mock('../../../src/services/healthconnect/preferences', () => ({
  loadHealthPreference: jest.fn(),
  saveHealthPreference: jest.fn(),
}));
jest.mock('../../../src/services/LogService', () => ({ addLog: jest.fn() }));

const mockInsert = insertRecords as jest.Mock;
const mockDelete = deleteRecordsByUuids as jest.Mock;
const mockRead = readRecords as jest.Mock;

let store: Record<string, unknown> = {};
beforeEach(() => {
  jest.clearAllMocks();
  store = {};
  (loadHealthPreference as jest.Mock).mockImplementation((key: string) =>
    Promise.resolve(key in store ? store[key] : null)
  );
  (saveHealthPreference as jest.Mock).mockImplementation(
    (key: string, value: unknown) => {
      store[key] = value;
      return Promise.resolve();
    }
  );
  mockRead.mockResolvedValue({ records: [] });
});

const DATE = '2026-06-01';
const AFTER = new Date(2026, 5, 2, 9);
const MORNING = new Date(2026, 5, 1, 9);
const NOON = new Date(2026, 5, 1, 12);

describe('vo2ValueToRecord', () => {
  it('writes an instantaneous Vo2Max record marked as this write-back', () => {
    expect(vo2ValueToRecord(DATE, 47.5, NOON, 1)).toMatchObject({
      recordType: 'Vo2Max',
      time: NOON.toISOString(),
      vo2MillilitersPerMinuteKilogram: 47.5,
      measurementMethod: 0,
      metadata: {
        clientRecordId: `sparky-vo2-${DATE}-1`,
        recordingMethod: 3,
      },
    });
  });
});

describe('isOwnWrittenVo2Record', () => {
  it('matches by client record id, not by package', () => {
    expect(
      isOwnWrittenVo2Record({
        metadata: { clientRecordId: vo2ClientRecordId(DATE, 2) },
      })
    ).toBe(true);
    expect(
      isOwnWrittenVo2Record({ metadata: { clientRecordId: 'other' } })
    ).toBe(false);
    expect(isOwnWrittenVo2Record({ metadata: { dataOrigin: 'app' } })).toBe(
      false
    );
    expect(isOwnWrittenVo2Record(null)).toBe(false);
  });

  it('is skipped when VO2 max is read back, while a device reading is kept', () => {
    const result = transformHealthRecords(
      [
        {
          time: '2026-06-01T12:00:00Z',
          vo2MillilitersPerMinuteKilogram: 47.5,
          metadata: { clientRecordId: `sparky-vo2-${DATE}-1` },
        },
        {
          time: '2026-06-01T08:00:00Z',
          vo2MillilitersPerMinuteKilogram: 52,
          metadata: { clientRecordId: 'watch-1' },
        },
      ],
      { recordType: 'Vo2Max', unit: 'ml/kg/min', type: 'vo2_max' }
    ) as TransformedRecord[];
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(52);
  });
});

describe('writeVo2MaxForDate', () => {
  it('writes the estimate once and skips an unchanged day', async () => {
    await writeVo2MaxForDate(DATE, 47.5, 1, true, AFTER);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockInsert.mock.calls[0][0][0]).toMatchObject({
      recordType: 'Vo2Max',
      vo2MillilitersPerMinuteKilogram: 47.5,
    });
    expect(store[`writebackVo2MaxIds:${DATE}`]).toEqual([
      `sparky-vo2-${DATE}-1`,
    ]);

    await writeVo2MaxForDate(DATE, 47.5, 2, true, AFTER);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('waits for noon on the day itself', async () => {
    await writeVo2MaxForDate(DATE, 47.5, 1, true, MORNING);
    expect(mockInsert).not.toHaveBeenCalled();
    expect(store[`writebackVo2MaxSig:${DATE}`]).toBeUndefined();
  });

  it('replaces the record when the estimate changes', async () => {
    await writeVo2MaxForDate(DATE, 47.5, 1, true, AFTER);
    await writeVo2MaxForDate(DATE, 48.1, 2, true, AFTER);
    expect(mockDelete).toHaveBeenCalledWith(
      'Vo2Max',
      [],
      [`sparky-vo2-${DATE}-1`]
    );
    expect(mockInsert).toHaveBeenCalledTimes(2);
    expect(store[`writebackVo2MaxIds:${DATE}`]).toEqual([
      `sparky-vo2-${DATE}-2`,
    ]);
  });

  it('removes the record when the day no longer has an estimate', async () => {
    await writeVo2MaxForDate(DATE, 47.5, 1, true, AFTER);
    await writeVo2MaxForDate(DATE, null, 2, true, AFTER);
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(store[`writebackVo2MaxIds:${DATE}`]).toEqual([]);
  });

  it('leaves a day alone when another app has a reading on it', async () => {
    mockRead.mockResolvedValue({
      records: [
        {
          vo2MillilitersPerMinuteKilogram: 52,
          metadata: { clientRecordId: 'watch-1' },
        },
      ],
    });
    await writeVo2MaxForDate(DATE, 47.5, 1, true, AFTER);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('does not count its own records as another app', async () => {
    mockRead.mockResolvedValue({
      records: [
        {
          vo2MillilitersPerMinuteKilogram: 47.5,
          metadata: { clientRecordId: `sparky-vo2-${DATE}-0` },
        },
      ],
    });
    await writeVo2MaxForDate(DATE, 47.5, 1, true, AFTER);
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it('writes anyway without read access', async () => {
    mockRead.mockResolvedValue({
      records: [{ vo2MillilitersPerMinuteKilogram: 52, metadata: {} }],
    });
    await writeVo2MaxForDate(DATE, 47.5, 1, false, AFTER);
    expect(mockRead).not.toHaveBeenCalled();
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });
});
